// Règles de SLA (Service Level Agreement) : délais de réponse et de résolution selon la priorité

import type { Priority, Ticket } from "../types.js";

const HOUR = 60 * 60 * 1000;

/** Délais contractuels, en heures, pour chaque priorité */
export const SLA_POLICY: Record<Priority, { responseHours: number; resolutionHours: number }> = {
  critical: { responseHours: 1, resolutionHours: 4 },
  high: { responseHours: 4, resolutionHours: 24 },
  medium: { responseHours: 8, resolutionHours: 72 },
  low: { responseHours: 24, resolutionHours: 120 },
};

/** Au-delà de 75 % du délai consommé, le ticket est signalé « à risque » */
export const AT_RISK_RATIO = 0.75;

export type SlaState = "ok" | "at_risk" | "breached" | "met";

export interface SlaTarget {
  state: SlaState;
  dueAt: string;
  /** Minutes restantes (négatif si dépassé), null si l'objectif est déjà atteint */
  remainingMinutes: number | null;
}

export interface SlaReport {
  response: SlaTarget;
  resolution: SlaTarget;
  /** État le plus grave des deux objectifs, utile pour trier et colorer */
  overall: SlaState;
}

/** Calcule les échéances d'un nouveau ticket */
export function computeDeadlines(priority: Priority, createdAt: Date): { responseDueAt: string; resolutionDueAt: string } {
  const policy = SLA_POLICY[priority];
  return {
    responseDueAt: new Date(createdAt.getTime() + policy.responseHours * HOUR).toISOString(),
    resolutionDueAt: new Date(createdAt.getTime() + policy.resolutionHours * HOUR).toISOString(),
  };
}

/** Évalue un objectif : atteint à temps, en retard, ou encore en cours */
export function evaluateTarget(startAt: string, dueAt: string, doneAt: string | null, now: Date): SlaTarget {
  const start = Date.parse(startAt);
  const due = Date.parse(dueAt);

  if (doneAt) {
    // L'objectif est terminé : on regarde seulement s'il l'a été à temps
    return { state: Date.parse(doneAt) <= due ? "met" : "breached", dueAt, remainingMinutes: null };
  }

  const remainingMinutes = Math.round((due - now.getTime()) / 60000);
  if (now.getTime() > due) return { state: "breached", dueAt, remainingMinutes };

  const elapsedRatio = (now.getTime() - start) / (due - start);
  return { state: elapsedRatio >= AT_RISK_RATIO ? "at_risk" : "ok", dueAt, remainingMinutes };
}

const SEVERITY: Record<SlaState, number> = { met: 0, ok: 1, at_risk: 2, breached: 3 };

export function evaluateSla(
  ticket: Pick<Ticket, "createdAt" | "responseDueAt" | "resolutionDueAt" | "firstResponseAt" | "resolvedAt" | "closedAt">,
  now: Date,
): SlaReport {
  const response = evaluateTarget(ticket.createdAt, ticket.responseDueAt, ticket.firstResponseAt, now);
  // Un ticket fermé sans passer par « résolu » arrête aussi le compteur de résolution
  const resolution = evaluateTarget(ticket.createdAt, ticket.resolutionDueAt, ticket.resolvedAt ?? ticket.closedAt, now);
  const overall = SEVERITY[response.state] >= SEVERITY[resolution.state] ? response.state : resolution.state;
  return { response, resolution, overall };
}
