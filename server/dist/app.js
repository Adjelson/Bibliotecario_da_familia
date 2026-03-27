"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.app = void 0;
// server/src/app.ts
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const helmet_1 = __importDefault(require("helmet"));
const path_1 = __importDefault(require("path"));
const env_1 = require("./env");
const index_1 = require("./routes/index");
const zod_1 = require("zod");
exports.app = (0, express_1.default)();
exports.app.disable('x-powered-by');
// segurança
exports.app.use((0, helmet_1.default)({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
}));
// body parsers
exports.app.use(express_1.default.json({ limit: '10mb' }));
exports.app.use(express_1.default.urlencoded({ extended: true }));
exports.app.use((0, cookie_parser_1.default)());
// CORS
exports.app.use((0, cors_1.default)({
    origin: env_1.ENV.CORS_ORIGIN,
    credentials: true,
}));
// estáticos
exports.app.use('/uploads', express_1.default.static(path_1.default.join(process.cwd(), 'uploads'), {
    index: false,
    maxAge: '7d',
}));
// API principal
exports.app.use('/', index_1.router);
// 404 default -> JSON
exports.app.use((_req, res) => {
    res.status(404).json({ message: 'Rota não encontrada' });
});
// erro genérico -> JSON
exports.app.use((err, _req, res, _next) => {
    if (err instanceof zod_1.ZodError) {
        return res.status(400).json({
            message: 'Dados inválidos',
            errors: err.flatten?.().fieldErrors ?? err.issues,
        });
    }
    if (err?.code === 'P2002') {
        return res.status(409).json({ message: 'Violação de unicidade (duplicado).' });
    }
    console.error(err);
    res.status(err?.status || 500).json({ message: err?.message || 'Erro interno' });
});
