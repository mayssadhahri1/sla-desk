// Assemblage de l'application : injection des dépendances, middlewares et routes

import path from "node:path";
import { fileURLToPath } from "node:url";
import express, { type Express } from "express";
import helmet from "helmet";
import type { AppConfig } from "./config.js";
import type { Database } from "./db/database.js";
import { SLA_POLICY } from "./domain/sla.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { TicketRepository } from "./repositories/ticketRepository.js";
import { UserRepository } from "./repositories/userRepository.js";
import { authRoutes } from "./routes/authRoutes.js";
import { statsRoutes } from "./routes/statsRoutes.js";
import { ticketRoutes } from "./routes/ticketRoutes.js";
import { userRoutes } from "./routes/userRoutes.js";
import { AuthService } from "./services/authService.js";
import { StatsService } from "./services/statsService.js";
import { TicketService } from "./services/ticketService.js";
import type { Clock } from "./types.js";

const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public");

export function createApp(db: Database, config: Pick<AppConfig, "jwtSecret" | "jwtExpiresIn">, clock: Clock = () => new Date()): Express {
  // Injection des dépendances « à la main » : chaque couche reçoit ce dont elle a besoin
  const users = new UserRepository(db);
  const ticketsRepo = new TicketRepository(db);
  const auth = new AuthService(users, config.jwtSecret, config.jwtExpiresIn, clock);
  const tickets = new TicketService(db, ticketsRepo, users, clock);
  const stats = new StatsService(ticketsRepo, clock);

  const app = express();
  app.disable("x-powered-by");
  app.use(helmet());
  app.use(express.json({ limit: "100kb" }));

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", time: clock().toISOString() });
  });
  app.get("/api/sla-policy", (_req, res) => {
    res.json(SLA_POLICY);
  });

  app.use("/api/auth", authRoutes(auth, users));
  app.use("/api/users", userRoutes(auth, users));
  app.use("/api/tickets", ticketRoutes(auth, tickets));
  app.use("/api/stats", statsRoutes(auth, stats));
  app.use("/api", notFoundHandler);

  app.use(express.static(PUBLIC_DIR));
  app.use(errorHandler);
  return app;
}
