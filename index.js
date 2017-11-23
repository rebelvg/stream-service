const NodeMediaServer = require('node-media-server');
const _ = require('lodash');

const config = {
    rtmp: {
        port: 1935,
        chunk_size: 60000,
        gop_cache: true,
        ping: 60,
        ping_timeout: 30
    },
    http: {
        port: 8000,
        allow_origin: '*'
    },
    auth: {
        play: false,
        publish: false,
        secret: 'nodemedia2017privatekey'
    }
};

const channelsConfig = require('./config.json');

const nms = new NodeMediaServer(config);
nms.run();

nms.on('preConnect', (id, args) => {
    console.log(new Date(), '[NodeEvent on preConnect]', `id=${id} args=${JSON.stringify(args)}`);

    let session = nms.getSession(id);

    //timeout hack
    switch (session.constructor.name) {
        case 'NodeRtmpSession': {
            console.log(new Date(), 'rtmp preConnect', session.socket.remoteAddress);

            session.socket.setTimeout(20000);

            session.socket.on('timeout', () => {
                console.log(new Date(), `${id} socket timeout.`, session.socket.remoteAddress);

                let socket = session.socket;
                session.stop();
                socket.destroy();
            });

            break;
        }
        case 'NodeFlvSession': {
            console.log(new Date(), 'http preConnect', session.req.connection.remoteAddress);

            break;
        }
    }

    session.connectTime = new Date();
});

nms.on('postConnect', (id, args) => {
    console.log(new Date(), '[NodeEvent on postConnect]', `id=${id} args=${JSON.stringify(args)}`);

    let session = nms.getSession(id);

    //dirty hack
    if (session.appname) session.appname = session.appname.replace('/', '');
});

nms.on('doneConnect', (id, args) => {
    console.log(new Date(), '[NodeEvent on doneConnect]', `id=${id} args=${JSON.stringify(args)}`);
});

nms.on('prePublish', (id, StreamPath, args) => {
    console.log(new Date(), '[NodeEvent on prePublish]', `id=${id} StreamPath=${StreamPath} args=${JSON.stringify(args)}`);

    let session = nms.getSession(id);

    let regRes = /\/(.*)\/(.*)/gi.exec(StreamPath);

    if (regRes === null) return session.reject();

    if (!_.has(channelsConfig, [regRes[1], regRes[2]])) return session.reject();

    let password = _.get(channelsConfig, [regRes[1], regRes[2], 'publish'], null);

    if (password !== args.password) return session.reject();
});

nms.on('postPublish', (id, StreamPath, args) => {
    console.log(new Date(), '[NodeEvent on postPublish]', `id=${id} StreamPath=${StreamPath} args=${JSON.stringify(args)}`);
});

nms.on('donePublish', (id, StreamPath, args) => {
    console.log(new Date(), '[NodeEvent on donePublish]', `id=${id} StreamPath=${StreamPath} args=${JSON.stringify(args)}`);
});

nms.on('prePlay', (id, StreamPath, args) => {
    console.log(new Date(), '[NodeEvent on prePlay]', `id=${id} StreamPath=${StreamPath} args=${JSON.stringify(args)}`);

    let session = nms.getSession(id);

    let regRes = /\/(.*)\/(.*)/gi.exec(StreamPath);

    if (regRes === null) return session.reject();

    if (!_.has(channelsConfig, [regRes[1], regRes[2]])) return session.reject();
});

nms.on('postPlay', (id, StreamPath, args) => {
    console.log(new Date(), '[NodeEvent on postPlay]', `id=${id} StreamPath=${StreamPath} args=${JSON.stringify(args)}`);
});

nms.on('donePlay', (id, StreamPath, args) => {
    console.log(new Date(), '[NodeEvent on donePlay]', `id=${id} StreamPath=${StreamPath} args=${JSON.stringify(args)}`);
});

let router = nms.nhs.expressApp;

router.get('/channels', function (req, res, next) {
    let stats = {};

    let sessions = {};

    nms.sessions.forEach(function (session, id) {
        if (session.isStarting) {
            sessions[id] = session;

            let regRes = /\/(.*)\/(.*)/gi.exec(session.publishStreamPath || session.playStreamPath);

            if (regRes === null) return;

            let [app, channel] = _.slice(regRes, 1);

            _.set(stats, [app, channel], {
                publisher: null,
                subscribers: []
            });
        }
    });

    let publishers = _.filter(sessions, {'isPublishing': true});
    let subscribers = _.filter(sessions, (session) => {
        return !!session.playStreamPath;
    });

    _.forEach(publishers, (session, id) => {
        let regRes = /\/(.*)\/(.*)/gi.exec(session.publishStreamPath);

        if (regRes === null) return;

        let [app, channel] = _.slice(regRes, 1);

        _.set(stats, [app, channel, 'publisher'], {
            app: app,
            channel: channel,
            serverId: session.id,
            connectCreated: session.connectTime,
            bytes: session.socket.bytesRead,
            ip: session.socket.remoteAddress
        });
    });

    _.forEach(subscribers, (session) => {
        let regRes = /\/(.*)\/(.*)/gi.exec(session.playStreamPath);

        if (regRes === null) return;

        let [app, channel] = _.slice(regRes, 1);

        switch (session.constructor.name) {
            case 'NodeRtmpSession': {
                stats[app][channel]['subscribers'].push({
                    app: app,
                    channel: channel,
                    serverId: session.id,
                    connectCreated: session.connectTime,
                    bytes: session.socket.bytesWritten,
                    ip: session.socket.remoteAddress,
                    protocol: 'rtmp'
                });

                break;
            }
            case 'NodeFlvSession': {
                stats[app][channel]['subscribers'].push({
                    app: app,
                    channel: channel,
                    serverId: session.id,
                    connectCreated: session.connectTime,
                    bytes: session.req.connection.bytesWritten,
                    ip: session.req.connection.remoteAddress,
                    protocol: 'http'
                });

                break;
            }
        }
    });

    res.json(stats);
});

router.get('/channels/:app/:channel', function (req, res, next) {
    let channelStats = {
        isLive: false,
        viewers: 0,
        duration: 0,
        bitrate: 0
    };

    let playStreamPath = `/${req.params.app}/${req.params.channel}`;

    let publisherSession = nms.sessions.get(nms.publishers.get(playStreamPath));

    channelStats.isLive = !!publisherSession;
    channelStats.viewers = _.filter(Array.from(nms.sessions.values()), (session) => {
        return session.playStreamPath === playStreamPath;
    }).length;
    channelStats.duration = channelStats.isLive ? Math.ceil((Date.now() - publisherSession.startTimestamp) / 1000) : 0;
    channelStats.bitrate = channelStats.duration > 0 ? Math.ceil(_.get(publisherSession, ['socket', 'bytesRead'], 0) * 8 / channelStats.duration / 1024) : 0;

    res.json(channelStats);
});

nms.nrs.tcpServer.on('connection', function (socket) {
    console.log(new Date(), 'tcp onConnection', socket.remoteAddress);
});

nms.nhs.httpServer.on('request', function (req) {
    if (req.url.toLowerCase().includes('.flv')) console.log(new Date(), 'http onConnection', req.connection.remoteAddress, req.url);
});

nms.nhs.wsServer.on('connection', function (ws) {
    console.log(new Date(), 'ws onConnection', ws._socket.remoteAddress);
});

process.on('uncaughtException', (err) => {
    console.log(new Date(), 'server crashed.');
    console.error(new Date(), 'uncaughtException', err);

    throw err;
});

console.log(new Date(), 'server running.');
