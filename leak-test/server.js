// Minimal accept-all node-media-server instance for the leak repro.
// Runs as a child process so the orchestrator can measure ITS rss in isolation.
const { NodeMediaServer } = require('node-media-server');

const nms = new NodeMediaServer({
  rtmp: { port: 19350, chunkSize: 60000, gopCache: true, ping: 60, host: '0.0.0.0' },
  http: { port: 18200, host: '0.0.0.0' },
  api: { token: null },
});

// No reject handlers -> accepts every connect/publish/play (isolates the NMS
// broadcast path from stream-service business logic).
nms.run();

process.on('SIGTERM', () => process.exit(0));
process.on('SIGINT', () => process.exit(0));
console.log('TEST_SERVER_READY pid=' + process.pid);
