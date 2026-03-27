"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// server/src/routes/auth.ts
const express_1 = require("express");
const prisma_1 = require("../prisma");
const zod_1 = require("zod");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jwt_1 = require("../utils/jwt");
const env_1 = require("../env");
const client_1 = require("@prisma/client");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
const envSameSiteRaw = String(env_1.ENV.COOKIE_SAMESITE ?? 'lax').toLowerCase();
const COOKIE_SAMESITE = envSameSiteRaw === 'none' ? 'none' : envSameSiteRaw === 'strict' ? 'strict' : 'lax';
// Se SameSite=None, secure tem de ser true. Senão, segue ENV ou NODE_ENV.
const COOKIE_SECURE = COOKIE_SAMESITE === 'none'
    ? true
    : env_1.ENV.COOKIE_SECURE === true ||
        String(process.env.NODE_ENV).toLowerCase() === 'production';
function setRefreshCookie(res, token) {
    res.cookie('refreshToken', token, {
        httpOnly: true,
        sameSite: COOKIE_SAMESITE,
        secure: COOKIE_SECURE,
        path: '/auth/refresh',
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 dias
    });
}
/* =======================================================================
   Segurança mínima no /auth/refresh (mitigar CSRF)
   - Se definires ENV.FRONTEND_ORIGIN, valida Origin/Referer.
   - Se não estiver definido, não bloqueia (comportamento antigo).
======================================================================= */
function originAllowed(req) {
    const front = env_1.ENV?.FRONTEND_ORIGIN ? String(env_1.ENV.FRONTEND_ORIGIN) : '';
    if (!front)
        return true; // sem origem configurada -> não valida
    const origin = String(req.headers.origin ?? '');
    const referer = String(req.headers.referer ?? '');
    const ok = (v) => v.startsWith(front);
    if (origin && !ok(origin))
        return false;
    if (referer && !ok(referer))
        return false;
    return true;
}
/* =======================================================================
   Zod Schemas
======================================================================= */
const FilhoSchema = zod_1.z.object({
    nome: zod_1.z.string().trim().min(1, 'nome obrigatório'),
    idade: zod_1.z.coerce.number().min(0).max(18),
    genero: zod_1.z.enum(['F', 'M', 'Outro']),
    // Mantido conforme usaste noutros ficheiros para não quebrar o Prisma
    perfilLeitor: zod_1.z.enum(['iniciante', 'Dislexia', 'autonomo']),
});
const RegisterBody = zod_1.z.object({
    name: zod_1.z.string().trim().min(2, 'Nome muito curto'),
    email: zod_1.z.string().email('Email inválido').transform((e) => e.trim().toLowerCase()),
    password: zod_1.z.string().min(6, 'Password muito curta'),
    telefone: zod_1.z.string().trim().min(3, 'Telefone obrigatório'),
    morada: zod_1.z.string().trim().min(3, 'Morada obrigatória'),
    interesses: zod_1.z.array(zod_1.z.string()).default([]),
    filhos: zod_1.z.array(FilhoSchema).default([]),
    bibliotecaId: zod_1.z.coerce.number().int().positive().optional(),
});
const LoginBody = zod_1.z.object({
    email: zod_1.z.string().email().transform((e) => e.trim().toLowerCase()),
    password: zod_1.z.string().min(1),
});
/* =======================================================================
   Helpers
======================================================================= */
function slimUser(u) {
    if (!u)
        return null;
    return {
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        bibliotecaId: u.bibliotecaId ?? null,
    };
}
/* =======================================================================
   POST /auth/register
   - cria user PAI + família + filhos
   - valida opcionalmente bibliotecaId
   - emite access e refresh (cookie httpOnly)
======================================================================= */
router.post('/register', async (req, res) => {
    const parsed = RegisterBody.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ message: 'Dados inválidos' });
    }
    const { name, email, password, telefone, morada, interesses, filhos, bibliotecaId, } = parsed.data;
    try {
        // valida bibliotecaId se vier
        if (bibliotecaId) {
            const bib = await prisma_1.prisma.biblioteca.findUnique({
                where: { id: bibliotecaId },
                select: { id: true },
            });
            if (!bib)
                return res.status(400).json({ message: 'Biblioteca inválida' });
        }
        const hash = await bcryptjs_1.default.hash(password.trim(), 10);
        const created = await prisma_1.prisma.$transaction(async (tx) => {
            // 1) user (PAI)
            const user = await tx.user.create({
                data: {
                    name: name.trim(),
                    email,
                    passwordHash: hash,
                    role: client_1.Role.PAI,
                    isActive: true,
                    bibliotecaId: bibliotecaId ?? null,
                },
            });
            // 2) família
            const familia = await tx.familia.create({
                data: {
                    userId: user.id,
                    telefone: telefone.trim(),
                    morada: morada.trim(),
                    interesses: interesses ?? [],
                },
            });
            // 3) filhos
            if (filhos?.length) {
                await tx.filho.createMany({
                    data: filhos.map((f) => ({
                        familiaId: familia.id,
                        nome: f.nome.trim(),
                        idade: f.idade,
                        genero: f.genero,
                        perfilLeitor: f.perfilLeitor,
                    })),
                });
            }
            return user;
        });
        const accessToken = (0, jwt_1.signAccess)({ sub: String(created.id), role: created.role });
        const refreshToken = (0, jwt_1.signRefresh)({ sub: String(created.id), role: created.role });
        setRefreshCookie(res, refreshToken);
        return res.status(201).json({
            user: slimUser(created),
            accessToken,
            refreshToken, // podes omitir se preferires só via cookie
        });
    }
    catch (err) {
        // conflito unique (email)
        if (err instanceof client_1.Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
            return res.status(409).json({ message: 'Email já registado' });
        }
        console.error('Erro /auth/register', err);
        return res.status(500).json({ message: 'Erro ao registar' });
    }
});
/* =======================================================================
   POST /auth/login
======================================================================= */
router.post('/login', async (req, res) => {
    const parsed = LoginBody.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ message: 'Dados inválidos' });
    }
    const { email, password } = parsed.data;
    const user = await prisma_1.prisma.user.findUnique({ where: { email } });
    if (!user || !user.isActive) {
        return res.status(401).json({ message: 'Credenciais inválidas' });
    }
    const ok = await bcryptjs_1.default.compare(password, user.passwordHash);
    if (!ok) {
        return res.status(401).json({ message: 'Credenciais inválidas' });
    }
    const accessToken = (0, jwt_1.signAccess)({ sub: String(user.id), role: user.role });
    const refreshToken = (0, jwt_1.signRefresh)({ sub: String(user.id), role: user.role });
    setRefreshCookie(res, refreshToken);
    return res.json({
        user: slimUser(user),
        accessToken,
        refreshToken, // opcional
    });
});
/* =======================================================================
   POST /auth/refresh
   - valida origem (se FRONTEND_ORIGIN definido)
   - verifica refresh do cookie
   - rota o refresh token
======================================================================= */
router.post('/refresh', async (req, res) => {
    if (!originAllowed(req)) {
        return res.status(403).json({ message: 'Origem inválida' });
    }
    const token = req.cookies?.refreshToken;
    if (!token) {
        return res.status(401).json({ message: 'Sem refresh token' });
    }
    try {
        const decoded = (0, jwt_1.verifyRefresh)(token);
        const userId = decoded.sub ? Number(decoded.sub) : undefined;
        if (!userId)
            throw new Error('invalid');
        const user = await prisma_1.prisma.user.findUnique({ where: { id: userId } });
        if (!user || !user.isActive) {
            return res.status(401).json({ message: 'Utilizador inválido' });
        }
        // rotação
        const accessToken = (0, jwt_1.signAccess)({ sub: String(user.id), role: user.role });
        const newRefresh = (0, jwt_1.signRefresh)({ sub: String(user.id), role: user.role });
        setRefreshCookie(res, newRefresh);
        return res.json({
            user: slimUser(user),
            accessToken,
            refreshToken: newRefresh, // opcional
        });
    }
    catch {
        return res.status(401).json({ message: 'Refresh token inválido' });
    }
});
/* =======================================================================
   GET /auth/me
   - requer auth
   - devolve shape esperado no front
======================================================================= */
router.get('/me', (0, auth_1.auth)(true), async (req, res) => {
    if (!req.auth) {
        return res.status(401).json({ message: 'Não autenticado' });
    }
    const user = await prisma_1.prisma.user.findUnique({
        where: { id: req.auth.userId },
        select: {
            id: true,
            name: true,
            email: true,
            role: true,
            isActive: true,
            bibliotecaId: true,
            familia: {
                select: {
                    id: true,
                    telefone: true,
                    morada: true,
                    interesses: true,
                },
            },
        },
    });
    if (!user) {
        return res.status(404).json({ message: 'Utilizador não encontrado' });
    }
    return res.json({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        isActive: user.isActive,
        active: user.isActive, // alias mantido
        bibliotecaId: user.bibliotecaId,
        familia: user.familia ?? null,
    });
});
/* =======================================================================
   POST /auth/logout
   - apaga cookie httpOnly
======================================================================= */
router.post('/logout', (_req, res) => {
    res.clearCookie('refreshToken', { path: '/auth/refresh' });
    res.status(200).json({ ok: true });
});
exports.default = router;
