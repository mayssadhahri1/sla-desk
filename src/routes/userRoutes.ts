// Routes /api/users : liste des agents et création de comptes par l'administrateur

import { Router } from "express";
import { authenticate, requireRole } from "../middleware/auth.js";
import type { UserRepository } from "../repositories/userRepository.js";
import { createUserSchema } from "../schemas.js";
import type { AuthService } from "../services/authService.js";

export function userRoutes(auth: AuthService, users: UserRepository): Router {
  const router = Router();
  router.use(authenticate(auth));

  // Liste des agents, pour le menu d'affectation
  router.get("/agents", requireRole("agent", "admin"), (_req, res) => {
    res.json(users.listByRoles(["agent", "admin"]));
  });

  router.post("/", requireRole("admin"), (req, res) => {
    res.status(201).json(auth.register(createUserSchema.parse(req.body)));
  });

  return router;
}
