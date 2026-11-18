// Schémas de validation des requêtes (Zod) : toute donnée entrante est vérifiée avant d'atteindre le métier

import { z } from "zod";
import { CATEGORIES, PRIORITIES, ROLES, STATUSES } from "./types.js";

export const registerSchema = z.object({
  name: z.string().trim().min(2, "Nom trop court").max(80),
  email: z.email("E-mail invalide").max(120),
  password: z.string().min(8, "Le mot de passe doit contenir au moins 8 caractères").max(100),
});

/** Création d'un compte par un administrateur (il peut choisir le rôle) */
export const createUserSchema = registerSchema.extend({ role: z.enum(ROLES) });

export const loginSchema = z.object({
  email: z.string().min(1),
  password: z.string().min(1),
});

export const createTicketSchema = z.object({
  title: z.string().trim().min(5, "Titre trop court (5 caractères minimum)").max(150),
  description: z.string().trim().min(10, "Décrivez le problème (10 caractères minimum)").max(5000),
  priority: z.enum(PRIORITIES),
  category: z.enum(CATEGORIES).default("other"),
});

export const listTicketsSchema = z.object({
  status: z.enum(STATUSES).optional(),
  priority: z.enum(PRIORITIES).optional(),
  assigneeId: z.coerce.number().int().positive().optional(),
  unassigned: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .optional(),
  search: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const statusSchema = z.object({ status: z.enum(STATUSES) });

export const assignSchema = z.object({ assigneeId: z.number().int().positive().nullable() });

export const commentSchema = z.object({
  body: z.string().trim().min(1, "Le message est vide").max(5000),
  internal: z.boolean().default(false),
});

export const idParamSchema = z.object({ id: z.coerce.number().int().positive() });
