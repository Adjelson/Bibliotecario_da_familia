"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireRoles = requireRoles;
/**
 * Garante que o utilizador autenticado tem um dos perfis exigidos.
 * Assume que o `auth()` já preencheu `req.auth` com { userId, role }.
 */
function requireRoles(roles) {
    return (req, res, next) => {
        // adapta ao que o teu auth realmente coloca no request
        const auth = req.auth;
        if (!auth?.role)
            return res.status(401).json({ message: 'Não autenticado' });
        if (!roles.includes(auth.role))
            return res.status(403).json({ message: 'Sem permissão' });
        next();
    };
}
