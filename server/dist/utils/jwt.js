"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.signAccess = signAccess;
exports.signRefresh = signRefresh;
exports.verifyAccess = verifyAccess;
exports.verifyRefresh = verifyRefresh;
// server/src/utils/jwt.ts
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const env_1 = require("../env");
function signAccess(payload) {
    return jsonwebtoken_1.default.sign(payload, env_1.ENV.JWT_ACCESS_SECRET, {
        expiresIn: env_1.ENV.JWT_ACCESS_EXPIRES,
    });
}
function signRefresh(payload) {
    return jsonwebtoken_1.default.sign(payload, env_1.ENV.JWT_REFRESH_SECRET, {
        expiresIn: env_1.ENV.JWT_REFRESH_EXPIRES,
    });
}
function verifyAccess(token) {
    return jsonwebtoken_1.default.verify(token, env_1.ENV.JWT_ACCESS_SECRET);
}
function verifyRefresh(token) {
    return jsonwebtoken_1.default.verify(token, env_1.ENV.JWT_REFRESH_SECRET);
}
