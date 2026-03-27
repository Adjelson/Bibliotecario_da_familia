// server/src/env.ts
import 'dotenv/config'
import { z } from 'zod'

const schema = z.object({
  PORT: z.coerce.number().default(4000),
  NODE_ENV: z.enum(['development','test','production']).default('development'),
  DATABASE_URL: z.string().min(1),

  JWT_ACCESS_SECRET: z.string().min(10),
  JWT_ACCESS_EXPIRES: z.string().default('15m'),

  JWT_REFRESH_SECRET: z.string().min(10),
  JWT_REFRESH_EXPIRES: z.string().default('7d'),

  CORS_ORIGIN: z.string().url().default('http://localhost:5173'),
  FRONTEND_ORIGIN: z.string().url().optional(),
  BCRYPT_SALT_ROUNDS: z.coerce.number().default(10),
  COOKIE_SECURE: z
    .string()
    .optional()
    .transform((v) => v === 'true')
    .pipe(z.boolean().default(false)),
  COOKIE_SAMESITE: z.enum(['lax', 'strict', 'none']).default('lax'),
})

export const ENV = schema.parse(process.env)
