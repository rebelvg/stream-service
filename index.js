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
    console.log('[NodeEvent on preConnect]', `id=${id} args=${JSON.stringify(args)}`);

    let session = nms.getSession(id);

    session.connectTime = new Date();
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

    let password = _.get(channelsConfig, [regRes[1], regRes[2], 'publish'], null);

    if (password !== args.password) return session.reject();
});

nms.on('postPublish', (id, StreamPath, args) => {
    console.log('[NodeEvent on postPublish]', `id=${id} StreamPath=${StreamPath} args=${JSON.stringify(args)}`);
});

nms.on('donePublish', (id, StreamPath, args) => {
    console.log('[NodeEvent on donePublish]', `id=${id} StreamPath=${StreamPath} args=${JSON.stringify(args)}`);
});

nms.on('prePlay', (id, StreamPath, args) => {
    console.log('[NodeEvent on prePlay]', `id=${id} StreamPath=${StreamPath} args=${JSON.stringify(args)}`);
    // let session = nms.getSession(id);
    // session.reject();
});

nms.on('postPlay', (id, StreamPath, args) => {
    console.log('[NodeEvent on postPlay]', `id=${id} StreamPath=${StreamPath} args=${JSON.stringify(args)}`);
});

nms.on('donePlay', (id, StreamPath, args) => {
    console.log('[NodeEvent on donePlay]', `id=${id} StreamPath=${StreamPath} args=${JSON.stringify(args)}`);
});

let router = nms.nhs.expressApp;

router.get('/channels', function (req, res, next) {
    let stats = {};

    nms.sessions.forEach(function (session, key) {
        console.log(session, key);

        stats[key] = {
            app: session.appname,
            playStreamPath: session.playStreamPath,
            publishStreamPath: session.publishStreamPath,
            startTime: session.connectTime,
            ip: _.get(session, ['socket', 'remoteAddress']) || _.get(session, ['req', 'connection', 'remoteAddress']),
            type: session.constructor.name
        };
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
