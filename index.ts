import { NodeMediaServer } from 'node-media-server';
import * as _ from 'lodash';
import * as fs from 'fs';
import axios, { AxiosError } from 'axios';

import { NMS_SETTINGS, STATS_API_SETTINGS } from './config';

let streamers = [];

async function updateStreamers() {
  try {
    const { data } = await axios.get(
      `${STATS_API_SETTINGS.host}/admin/streamers`,
      {
        headers: {
          token: STATS_API_SETTINGS.token,
        },
      },
    );

    streamers = data.streamers;
  } catch (error) {
    switch (true) {
      case error.code === 'ECONNREFUSED': {
        console.log('updateStreamers_econnrefused', error.message);
        break;
      }
      case (error as AxiosError).response?.status === 502: {
        console.log('updateStreamers_status_502', error.message);
        break;
      }
      default: {
        console.log('updateStreamers_error', error);
        break;
      }
    }
  }
}

const nms = new NodeMediaServer(NMS_SETTINGS);

nms.on('preConnect', (id, args) => {
  console.log(
    '[NodeEvent on preConnect]',
    `id=${id} args=${JSON.stringify(args)}`,
  );

  const session = nms.getSession(id);

  switch (session.constructor.name) {
    case 'NodeFlvSession': {
      const ip = _.get(session.req, ['ip']);
      const headerIp = _.get(session.req, ['headers', 'x-real-ip']);

      //nginx unix socket hack!
      Object.defineProperty(session.req.connection, 'remoteAddress', {
        get: () => {
          return ip || headerIp;
        },
      });

      console.log(
        session.TAG,
        'preConnect',
        _.get(session, ['req', 'connection', 'remoteAddress'], null),
      );

      break;
    }
  }

  session.userId = null;
});

nms.on('postConnect', (id, args) => {
  console.log(
    '[NodeEvent on postConnect]',
    `id=${id} args=${JSON.stringify(args)}`,
  );
});

nms.on('doneConnect', (id, args) => {
  console.log(
    '[NodeEvent on doneConnect]',
    `id=${id} args=${JSON.stringify(args)}`,
  );
});

nms.on('prePublish', (id, StreamPath, args) => {
  console.log(
    '[NodeEvent on prePublish]',
    `id=${id} StreamPath=${StreamPath} args=${JSON.stringify(args)}`,
  );

  const session = nms.getSession(id);

  const streamer = _.find(streamers, { streamKey: args.key });

  if (!streamer) {
    session.reject();

    return;
  }

  session.userId = streamer._id;
});

nms.on('postPublish', (id, StreamPath, args) => {
  console.log(
    '[NodeEvent on postPublish]',
    `id=${id} StreamPath=${StreamPath} args=${JSON.stringify(args)}`,
  );
});

nms.on('donePublish', (id, StreamPath, args) => {
  console.log(
    '[NodeEvent on donePublish]',
    `id=${id} StreamPath=${StreamPath} args=${JSON.stringify(args)}`,
  );
});

nms.on('prePlay', (id, StreamPath, args) => {
  console.log(
    '[NodeEvent on prePlay]',
    `id=${id} StreamPath=${StreamPath} args=${JSON.stringify(args)}`,
  );
});

nms.on('postPlay', (id, StreamPath, args) => {
  console.log(
    '[NodeEvent on postPlay]',
    `id=${id} StreamPath=${StreamPath} args=${JSON.stringify(args)}`,
  );
});

nms.on('donePlay', (id, StreamPath, args) => {
  console.log(
    '[NodeEvent on donePlay]',
    `id=${id} StreamPath=${StreamPath} args=${JSON.stringify(args)}`,
  );
});

(async () => {
  while (true) {
    await updateStreamers();

    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
})();

//remove previous unix socket
if (typeof NMS_SETTINGS.http.port === 'string') {
  if (fs.existsSync(NMS_SETTINGS.http.port)) {
    fs.unlinkSync(NMS_SETTINGS.http.port);
  }
}

nms.run();

//set unix socket rw rights for nginx
if (typeof NMS_SETTINGS.http.port === 'string') {
  fs.chmodSync(NMS_SETTINGS.http.port, '777');
}

const express = nms.nhs.expressApp;

express.set('trust proxy', true);

process.on('uncaughtException', (error) => {
  console.error('uncaughtException', error);

  process.exit(1);
});
