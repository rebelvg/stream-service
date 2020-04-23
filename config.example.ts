export const config = {
  nms: {
    rtmp: {
      port: 1935,
      chunk_size: 60000,
      gop_cache: true,
      ping: 60,
      ping_timeout: 30,
    },
    http: {
      port: 8000,
      allow_origin: '*',
    },
    api: {
      token: 'nodemedia2017apikey',
    },
  },
  channels: {
    live: ['main'],
  },
  settings: {
    statsHost: 'http://localhost:8001',
    token: null,
  },
};
