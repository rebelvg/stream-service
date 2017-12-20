const NodeMediaServer = require('node-media-server');
const _ = require('lodash');
const request = require('request');
require('longjohn');

const streams = require('./api/routes/streams');

const nmsConfig = require('./config.json').nms;
const channelsConfig = require('./config.json').channels;
const settings = require('./config.json').settings;

let streamers = [];

const nms = new NodeMediaServer(nmsConfig);
nms.run();

function updateStreams() {
    request.get(`http://${settings.statsHost}/admin/streamers`, {
        headers: {
            token: settings.token
        },
        json: true
    }, function (err, res, body) {
        if (err) return console.error(err);
        if (res.statusCode !== 200) return console.log(body);

        streamers = body.streamers;
    });
}

nms.on('preConnect', (id, args) => {
    console.log('[NodeEvent on preConnect]', `id=${id} args=${JSON.stringify(args)}`);

    let session = nms.getSession(id);

    //timeout hack
    switch (session.constructor.name) {
        case 'NodeRtmpSession': {
            console.log('rtmp preConnect', id, session.socket.remoteAddress);

            session.socket.setTimeout(20000);

            session.socket.on('timeout', () => {
                try {
                    console.log(`${id} socket timeout.`, _.get(session, ['socket', 'remoteAddress'], null));

                    let socket = session.socket;
                    session.stop();
                    socket.destroy();
                } catch (e) {
                    console.log(e);
                }
            });

            break;
        }
        case 'NodeFlvSession': {
            console.log(session.TAG, 'preConnect', _.get(session, ['req', 'connection', 'remoteAddress'], null));

            break;
        }
    }
});

nms.on('postConnect', (id, args) => {
    console.log('[NodeEvent on postConnect]', `id=${id} args=${JSON.stringify(args)}`);
});

nms.on('doneConnect', (id, args) => {
    console.log('[NodeEvent on doneConnect]', `id=${id} args=${JSON.stringify(args)}`);
});

nms.on('prePublish', (id, StreamPath, args) => {
    console.log('[NodeEvent on prePublish]', `id=${id} StreamPath=${StreamPath} args=${JSON.stringify(args)}`);

    let session = nms.getSession(id);

    let regRes = /\/(.*)\/(.*)/gi.exec(StreamPath);

    if (regRes === null) return session.reject();

    if (!_.has(channelsConfig, [regRes[1], regRes[2]])) return session.reject();

    let streamer = _.find(streamers, {streamKey: args.key});

    if (!streamer) return session.reject();

    session.streamerId = streamer._id;
});

nms.on('postPublish', (id, StreamPath, args) => {
    console.log('[NodeEvent on postPublish]', `id=${id} StreamPath=${StreamPath} args=${JSON.stringify(args)}`);
});

nms.on('donePublish', (id, StreamPath, args) => {
    console.log('[NodeEvent on donePublish]', `id=${id} StreamPath=${StreamPath} args=${JSON.stringify(args)}`);
});

nms.on('prePlay', (id, StreamPath, args) => {
    console.log('[NodeEvent on prePlay]', `id=${id} StreamPath=${StreamPath} args=${JSON.stringify(args)}`);

    let session = nms.getSession(id);

    let regRes = /\/(.*)\/(.*)/gi.exec(StreamPath);

    if (regRes === null) return session.reject();

    if (!_.has(channelsConfig, [regRes[1], regRes[2]])) return session.reject();
});

nms.on('postPlay', (id, StreamPath, args) => {
    console.log('[NodeEvent on postPlay]', `id=${id} StreamPath=${StreamPath} args=${JSON.stringify(args)}`);
});

nms.on('donePlay', (id, StreamPath, args) => {
    console.log('[NodeEvent on donePlay]', `id=${id} StreamPath=${StreamPath} args=${JSON.stringify(args)}`);
});

process.on('uncaughtException', (err) => {
    console.log('server crashed.');
    console.log('uncaughtException', err);

    process.exit();
});

updateStreams();

setInterval(updateStreams, 5000);

let express = nms.nhs.expressApp;

express.use('/api_v2/streams', streams(nms));

console.log('server running.');
