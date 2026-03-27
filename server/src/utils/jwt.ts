// server/src/utils/jwt.ts
import jwt, { type SignOptions, type JwtPayload, type Secret } from 'jsonwebtoken'
import { ENV } from '../env'

type Expires = SignOptions['expiresIn']

export function signAccess(payload: object) {
  return jwt.sign(payload, ENV.JWT_ACCESS_SECRET as Secret, {
    expiresIn: ENV.JWT_ACCESS_EXPIRES as Expires,
  })
}

export function signRefresh(payload: object) {
  return jwt.sign(payload, ENV.JWT_REFRESH_SECRET as Secret, {
    expiresIn: ENV.JWT_REFRESH_EXPIRES as Expires,
  })
}

export function verifyAccess<T extends JwtPayload = JwtPayload>(token: string) {
  return jwt.verify(token, ENV.JWT_ACCESS_SECRET as Secret) as T
}

export function verifyRefresh<T extends JwtPayload = JwtPayload>(token: string) {
  return jwt.verify(token, ENV.JWT_REFRESH_SECRET as Secret) as T
}
