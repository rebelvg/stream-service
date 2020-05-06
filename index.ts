import * as NodeMediaServer from 'node-media-server';
import * as _ from 'lodash';
import * as fs from 'fs';
import axios from 'axios';

import { nms as nmsConfig, allowedApps, settings } from './config';

let streamers = [];

async function updateStreamers() {
  try {
    const { data } = await axios.get(`${settings.host}/admin/streamers`, {
      headers: {
        token: settings.token,
      },
    });

    streamers = data.streamers;
  } catch (error) {
    console.error(error);
  }
}

const nms = new NodeMediaServer(nmsConfig);

nms.on('preConnect', (id, args) => {
  console.log('[NodeEvent on preConnect]', `id=${id} args=${JSON.stringify(args)}`);

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

      console.log(session.TAG, 'preConnect', _.get(session, ['req', 'connection', 'remoteAddress'], null));

      break;
    }
  }

  session.userId = null;
});

nms.on('postConnect', (id, args) => {
  console.log('[NodeEvent on postConnect]', `id=${id} args=${JSON.stringify(args)}`);
});

nms.on('doneConnect', (id, args) => {
  console.log('[NodeEvent on doneConnect]', `id=${id} args=${JSON.stringify(args)}`);
});

nms.on('prePublish', (id, StreamPath, args) => {
  console.log('[NodeEvent on prePublish]', `id=${id} StreamPath=${StreamPath} args=${JSON.stringify(args)}`);

  const session = nms.getSession(id);

  const regRes = /\/(.*)\/(.*)/gi.exec(StreamPath);

  if (regRes === null) {
    session.reject();

    return;
  }

  const [, appName] = regRes;

  if (!allowedApps.includes(appName)) {
    session.reject();

    return;
  }

  const streamer = _.find(streamers, { streamKey: args.key });

  if (!streamer) {
    session.reject();

    return;
  }

  session.userId = streamer._id;
});

nms.on('postPublish', (id, StreamPath, args) => {
  console.log('[NodeEvent on postPublish]', `id=${id} StreamPath=${StreamPath} args=${JSON.stringify(args)}`);
});

nms.on('donePublish', (id, StreamPath, args) => {
  console.log('[NodeEvent on donePublish]', `id=${id} StreamPath=${StreamPath} args=${JSON.stringify(args)}`);
});

nms.on('prePlay', (id, StreamPath, args) => {
  console.log('[NodeEvent on prePlay]', `id=${id} StreamPath=${StreamPath} args=${JSON.stringify(args)}`);

  const session = nms.getSession(id);

  const regRes = /\/(.*)\/(.*)/gi.exec(StreamPath);

  if (regRes === null) {
    session.reject();

    return;
  }

  const [, appName] = regRes;

  if (!allowedApps.includes(appName)) {
    session.reject();

    return;
  }
});

nms.on('postPlay', (id, StreamPath, args) => {
  console.log('[NodeEvent on postPlay]', `id=${id} StreamPath=${StreamPath} args=${JSON.stringify(args)}`);
});

nms.on('donePlay', (id, StreamPath, args) => {
  console.log('[NodeEvent on donePlay]', `id=${id} StreamPath=${StreamPath} args=${JSON.stringify(args)}`);
});

(async () => {
  while (true) {
    await updateStreamers();

    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
})();

//remove previous unix socket
if (typeof nmsConfig.http.port === 'string') {
  if (fs.existsSync(nmsConfig.http.port)) {
    fs.unlinkSync(nmsConfig.http.port);
  }
}

nms.run();

//set unix socket rw rights for nginx
if (typeof nmsConfig.http.port === 'string') {
  fs.chmodSync(nmsConfig.http.port, '777');
}

const express = nms.nhs.expressApp;

express.set('trust proxy', true);
