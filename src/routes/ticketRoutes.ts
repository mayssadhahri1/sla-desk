// Routes /api/tickets : création, liste filtrée, détail, statut, affectation et commentaires

import { Router } from "express";
import { authenticate, currentUser, requireRole } from "../middleware/auth.js";
import {
  assignSchema,
  commentSchema,
  createTicketSchema,
  idParamSchema,
  listTicketsSchema,
  statusSchema,
} from "../schemas.js";
import type { AuthService } from "../services/authService.js";
import type { TicketService } from "../services/ticketService.js";

export function ticketRoutes(auth: AuthService, tickets: TicketService): Router {
  const router = Router();
  router.use(authenticate(auth));

  router.get("/", (req, res) => {
    res.json(tickets.list(currentUser(req), listTicketsSchema.parse(req.query)));
  });

  router.post("/", (req, res) => {
    res.status(201).json(tickets.create(currentUser(req), createTicketSchema.parse(req.body)));
  });

  router.get("/:id", (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    res.json(tickets.get(currentUser(req), id));
  });

  router.patch("/:id/status", (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    res.json(tickets.changeStatus(currentUser(req), id, statusSchema.parse(req.body).status));
  });

  router.patch("/:id/assignee", requireRole("agent", "admin"), (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    res.json(tickets.assign(currentUser(req), id, assignSchema.parse(req.body).assigneeId));
  });

  router.post("/:id/comments", (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    const { body, internal } = commentSchema.parse(req.body);
    res.status(201).json(tickets.comment(currentUser(req), id, body, internal));
  });

  return router;
}
