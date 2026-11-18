// Tests unitaires des règles de SLA

import { describe, expect, it } from "vitest";
import { computeDeadlines, evaluateSla, evaluateTarget } from "../src/domain/sla.js";

const start = new Date("2026-11-02T08:00:00.000Z");
const at = (hours: number) => new Date(start.getTime() + hours * 3_600_000);

describe("computeDeadlines", () => {
  it("applique les délais de la politique selon la priorité", () => {
    expect(computeDeadlines("critical", start)).toEqual({
      responseDueAt: "2026-11-02T09:00:00.000Z",
      resolutionDueAt: "2026-11-02T12:00:00.000Z",
    });
    expect(computeDeadlines("low", start).resolutionDueAt).toBe("2026-11-07T08:00:00.000Z");
  });
});

describe("evaluateTarget", () => {
  const due = at(4).toISOString();

  it("est « ok » au début du délai", () => {
    expect(evaluateTarget(start.toISOString(), due, null, at(1))).toEqual({ state: "ok", dueAt: due, remainingMinutes: 180 });
  });

  it("passe « à risque » après 75 % du délai", () => {
    expect(evaluateTarget(start.toISOString(), due, null, at(3.1)).state).toBe("at_risk");
  });

  it("est « dépassé » après l'échéance, avec un temps restant négatif", () => {
    const result = evaluateTarget(start.toISOString(), due, null, at(5));
    expect(result.state).toBe("breached");
    expect(result.remainingMinutes).toBe(-60);
  });

  it("est « atteint » si l'objectif a été rempli à temps, même consulté plus tard", () => {
    expect(evaluateTarget(start.toISOString(), due, at(2).toISOString(), at(100)).state).toBe("met");
  });

  it("reste « dépassé » si l'objectif a été rempli en retard", () => {
    expect(evaluateTarget(start.toISOString(), due, at(6).toISOString(), at(7)).state).toBe("breached");
  });
});

describe("evaluateSla", () => {
  it("retient l'état le plus grave des deux objectifs", () => {
    const deadlines = computeDeadlines("high", start); // réponse 4 h, résolution 24 h
    const ticket = { createdAt: start.toISOString(), ...deadlines, firstResponseAt: null, resolvedAt: null, closedAt: null };
    const report = evaluateSla(ticket, at(5));
    expect(report.response.state).toBe("breached");
    expect(report.resolution.state).toBe("ok");
    expect(report.overall).toBe("breached");
  });
});
