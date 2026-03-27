"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ENV = void 0;
// server/src/env.ts
require("dotenv/config");
const zod_1 = require("zod");
const schema = zod_1.z.object({
    PORT: zod_1.z.coerce.number().default(4000),
    NODE_ENV: zod_1.z.enum(['development', 'test', 'production']).default('development'),
    DATABASE_URL: zod_1.z.string().min(1),
    JWT_ACCESS_SECRET: zod_1.z.string().min(10),
    JWT_ACCESS_EXPIRES: zod_1.z.string().default('15m'),
    JWT_REFRESH_SECRET: zod_1.z.string().min(10),
    JWT_REFRESH_EXPIRES: zod_1.z.string().default('7d'),
    CORS_ORIGIN: zod_1.z.string().url().default('http://localhost:5173'),
    FRONTEND_ORIGIN: zod_1.z.string().url().optional(),
    BCRYPT_SALT_ROUNDS: zod_1.z.coerce.number().default(10),
    COOKIE_SECURE: zod_1.z
        .string()
        .optional()
        .transform((v) => v === 'true')
        .pipe(zod_1.z.boolean().default(false)),
    COOKIE_SAMESITE: zod_1.z.enum(['lax', 'strict', 'none']).default('lax'),
});
exports.ENV = schema.parse(process.env);
