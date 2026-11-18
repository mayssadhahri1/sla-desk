// Cycle de vie d'un ticket : transitions de statut autorisées et rôles qui peuvent les faire

import type { Role, Status } from "../types.js";

interface Transition {
  to: Status;
  roles: readonly Role[];
  label: string;
}

/**
 * Machine à états du ticket.
 *   open ──► in_progress ──► resolved ──► closed
 *     │          │               │
 *     │          └──► open       └──► in_progress (réouverture)
 *     └──► closed (annulation)
 */
export const WORKFLOW: Record<Status, readonly Transition[]> = {
  open: [
    { to: "in_progress", roles: ["agent", "admin"], label: "Prendre en charge" },
    { to: "closed", roles: ["client", "admin"], label: "Annuler" },
  ],
  in_progress: [
    { to: "resolved", roles: ["agent", "admin"], label: "Marquer comme résolu" },
    { to: "open", roles: ["agent", "admin"], label: "Remettre en file" },
  ],
  resolved: [
    { to: "closed", roles: ["client", "admin"], label: "Confirmer et fermer" },
    { to: "in_progress", roles: ["client", "agent", "admin"], label: "Rouvrir" },
  ],
  closed: [],
};

export function canTransition(from: Status, to: Status, role: Role): boolean {
  return WORKFLOW[from].some((t) => t.to === to && t.roles.includes(role));
}

/** Actions proposées à l'utilisateur dans l'interface */
export function availableTransitions(from: Status, role: Role): { to: Status; label: string }[] {
  return WORKFLOW[from].filter((t) => t.roles.includes(role)).map(({ to, label }) => ({ to, label }));
}
