// Tests de la machine à états des tickets

import { describe, expect, it } from "vitest";
import { availableTransitions, canTransition } from "../src/domain/workflow.js";

describe("workflow des tickets", () => {
  it("seul le support peut prendre en charge un ticket", () => {
    expect(canTransition("open", "in_progress", "agent")).toBe(true);
    expect(canTransition("open", "in_progress", "client")).toBe(false);
  });

  it("le client confirme la résolution ou rouvre le ticket", () => {
    expect(canTransition("resolved", "closed", "client")).toBe(true);
    expect(canTransition("resolved", "in_progress", "client")).toBe(true);
    expect(canTransition("resolved", "closed", "agent")).toBe(false);
  });

  it("interdit les sauts d'étape et toute action sur un ticket fermé", () => {
    expect(canTransition("open", "resolved", "admin")).toBe(false);
    expect(availableTransitions("closed", "admin")).toEqual([]);
  });

  it("propose les actions adaptées au rôle", () => {
    expect(availableTransitions("open", "client")).toEqual([{ to: "closed", label: "Annuler" }]);
  });
});
