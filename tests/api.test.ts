// Tests de bout en bout de l'API (base SQLite en mémoire + horloge contrôlée)

import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { openDatabase } from "../src/db/database.js";
import { UserRepository } from "../src/repositories/userRepository.js";
import { AuthService } from "../src/services/authService.js";

const PASSWORD = "Motdepasse1!";
let now = new Date("2026-11-02T08:00:00.000Z");
const clock = () => now;
const advance = (hours: number) => {
  now = new Date(now.getTime() + hours * 3_600_000);
};

let app: ReturnType<typeof createApp>;
let tokens: Record<"admin" | "agent" | "client" | "other", string>;
let agentId: number;

async function login(email: string) {
  const res = await request(app).post("/api/auth/login").send({ email, password: PASSWORD });
  return res.body.token as string;
}

async function newTicket(token: string, priority = "high") {
  const res = await request(app)
    .post("/api/tickets")
    .set("Authorization", `Bearer ${token}`)
    .send({ title: "Erreur 500 à la connexion", description: "La page de connexion renvoie une erreur 500.", priority, category: "bug" });
  expect(res.status).toBe(201);
  return res.body;
}

beforeEach(async () => {
  now = new Date("2026-11-02T08:00:00.000Z");
  const db = openDatabase(":memory:");
  app = createApp(db, { jwtSecret: "test-secret", jwtExpiresIn: "1h" }, clock);

  // Le support (admin, agent) est créé directement : l'inscription publique ne donne que le rôle « client »
  const auth = new AuthService(new UserRepository(db), "test-secret", "1h", clock);
  auth.register({ name: "Admin", email: "admin@test.tn", password: PASSWORD, role: "admin" });
  agentId = auth.register({ name: "Agent Sami", email: "agent@test.tn", password: PASSWORD, role: "agent" }).id;

  await request(app).post("/api/auth/register").send({ name: "Client Un", email: "client@test.tn", password: PASSWORD });
  await request(app).post("/api/auth/register").send({ name: "Client Deux", email: "other@test.tn", password: PASSWORD });
  tokens = {
    admin: await login("admin@test.tn"),
    agent: await login("agent@test.tn"),
    client: await login("client@test.tn"),
    other: await login("other@test.tn"),
  };
});

