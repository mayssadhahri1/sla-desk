// Routes /api/auth : inscription, connexion, profil

import { Router } from "express";
import { authenticate, currentUser } from "../middleware/auth.js";
import type { UserRepository } from "../repositories/userRepository.js";
import { loginSchema, registerSchema } from "../schemas.js";
import type { AuthService } from "../services/authService.js";

export function authRoutes(auth: AuthService, users: UserRepository): Router {
  const router = Router();

  router.post("/register", (req, res) => {
    const user = auth.register(registerSchema.parse(req.body));
    res.status(201).json({ token: auth.sign(user), user });
  });

  router.post("/login", (req, res) => {
    const { email, password } = loginSchema.parse(req.body);
    res.json(auth.login(email, password));
  });

  router.get("/me", authenticate(auth), (req, res) => {
    res.json(users.findById(currentUser(req).id));
  });

  return router;
}
