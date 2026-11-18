// Erreurs métier : chaque erreur porte son code HTTP, le middleware d'erreur fait le reste

export class AppError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const badRequest = (message: string) => new AppError(400, message, "BAD_REQUEST");
export const unauthorized = (message = "Authentification requise") => new AppError(401, message, "UNAUTHORIZED");
export const forbidden = (message = "Action non autorisée pour votre rôle") => new AppError(403, message, "FORBIDDEN");
export const notFound = (message = "Ressource introuvable") => new AppError(404, message, "NOT_FOUND");
export const conflict = (message: string) => new AppError(409, message, "CONFLICT");