describe("authentification", () => {
  it("refuse l'accès sans jeton", async () => {
    const res = await request(app).get("/api/tickets");
    expect(res.status).toBe(401);
  });

  it("refuse un mauvais mot de passe sans dire si l'e-mail existe", async () => {
    const res = await request(app).post("/api/auth/login").send({ email: "client@test.tn", password: "faux" });
    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe("E-mail ou mot de passe incorrect");
  });

  it("refuse un e-mail déjà utilisé", async () => {
    const res = await request(app).post("/api/auth/register").send({ name: "Copie", email: "client@test.tn", password: PASSWORD });
    expect(res.status).toBe(409);
  });

  it("valide les données d'inscription", async () => {
    const res = await request(app).post("/api/auth/register").send({ name: "X", email: "pas-un-email", password: "court" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("tickets et SLA", () => {
  it("crée un ticket avec ses échéances SLA", async () => {
    const ticket = await newTicket(tokens.client, "critical");
    expect(ticket.status).toBe("open");
    expect(ticket.responseDueAt).toBe("2026-11-02T09:00:00.000Z");
    expect(ticket.resolutionDueAt).toBe("2026-11-02T12:00:00.000Z");
    expect(ticket.sla.overall).toBe("ok");
  });

  it("signale un SLA dépassé quand le temps passe sans réponse", async () => {
    const ticket = await newTicket(tokens.client, "critical");
    advance(2);
    const res = await request(app).get(`/api/tickets/${ticket.id}`).set("Authorization", `Bearer ${tokens.agent}`);
    expect(res.body.sla.response.state).toBe("breached");
    expect(res.body.sla.response.remainingMinutes).toBe(-60);
  });

  it("cycle complet : prise en charge, réponse, résolution, fermeture par le client", async () => {
    const { id } = await newTicket(tokens.client);
    const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

    advance(1);
    const taken = await request(app).patch(`/api/tickets/${id}/status`).set(auth(tokens.agent)).send({ status: "in_progress" });
    expect(taken.status).toBe(200);
    expect(taken.body.assigneeId).toBe(agentId); // affectation automatique
    expect(taken.body.sla.response.state).toBe("met");

    advance(2);
    await request(app).post(`/api/tickets/${id}/comments`).set(auth(tokens.agent)).send({ body: "Correctif déployé." });
    const resolved = await request(app).patch(`/api/tickets/${id}/status`).set(auth(tokens.agent)).send({ status: "resolved" });
    expect(resolved.body.sla.resolution.state).toBe("met");

    const closed = await request(app).patch(`/api/tickets/${id}/status`).set(auth(tokens.client)).send({ status: "closed" });
    expect(closed.body.status).toBe("closed");

    const detail = await request(app).get(`/api/tickets/${id}`).set(auth(tokens.client));
    expect(detail.body.events.map((e: { type: string }) => e.type)).toEqual(["created", "status", "assigned", "comment", "status", "status"]);
  });

  it("refuse une transition non autorisée pour le rôle", async () => {
    const { id } = await newTicket(tokens.client);
    const res = await request(app)
      .patch(`/api/tickets/${id}/status`)
      .set("Authorization", `Bearer ${tokens.client}`)
      .send({ status: "in_progress" });
    expect(res.status).toBe(403);
  });

  it("un client ne voit pas les tickets d'un autre client", async () => {
    const { id } = await newTicket(tokens.client);
    const detail = await request(app).get(`/api/tickets/${id}`).set("Authorization", `Bearer ${tokens.other}`);
    expect(detail.status).toBe(404);
    const list = await request(app).get("/api/tickets").set("Authorization", `Bearer ${tokens.other}`);
    expect(list.body.total).toBe(0);
  });

  it("les notes internes sont cachées au client", async () => {
    const { id } = await newTicket(tokens.client);
    const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
    await request(app).post(`/api/tickets/${id}/comments`).set(auth(tokens.agent)).send({ body: "Note interne", internal: true });
    await request(app).post(`/api/tickets/${id}/comments`).set(auth(tokens.agent)).send({ body: "Réponse publique" });

    const forClient = await request(app).get(`/api/tickets/${id}`).set(auth(tokens.client));
    expect(forClient.body.comments.map((c: { body: string }) => c.body)).toEqual(["Réponse publique"]);
    const forAgent = await request(app).get(`/api/tickets/${id}`).set(auth(tokens.agent));
    expect(forAgent.body.comments).toHaveLength(2);

    const res = await request(app).post(`/api/tickets/${id}/comments`).set(auth(tokens.client)).send({ body: "x", internal: true });
    expect(res.status).toBe(403);
  });

  it("un agent ne peut affecter un ticket qu'à lui-même, l'admin à n'importe quel agent", async () => {
    const { id } = await newTicket(tokens.client);
    const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
    const adminId = (await request(app).get("/api/auth/me").set(auth(tokens.admin))).body.id;

    const refused = await request(app).patch(`/api/tickets/${id}/assignee`).set(auth(tokens.agent)).send({ assigneeId: adminId });
    expect(refused.status).toBe(403);
    const ok = await request(app).patch(`/api/tickets/${id}/assignee`).set(auth(tokens.admin)).send({ assigneeId: agentId });
    expect(ok.body.assigneeName).toBe("Agent Sami");
  });

  it("filtre et pagine la liste des tickets", async () => {
    await newTicket(tokens.client, "low");
    await newTicket(tokens.client, "critical");
    await newTicket(tokens.client, "critical");
    const res = await request(app)
      .get("/api/tickets?priority=critical&pageSize=1&page=2")
      .set("Authorization", `Bearer ${tokens.agent}`);
    expect(res.body.total).toBe(2);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.page).toBe(2);
  });
});

describe("statistiques", () => {
  it("calcule le respect des SLA et la charge des agents", async () => {
    const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
    const a = await newTicket(tokens.client, "critical");
    const b = await newTicket(tokens.client, "high");

    advance(0.5);
    await request(app).patch(`/api/tickets/${a.id}/status`).set(auth(tokens.agent)).send({ status: "in_progress" });
    await request(app).patch(`/api/tickets/${a.id}/status`).set(auth(tokens.agent)).send({ status: "resolved" });
    advance(5); // le ticket b n'a toujours pas de réponse : SLA de réponse dépassé (4 h)
    await request(app).patch(`/api/tickets/${b.id}/status`).set(auth(tokens.agent)).send({ status: "in_progress" });

    const stats = (await request(app).get("/api/stats").set(auth(tokens.admin))).body;
    expect(stats.total).toBe(2);
    expect(stats.byStatus).toMatchObject({ resolved: 1, in_progress: 1 });
    expect(stats.breached).toBe(1);
    expect(stats.responseCompliance).toBe(50);
    expect(stats.resolutionCompliance).toBe(100);
    expect(stats.workload).toEqual([{ agent: "Agent Sami", active: 1 }]);
  });
});

describe("robustesse", () => {
  it("renvoie une erreur JSON pour une route inconnue et un JSON mal formé", async () => {
    expect((await request(app).get("/api/inconnu")).status).toBe(404);
    const res = await request(app).post("/api/auth/login").set("Content-Type", "application/json").send("{mauvais");
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("BAD_JSON");
  });
});
