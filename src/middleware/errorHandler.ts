// Gestion centralisée des erreurs : réponses JSON homogènes, pas de fuite d'informations internes

import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { AppError } from "../errors.js";

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({ error: { code: "NOT_FOUND", message: `Route introuvable : ${req.method} ${req.path}` } });
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: err.issues[0]?.message ?? "Données invalides",
        details: err.issues.map((i) => ({ field: i.path.join("."), message: i.message })),
      },
    });
    return;
  }
  if (err instanceof AppError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message } });
    return;
  }
  // JSON mal formé envoyé par le client
  if (err instanceof SyntaxError && "body" in err) {
    res.status(400).json({ error: { code: "BAD_JSON", message: "Corps JSON invalide" } });
    return;
  }
  console.error(err);
  res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Erreur interne du serveur" } });
}
