// Règles métier des tickets : visibilité, cycle de vie, affectation, commentaires et SLA

import { transaction, type Database } from "../db/database.js";
import { computeDeadlines, evaluateSla, type SlaReport } from "../domain/sla.js";
import { availableTransitions, canTransition } from "../domain/workflow.js";
import { badRequest, forbidden, notFound } from "../errors.js";
import type { TicketFilters, TicketRepository, TicketUpdate } from "../repositories/ticketRepository.js";
import type { UserRepository } from "../repositories/userRepository.js";
import type { AuthUser, Category, Clock, Comment, Priority, Status, Ticket, TicketEvent } from "../types.js";

const STAFF = new Set(["agent", "admin"]);
const isStaff = (user: AuthUser) => STAFF.has(user.role);

const STATUS_LABEL: Record<Status, string> = {
  open: "Ouvert",
  in_progress: "En cours",
  resolved: "Résolu",
  closed: "Fermé",
};

/** Ticket enrichi pour l'API : état SLA et actions possibles pour l'utilisateur */
export type TicketView = Ticket & { sla: SlaReport; actions: { to: Status; label: string }[] };

export interface TicketDetail extends TicketView {
  comments: Comment[];
  events: TicketEvent[];
}

export class TicketService {
  constructor(
    private readonly db: Database,
    private readonly tickets: TicketRepository,
    private readonly users: UserRepository,
    private readonly clock: Clock = () => new Date(),
  ) {}

  create(user: AuthUser, data: { title: string; description: string; priority: Priority; category: Category }): TicketView {
    const now = this.clock();
    const nowIso = now.toISOString();
    const ticket = transaction(this.db, () => {
      const created = this.tickets.create({
        ...data,
        requesterId: user.id,
        createdAt: nowIso,
        updatedAt: nowIso,
        ...computeDeadlines(data.priority, now),
      });
      this.log(created.id, user, "created", `Ticket créé (priorité ${data.priority})`, nowIso);
      return created;
    });
    return this.view(ticket, user);
  }

  list(user: AuthUser, filters: TicketFilters): { items: TicketView[]; total: number; page: number; pageSize: number } {
    // Un client ne voit que ses propres tickets, quels que soient les filtres envoyés
    const scoped = isStaff(user) ? filters : { ...filters, requesterId: user.id };
    const { items, total } = this.tickets.list(scoped);
    return { items: items.map((t) => this.view(t, user)), total, page: filters.page, pageSize: filters.pageSize };
  }

  get(user: AuthUser, id: number): TicketDetail {
    const ticket = this.findVisible(user, id);
    return {
      ...this.view(ticket, user),
      comments: this.tickets.listComments(id, isStaff(user)),
      events: this.tickets.listEvents(id),
    };
  }

  changeStatus(user: AuthUser, id: number, to: Status): TicketView {
    const ticket = this.findVisible(user, id);
    if (ticket.status === to) throw badRequest(`Le ticket est déjà « ${STATUS_LABEL[to]} »`);
    if (!canTransition(ticket.status, to, user.role)) {
      throw forbidden(`Passage de « ${STATUS_LABEL[ticket.status]} » à « ${STATUS_LABEL[to]} » non autorisé pour votre rôle`);
    }

    const nowIso = this.clock().toISOString();
    const changes: TicketUpdate = { status: to, updatedAt: nowIso };

    if (to === "in_progress") {
      // Un agent qui prend un ticket libre se l'affecte automatiquement
      if (ticket.assigneeId === null && isStaff(user)) changes.assigneeId = user.id;
      // La prise en charge compte comme première réponse
      if (!ticket.firstResponseAt && isStaff(user)) changes.firstResponseAt = nowIso;
      // Réouverture : la résolution précédente ne compte plus
      if (ticket.status === "resolved") changes.resolvedAt = null;
    }
    if (to === "resolved") changes.resolvedAt = nowIso;
    if (to === "closed") changes.closedAt = nowIso;

    const updated = transaction(this.db, () => {
      const result = this.tickets.update(id, changes);
      this.log(id, user, "status", `${STATUS_LABEL[ticket.status]} → ${STATUS_LABEL[to]}`, nowIso);
      if (changes.assigneeId) this.log(id, user, "assigned", `Affecté à ${user.name}`, nowIso);
      return result;
    });
    return this.view(updated, user);
  }

  assign(user: AuthUser, id: number, assigneeId: number | null): TicketView {
    if (!isStaff(user)) throw forbidden();
    const ticket = this.findVisible(user, id);
    if (ticket.status === "closed") throw badRequest("Impossible d'affecter un ticket fermé");
    // Un agent peut seulement se l'affecter à lui-même ; l'admin affecte qui il veut
    if (user.role === "agent" && assigneeId !== user.id) throw forbidden("Un agent ne peut affecter un ticket qu'à lui-même");

    let detail = "Affectation retirée";
    if (assigneeId !== null) {
      const assignee = this.users.findById(assigneeId);
      if (!assignee || !STAFF.has(assignee.role)) throw badRequest("La personne choisie n'est pas un agent");
      detail = `Affecté à ${assignee.name}`;
    }

    const nowIso = this.clock().toISOString();
    const updated = transaction(this.db, () => {
      const result = this.tickets.update(id, { assigneeId, updatedAt: nowIso });
      this.log(id, user, "assigned", detail, nowIso);
      return result;
    });
    return this.view(updated, user);
  }

  comment(user: AuthUser, id: number, body: string, internal: boolean): TicketDetail {
    const ticket = this.findVisible(user, id);
    if (ticket.status === "closed") throw badRequest("Le ticket est fermé");
    if (internal && !isStaff(user)) throw forbidden("Seuls les agents peuvent écrire une note interne");

    const nowIso = this.clock().toISOString();
    transaction(this.db, () => {
      this.tickets.addComment({ ticketId: id, authorId: user.id, body, internal, createdAt: nowIso });
      const changes: TicketUpdate = { updatedAt: nowIso };
      // Une réponse publique d'un agent arrête le compteur « première réponse »
      if (isStaff(user) && !internal && !ticket.firstResponseAt) changes.firstResponseAt = nowIso;
      this.tickets.update(id, changes);
      this.log(id, user, "comment", internal ? "Note interne ajoutée" : "Réponse ajoutée", nowIso);
    });
    return this.get(user, id);
  }

  // ---------- Outils internes ----------

  private findVisible(user: AuthUser, id: number): Ticket {
    const ticket = this.tickets.findById(id);
    // 404 aussi pour le ticket d'un autre client : on ne révèle pas son existence
    if (!ticket || (!isStaff(user) && ticket.requesterId !== user.id)) throw notFound("Ticket introuvable");
    return ticket;
  }

  private view(ticket: Ticket, user: AuthUser): TicketView {
    const actions =
      !isStaff(user) && ticket.requesterId !== user.id ? [] : availableTransitions(ticket.status, user.role);
    return { ...ticket, sla: evaluateSla(ticket, this.clock()), actions };
  }

  private log(ticketId: number, user: AuthUser, type: string, detail: string, createdAt: string): void {
    this.tickets.addEvent({ ticketId, actorId: user.id, type, detail, createdAt });
  }
}
