const _ = require('lodash');

function getStreams(req, res, next) {
  const nms = this;

  let clients = {};

  nms.sessions.forEach(function(session, id) {
    clients[id] = {
      userId: session.userId
    };
  });

  res.json(clients);
}

exports.getStreams = getStreams;
