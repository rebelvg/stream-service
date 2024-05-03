import { NodeMediaServer } from 'node-media-server';
import * as _ from 'lodash';
import * as fs from 'fs';
import axios, { AxiosError } from 'axios';

import { ALLOWED_APPS, NMS_SETTINGS, STATS_API_SETTINGS } from './config';

let lastCheckDate = new Date();

interface IStatsStreamersResponse {
  streamers: {
    _id: string;
    name: string;
    streamKey: string;
  }[];
}

let streamers: IStatsStreamersResponse['streamers'] = [];

let countLiveStreams = 0;

async function updateStreamers() {
  try {
    const { data } = await axios.get<IStatsStreamersResponse>(
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
  console.log('preConnect', id, args);

  const session = nms.getSession(id);

  session.addMetadata({
    userId: null,
  });
});

nms.on('postConnect', (id, args) => {
  console.log('postConnect', id, args);
});

nms.on('doneConnect', (id, args) => {
  console.log('doneConnect', id, args);
});

nms.on('prePublish', (id, streamPath, args) => {
  countLiveStreams++;

  console.log('prePublish', id, streamPath, args);

  const session = nms.getSession(id);

  const [, app, _channel] = streamPath.split('/');

  if (!ALLOWED_APPS.includes(app)) {
    session.reject();

    return;
  }

  const streamer = _.find(streamers, { streamKey: args.key });

  if (!streamer) {
    session.reject();

    return;
  }

  session.addMetadata({
    userId: streamer._id,
  });
});

nms.on('postPublish', (id, streamPath, args) => {
  console.log('postPublish', id, streamPath, args);
});

nms.on('donePublish', (id, streamPath, args) => {
  countLiveStreams--;

  if (countLiveStreams === 0) {
    lastCheckDate = new Date();
  }

  console.log('donePublish', id, streamPath, args);
});

nms.on('prePlay', (id, streamPath, args) => {
  console.log('prePlay', id, streamPath, args);
});

nms.on('postPlay', (id, streamPath, args) => {
  console.log('postPlay', id, streamPath, args);
});

nms.on('donePlay', (id, streamPath, args) => {
  console.log('donePlay', id, streamPath, args);
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

process.on('uncaughtException', (error) => {
  console.error('uncaughtException', error);

  process.exit(1);
});

setInterval(() => {
  console.log(process.memoryUsage());
}, 60 * 1000);

setInterval(() => {
  console.log('countLiveStreams', countLiveStreams, lastCheckDate);

  if (
    Date.now() - lastCheckDate.getTime() > 30 * 60 * 1000 &&
    countLiveStreams === 0
  ) {
    process.exit(0);
  }
}, 60 * 1000);
