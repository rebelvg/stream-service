export const NMS_SETTINGS = {
  rtmp: {
    port: 1935,
    chunkSize: 60000,
    gopCache: true,
    ping: 60,
  },
  http: {
    port: 8000,
  },
  api: {
    token: 'api_token',
  },
};

export const STATS_API_SETTINGS = {
  host: 'http://localhost:8000',
  token: null,
};

export const ALLOWED_APPS = [
  'public',
  'private',
  'internal',
  'origin',
  'encode',
];
