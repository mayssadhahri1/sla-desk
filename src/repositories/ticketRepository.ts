// Accès aux données des tickets, commentaires et journal d'audit

import type { SQLInputValue } from "node:sqlite";
import type { Database } from "../db/database.js";
import type { Category, Comment, Priority, Role, Status, Ticket, TicketEvent } from "../types.js";

interface TicketRow {
  id: number;
  title: string;
  description: string;
  priority: Priority;
  category: Category;
  status: Status;
  requester_id: number;
  requester_name: string;
  assignee_id: number | null;
  assignee_name: string | null;
  created_at: string;
  updated_at: string;
  first_response_at: string | null;
  resolved_at: string | null;
  closed_at: string | null;
  response_due_at: string;
  resolution_due_at: string;
}

const toTicket = (r: TicketRow): Ticket => ({
  id: r.id,
  title: r.title,
  description: r.description,
  priority: r.priority,
  category: r.category,
  status: r.status,
  requesterId: r.requester_id,
  requesterName: r.requester_name,
  assigneeId: r.assignee_id,
  assigneeName: r.assignee_name,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  firstResponseAt: r.first_response_at,
  resolvedAt: r.resolved_at,
  closedAt: r.closed_at,
  responseDueAt: r.response_due_at,
  resolutionDueAt: r.resolution_due_at,
});

const SELECT_TICKET = `
  SELECT t.*, r.name AS requester_name, a.name AS assignee_name
  FROM tickets t
  JOIN users r ON r.id = t.requester_id
  LEFT JOIN users a ON a.id = t.assignee_id
`;

export interface TicketFilters {
  status?: Status;
  priority?: Priority;
  assigneeId?: number;
  requesterId?: number;
  unassigned?: boolean;
  search?: string;
  page: number;
  pageSize: number;
}

/** Colonnes modifiables d'un ticket (nom TypeScript -> nom SQL) */
const UPDATABLE = {
  status: "status",
  assigneeId: "assignee_id",
  updatedAt: "updated_at",
  firstResponseAt: "first_response_at",
  resolvedAt: "resolved_at",
  closedAt: "closed_at",
} as const;

export type TicketUpdate = Partial<{ -readonly [K in keyof typeof UPDATABLE]: Ticket[K] }>;

export class TicketRepository {
  constructor(private readonly db: Database) {}

