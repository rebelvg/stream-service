const NodeMediaServer = require('node-media-server');
const _ = require('lodash');
const fs = require('fs');
const axios = require('axios');

const nmsConfig = require('./config.json').nms;
const channelsConfig = require('./config.json').channels;
const settings = require('./config.json').settings;

let streamers = [];

function updateStreams() {
  axios
    .get(`${settings.statsHost}/admin/streamers`, {
      headers: {
        token: settings.token
      }
    })
    .then(({ data }) => {
      streamers = data.streamers;
    })
    .catch(err => {
      console.error(err);
    });
}

const nms = new NodeMediaServer(nmsConfig);

nms.on('preConnect', (id, args) => {
  console.log('[NodeEvent on preConnect]', `id=${id} args=${JSON.stringify(args)}`);

  const session = nms.getSession(id);

  //timeout hack
  switch (session.constructor.name) {
    case 'NodeRtmpSession': {
      console.log('rtmp preConnect', id, session.socket.remoteAddress);

      session.socket.setTimeout(20000);

      session.socket.on('timeout', () => {
        try {
          console.log(`${id} socket timeout.`, _.get(session, ['socket', 'remoteAddress'], null));

          const socket = session.socket;

          session.stop();

          socket.destroy();
        } catch (e) {
          console.error(e);
        }
      });

      break;
    }
    case 'NodeFlvSession': {
      const ip = _.get(session.req, ['ip']);
      const headerIp = _.get(session.req, ['headers', 'x-real-ip']);

      //unix socket hack!
      Object.defineProperty(session.req.connection, 'remoteAddress', {
        get: () => {
          return ip || headerIp;
        }
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

  if (regRes === null) return session.reject();

  const [path, appName, channelName] = regRes;

  if (!_.get(channelsConfig, [appName], []).includes(channelName)) return session.reject();

  const streamer = _.find(streamers, { streamKey: args.key });

  if (!streamer) return session.reject();

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

  if (regRes === null) return session.reject();

  const [path, appName, channelName] = regRes;

  if (!_.get(channelsConfig, [appName], []).includes(channelName)) return session.reject();
});

nms.on('postPlay', (id, StreamPath, args) => {
  console.log('[NodeEvent on postPlay]', `id=${id} StreamPath=${StreamPath} args=${JSON.stringify(args)}`);
});

nms.on('donePlay', (id, StreamPath, args) => {
  console.log('[NodeEvent on donePlay]', `id=${id} StreamPath=${StreamPath} args=${JSON.stringify(args)}`);
});

updateStreams();

setInterval(updateStreams, 5000);

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
