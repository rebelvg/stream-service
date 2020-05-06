export const nms = {
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
    token: 'api_token',
  },
};
export const allowedApps = ['live'];
export const settings = {
  host: 'http://localhost:8000',
  token: null,
};
