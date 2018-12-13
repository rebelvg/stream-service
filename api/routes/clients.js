const express = require('express');

const streamController = require('../controllers/clients');
const auth = require('../middleware/auth');

let router = express.Router();

module.exports = function(nms) {
  router.get('/', auth.bind(nms), streamController.getStreams.bind(nms));

  return router;
};
