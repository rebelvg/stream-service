import * as fs from 'fs';
import { z } from 'zod';

const ConfigSchema = z.object({
  NMS_SETTINGS: z.object({
    rtmp: z.object({
      port: z.number().int().min(1).max(65535),
      chunkSize: z.number().int().positive(),
      gopCache: z.boolean(),
      ping: z.number().int().nonnegative(),
      host: z.string().min(1),
    }),
    http: z.object({
      port: z.number().int().min(1).max(65535),
      host: z.string().min(1),
    }),
    api: z.object({
      token: z.string().min(1),
    }),
  }),

  STATS_API_SETTINGS: z.object({
    host: z.string(),
    token: z.string().nullable(),
  }),

  ALLOWED_APPS: z.array(z.string().min(1)).nonempty(),
});

const config = ConfigSchema.parse(
  JSON.parse(fs.readFileSync('./config.json', { encoding: 'utf-8' })),
);

export const NMS_SETTINGS = config.NMS_SETTINGS;

export const STATS_API_SETTINGS = config.STATS_API_SETTINGS;

export const ALLOWED_APPS = config.ALLOWED_APPS;
