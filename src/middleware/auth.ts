// Middlewares d'authentification (JWT) et d'autorisation par rôle

import type { NextFunction, Request, Response } from "express";
import { forbidden, unauthorized } from "../errors.js";
import type { AuthService } from "../services/authService.js";
import type { AuthUser, Role } from "../types.js";

// On ajoute l'utilisateur connecté au type Request d'Express
declare module "express-serve-static-core" {
  interface Request {
    user?: AuthUser;
  }
}

export function authenticate(auth: AuthService) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const header = req.headers.authorization ?? "";
    const [scheme, token] = header.split(" ");
    if (scheme !== "Bearer" || !token) throw unauthorized();
    req.user = auth.verify(token);
    next();
  };
}

export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) throw forbidden();
    next();
  };
}

/** Récupère l'utilisateur connecté (garanti par le middleware authenticate) */
export function currentUser(req: Request): AuthUser {
  if (!req.user) throw unauthorized();
  return req.user;
}
