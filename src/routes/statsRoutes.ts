// Route /api/stats : indicateurs du tableau de bord

import { Router } from "express";
import { authenticate, currentUser } from "../middleware/auth.js";
import type { AuthService } from "../services/authService.js";
import type { StatsService } from "../services/statsService.js";

export function statsRoutes(auth: AuthService, stats: StatsService): Router {
  const router = Router();
  router.get("/", authenticate(auth), (req, res) => {
    res.json(stats.dashboard(currentUser(req)));
  });
  return router;
}
