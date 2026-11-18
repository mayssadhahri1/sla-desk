// Types partagés du domaine

export const ROLES = ["client", "agent", "admin"] as const;
export type Role = (typeof ROLES)[number];

export const PRIORITIES = ["low", "medium", "high", "critical"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const STATUSES = ["open", "in_progress", "resolved", "closed"] as const;
export type Status = (typeof STATUSES)[number];

export const CATEGORIES = ["bug", "access", "billing", "feature", "other"] as const;
export type Category = (typeof CATEGORIES)[number];

export interface User {
  id: number;
  name: string;
  email: string;
  role: Role;
  createdAt: string;
}

/** Utilisateur connecté, tel qu'il est lu dans le jeton JWT */
export interface AuthUser {
  id: number;
  name: string;
  role: Role;
}

export interface Ticket {
  id: number;
  title: string;
  description: string;
  priority: Priority;
  category: Category;
  status: Status;
  requesterId: number;
  requesterName: string;
  assigneeId: number | null;
  assigneeName: string | null;
  createdAt: string;
  updatedAt: string;
  firstResponseAt: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  responseDueAt: string;
  resolutionDueAt: string;
}

export interface Comment {
  id: number;
  ticketId: number;
  authorId: number;
  authorName: string;
  authorRole: Role;
  body: string;
  internal: boolean;
  createdAt: string;
}

export interface TicketEvent {
  id: number;
  ticketId: number;
  actorName: string;
  type: string;
  detail: string;
  createdAt: string;
}

/** Horloge injectable : permet de tester les SLA sans attendre des heures */
export type Clock = () => Date;
