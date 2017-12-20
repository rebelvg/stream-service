const _ = require('lodash');

function getStreams(req, res, next) {
    const nms = this;

    let stats = {};

    nms.sessions.forEach(function (session, id) {
        if (session.isStarting) {
            let regRes = /\/(.*)\/(.*)/gi.exec(session.publishStreamPath || session.playStreamPath);

            if (regRes === null) return;

            let [app, stream] = _.slice(regRes, 1);

            if (!_.get(stats, [app, stream])) {
                _.set(stats, [app, stream], {
                    publisher: null,
                    subscribers: []
                });
            }

            switch (true) {
                case session.isPublishing: {
                    _.set(stats, [app, stream, 'publisher'], {
                        app: app,
                        stream: stream,
                        clientId: session.id,
                        connectCreated: session.connectTime,
                        bytes: session.socket.bytesRead,
                        ip: session.socket.remoteAddress,
                        audio: session.audioCodec > 0 ? {
                            codec: session.audioCodecName,
                            profile: session.audioProfileName,
                            samplerate: session.audioSamplerate,
                            channels: session.audioChannels
                        } : null,
                        video: session.videoCodec > 0 ? {
                            codec: session.videoCodecName,
                            size: session.videoSize,
                            fps: session.videoFps
                        } : null,
                        streamerId: session.streamerId
                    });

                    break;
                }
                case !!session.playStreamPath: {
                    switch (session.constructor.name) {
                        case 'NodeRtmpSession': {
                            stats[app][stream]['subscribers'].push({
                                app: app,
                                stream: stream,
                                clientId: session.id,
                                connectCreated: session.connectTime,
                                bytes: session.socket.bytesWritten,
                                ip: session.socket.remoteAddress,
                                protocol: 'rtmp'
                            });

                            break;
                        }
                        case 'NodeFlvSession': {
                            stats[app][stream]['subscribers'].push({
                                app: app,
                                stream: stream,
                                clientId: session.id,
                                connectCreated: session.connectTime,
                                bytes: session.req.connection.bytesWritten,
                                ip: session.req.connection.remoteAddress,
                                protocol: session.TAG === 'websocket-flv' ? 'ws' : 'http'
                            });

                            break;
                        }
                    }

                    break;
                }
            }
        }
    });

    res.json(stats);
}

exports.getStreams = getStreams;