  create(data: Omit<Ticket, "id" | "requesterName" | "assigneeId" | "assigneeName" | "firstResponseAt" | "resolvedAt" | "closedAt" | "status">): Ticket {
    const result = this.db
      .prepare(
        `INSERT INTO tickets (title, description, priority, category, requester_id, created_at, updated_at,
                              response_due_at, resolution_due_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        data.title,
        data.description,
        data.priority,
        data.category,
        data.requesterId,
        data.createdAt,
        data.updatedAt,
        data.responseDueAt,
        data.resolutionDueAt,
      );
    return this.findById(Number(result.lastInsertRowid))!;
  }

  findById(id: number): Ticket | undefined {
    const row = this.db.prepare(`${SELECT_TICKET} WHERE t.id = ?`).get(id) as TicketRow | undefined;
    return row ? toTicket(row) : undefined;
  }

  list(filters: TicketFilters): { items: Ticket[]; total: number } {
    const where: string[] = [];
    const params: SQLInputValue[] = [];

    if (filters.status) {
      where.push("t.status = ?");
      params.push(filters.status);
    }
    if (filters.priority) {
      where.push("t.priority = ?");
      params.push(filters.priority);
    }
    if (filters.assigneeId !== undefined) {
      where.push("t.assignee_id = ?");
      params.push(filters.assigneeId);
    }
    if (filters.requesterId !== undefined) {
      where.push("t.requester_id = ?");
      params.push(filters.requesterId);
    }
    if (filters.unassigned) where.push("t.assignee_id IS NULL");
    if (filters.search) {
      where.push("(t.title LIKE ? OR t.description LIKE ?)");
      params.push(`%${filters.search}%`, `%${filters.search}%`);
    }

    const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const total = (this.db.prepare(`SELECT COUNT(*) AS n FROM tickets t ${clause}`).get(...params) as { n: number }).n;

    // Tri : tickets actifs d'abord, puis par priorité et par échéance la plus proche
    const rows = this.db
      .prepare(
        `${SELECT_TICKET} ${clause}
         ORDER BY CASE WHEN t.status IN ('resolved', 'closed') THEN 1 ELSE 0 END,
                  CASE t.priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
                  t.resolution_due_at
         LIMIT ? OFFSET ?`,
      )
      .all(...params, filters.pageSize, (filters.page - 1) * filters.pageSize) as unknown as TicketRow[];

    return { items: rows.map(toTicket), total };
  }

  /** Tous les tickets (pour les statistiques), éventuellement limités à un demandeur */
  all(requesterId?: number): Ticket[] {
    const rows = (
      requesterId === undefined
        ? this.db.prepare(SELECT_TICKET).all()
        : this.db.prepare(`${SELECT_TICKET} WHERE t.requester_id = ?`).all(requesterId)
    ) as unknown as TicketRow[];
    return rows.map(toTicket);
  }

  update(id: number, changes: TicketUpdate): Ticket {
    const entries = Object.entries(changes) as [keyof typeof UPDATABLE, SQLInputValue][];
    if (entries.length) {
      const sets = entries.map(([key]) => `${UPDATABLE[key]} = ?`).join(", ");
      this.db.prepare(`UPDATE tickets SET ${sets} WHERE id = ?`).run(...entries.map(([, v]) => v), id);
    }
    return this.findById(id)!;
  }

  addComment(data: { ticketId: number; authorId: number; body: string; internal: boolean; createdAt: string }): void {
    this.db
      .prepare("INSERT INTO comments (ticket_id, author_id, body, internal, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(data.ticketId, data.authorId, data.body, data.internal ? 1 : 0, data.createdAt);
  }

  listComments(ticketId: number, includeInternal: boolean): Comment[] {
    const rows = this.db
      .prepare(
        `SELECT c.*, u.name AS author_name, u.role AS author_role
         FROM comments c JOIN users u ON u.id = c.author_id
         WHERE c.ticket_id = ? ${includeInternal ? "" : "AND c.internal = 0"}
         ORDER BY c.id`,
      )
      .all(ticketId) as unknown as {
      id: number;
      ticket_id: number;
      author_id: number;
      author_name: string;
      author_role: Role;
      body: string;
      internal: number;
      created_at: string;
    }[];
    return rows.map((r) => ({
      id: r.id,
      ticketId: r.ticket_id,
      authorId: r.author_id,
      authorName: r.author_name,
      authorRole: r.author_role,
      body: r.body,
      internal: r.internal === 1,
      createdAt: r.created_at,
    }));
  }

  addEvent(data: { ticketId: number; actorId: number; type: string; detail: string; createdAt: string }): void {
    this.db
      .prepare("INSERT INTO ticket_events (ticket_id, actor_id, type, detail, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(data.ticketId, data.actorId, data.type, data.detail, data.createdAt);
  }

  listEvents(ticketId: number): TicketEvent[] {
    const rows = this.db
      .prepare(
        `SELECT e.*, u.name AS actor_name FROM ticket_events e JOIN users u ON u.id = e.actor_id
         WHERE e.ticket_id = ? ORDER BY e.id`,
      )
      .all(ticketId) as unknown as {
      id: number;
      ticket_id: number;
      actor_name: string;
      type: string;
      detail: string;
      created_at: string;
    }[];
    return rows.map((r) => ({
      id: r.id,
      ticketId: r.ticket_id,
      actorName: r.actor_name,
      type: r.type,
      detail: r.detail,
      createdAt: r.created_at,
    }));
  }
}
