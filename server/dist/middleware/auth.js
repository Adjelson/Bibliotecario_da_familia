"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.auth = auth;
exports.requireRole = requireRole;
const jwt_1 = require("../utils/jwt");
const prisma_1 = require("../prisma");
/**
 * Lê o JWT, valida e carrega também a biblioteca do utilizador.
 * Injeta em req.auth = { userId, role, bibliotecaId }
 *
 * required = true -> 401 se não autenticado
 * required = false -> segue sem req.auth
 */
function auth(required = true) {
    return async (req, res, next) => {
        const hdr = req.headers.authorization || '';
        const token = hdr.startsWith('Bearer ') ? hdr.slice(7) : undefined;
        if (!token) {
            if (required)
                return res.status(401).json({ message: 'Sem token' });
            return next();
        }
        try {
            const decoded = (0, jwt_1.verifyAccess)(token);
            const subStr = decoded.sub ?? '';
            const userId = Number(subStr);
            if (!userId || Number.isNaN(userId)) {
                return res.status(401).json({ message: 'Token sem utilizador válido' });
            }
            // Garantir role e bibliotecaId reais vindos da BD (e se o user está ativo)
            const dbUser = await prisma_1.prisma.user.findUnique({
                where: { id: userId },
                select: {
                    id: true,
                    role: true,
                    isActive: true,
                    bibliotecaId: true,
                },
            });
            if (!dbUser || !dbUser.isActive) {
                return res.status(401).json({ message: 'Utilizador inativo ou inexistente' });
            }
            // Papel final vem SEMPRE da BD, não confiamos 100% no token
            const role = dbUser.role;
            const bibliotecaId = dbUser.bibliotecaId ?? null;
            req.auth = { userId, role, bibliotecaId };
            return next();
        }
        catch {
            return res.status(401).json({ message: 'Token inválido' });
        }
    };
}
/**
 * requireRole(...roles):
 * - Garante que req.auth existe (logo, auth() TEM que vir antes)
 * - Verifica se o role do utilizador está na lista permitida
 */
function requireRole(...roles) {
    return (req, res, next) => {
        const authCtx = req.auth;
        if (!authCtx) {
            return res.status(401).json({ message: 'Não autenticado' });
        }
        if (!roles.includes(authCtx.role)) {
            return res.status(403).json({ message: 'Sem permissão' });
        }
        return next();
    };
}
