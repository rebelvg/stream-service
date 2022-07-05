import * as fs from 'fs';

const configJson = JSON.parse(
  fs.readFileSync('./config.json', { encoding: 'utf-8' }),
);

export const NMS_SETTINGS = configJson.NMS_SETTINGS;

export const STATS_API_SETTINGS = configJson.STATS_API_SETTINGS;

export const ALLOWED_APPS = configJson.ALLOWED_APPS;
