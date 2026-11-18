// Indicateurs du tableau de bord : volumes, respect des SLA et charge des agents

import { evaluateSla } from "../domain/sla.js";
import type { TicketRepository } from "../repositories/ticketRepository.js";
import type { AuthUser, Clock, Priority, Status } from "../types.js";
import { PRIORITIES, STATUSES } from "../types.js";

export interface DashboardStats {
  total: number;
  active: number;
  byStatus: Record<Status, number>;
  byPriority: Record<Priority, number>;
  /** Tickets actifs dont un objectif SLA est dépassé ou à risque */
  breached: number;
  atRisk: number;
  /** Pourcentage d'objectifs atteints à temps (null s'il n'y a encore rien à mesurer) */
  responseCompliance: number | null;
  resolutionCompliance: number | null;
  avgResolutionHours: number | null;
  workload: { agent: string; active: number }[];
}

const percent = (ok: number, total: number) => (total ? Math.round((100 * ok) / total) : null);

export class StatsService {
  constructor(
    private readonly tickets: TicketRepository,
    private readonly clock: Clock = () => new Date(),
  ) {}

  dashboard(user: AuthUser): DashboardStats {
    const now = this.clock();
    const tickets = this.tickets.all(user.role === "client" ? user.id : undefined);

    const byStatus = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<Status, number>;
    const byPriority = Object.fromEntries(PRIORITIES.map((p) => [p, 0])) as Record<Priority, number>;
    let breached = 0;
    let atRisk = 0;
    let responseDone = 0;
    let responseMet = 0;
    let resolutionDone = 0;
    let resolutionMet = 0;
    let resolutionHoursSum = 0;
    const workload = new Map<string, number>();

    for (const t of tickets) {
      byStatus[t.status] += 1;
      byPriority[t.priority] += 1;
      const sla = evaluateSla(t, now);
      const isActive = t.status === "open" || t.status === "in_progress";

      if (isActive && sla.overall === "breached") breached += 1;
      if (isActive && sla.overall === "at_risk") atRisk += 1;
      if (isActive && t.assigneeName) workload.set(t.assigneeName, (workload.get(t.assigneeName) ?? 0) + 1);

      if (sla.response.remainingMinutes === null) {
        responseDone += 1;
        if (sla.response.state === "met") responseMet += 1;
      }
      if (t.resolvedAt) {
        resolutionDone += 1;
        if (sla.resolution.state === "met") resolutionMet += 1;
        resolutionHoursSum += (Date.parse(t.resolvedAt) - Date.parse(t.createdAt)) / 3_600_000;
      }
    }

    return {
      total: tickets.length,
      active: byStatus.open + byStatus.in_progress,
      byStatus,
      byPriority,
      breached,
      atRisk,
      responseCompliance: percent(responseMet, responseDone),
      resolutionCompliance: percent(resolutionMet, resolutionDone),
      avgResolutionHours: resolutionDone ? Math.round((10 * resolutionHoursSum) / resolutionDone) / 10 : null,
      workload: [...workload.entries()]
        .map(([agent, active]) => ({ agent, active }))
        .sort((a, b) => b.active - a.active),
    };
  }
}
