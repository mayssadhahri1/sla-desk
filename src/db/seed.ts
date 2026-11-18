// Données de démonstration : comptes de test et tickets avec des situations SLA variées

import { pathToFileURL } from "node:url";
import { loadConfig } from "../config.js";
import { TicketRepository } from "../repositories/ticketRepository.js";
import { UserRepository } from "../repositories/userRepository.js";
import { AuthService } from "../services/authService.js";
import { TicketService } from "../services/ticketService.js";
import type { AuthUser, Category, Priority } from "../types.js";
import { openDatabase, type Database } from "./database.js";

export const DEMO_PASSWORD = "Demo1234!";

const HOUR = 3_600_000;

export function seedIfEmpty(db: Database): boolean {
  const { n } = db.prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number };
  if (n > 0) return false;

  // Horloge réglable : on « rejoue » l'historique pour obtenir des tickets dans tous les états
  let now = Date.now();
  const clock = () => new Date(now);
  const at = (hoursAgo: number) => {
    now = Date.now() - hoursAgo * HOUR;
  };

  const users = new UserRepository(db);
  const auth = new AuthService(users, "seed", "1h", clock);
  const tickets = new TicketService(db, new TicketRepository(db), users, clock);

  const asAuth = (u: { id: number; name: string; role: AuthUser["role"] }): AuthUser => ({ id: u.id, name: u.name, role: u.role });
  at(200);
  const admin = asAuth(auth.register({ name: "Admin Support", email: "admin@sladesk.dev", password: DEMO_PASSWORD, role: "admin" }));
  const sami = asAuth(auth.register({ name: "Sami Agent", email: "agent@sladesk.dev", password: DEMO_PASSWORD, role: "agent" }));
  const ines = asAuth(auth.register({ name: "Inès Agent", email: "ines@sladesk.dev", password: DEMO_PASSWORD, role: "agent" }));
  const client = asAuth(auth.register({ name: "Société Alpha", email: "client@sladesk.dev", password: DEMO_PASSWORD }));
  const client2 = asAuth(auth.register({ name: "Clinique Beta", email: "beta@sladesk.dev", password: DEMO_PASSWORD }));

  const open = (who: AuthUser, hoursAgo: number, title: string, description: string, priority: Priority, category: Category) => {
    at(hoursAgo);
    return tickets.create(who, { title, description, priority, category }).id;
  };
  const act = (hoursAgo: number, fn: () => unknown) => {
    at(hoursAgo);
    fn();
  };

  // 1. Critique, résolu à temps
  const t1 = open(client, 72, "Paiement en ligne indisponible", "Les clients reçoivent une erreur 502 au moment du paiement.", "critical", "billing");
  act(71.6, () => tickets.changeStatus(sami, t1, "in_progress"));
  act(71.4, () => tickets.comment(sami, t1, "Incident identifié côté passerelle de paiement, correctif en cours.", false));
  act(70, () => tickets.changeStatus(sami, t1, "resolved"));
  act(68, () => tickets.changeStatus(client, t1, "closed"));

  // 2. Haute priorité, résolue en retard
  const t2 = open(client2, 60, "Export PDF des ordonnances vide", "Le PDF généré ne contient aucune ligne depuis la mise à jour.", "high", "bug");
  act(57, () => tickets.changeStatus(ines, t2, "in_progress"));
  act(56, () => tickets.comment(ines, t2, "Régression liée à la nouvelle librairie PDF, je cherche.", true));
  act(30, () => tickets.changeStatus(ines, t2, "resolved"));

  // 3. Critique, sans réponse : SLA dépassé
  const t3 = open(client, 3, "Impossible de se connecter à l'espace admin", "Tous nos comptes administrateurs sont bloqués.", "critical", "access");
  act(2.5, () => tickets.comment(client, t3, "C'est bloquant pour toute l'équipe, merci de faire vite.", false));

  // 4. Haute priorité en cours, à risque
  const t4 = open(client2, 20, "Lenteurs sur la recherche des patients", "La recherche prend plus de 10 secondes.", "high", "bug");
  act(19, () => tickets.changeStatus(sami, t4, "in_progress"));
  act(18.5, () => tickets.comment(sami, t4, "Je reproduis le problème, un index semble manquer.", false));

  // 5 à 8. Tickets récents dans les délais
  const t5 = open(client, 2, "Ajouter un export CSV des factures", "Nous aimerions exporter les factures du mois.", "low", "feature");
  open(client2, 1, "Changer l'adresse e-mail du compte", "Notre adresse de contact a changé.", "medium", "access");
  const t7 = open(client, 5, "Double facturation en octobre", "La facture 2026-10-118 a été prélevée deux fois.", "medium", "billing");
  act(4, () => tickets.assign(admin, t7, ines.id));
  act(3.5, () => tickets.changeStatus(ines, t7, "in_progress"));
  open(client2, 0.3, "Question sur les rôles utilisateurs", "Peut-on créer un rôle « secrétaire » avec des droits limités ?", "low", "other");

  act(1, () => tickets.assign(admin, t5, sami.id));
  return true;
}

// Exécution directe : npm run seed
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const db = openDatabase(loadConfig().databasePath);
  console.log(seedIfEmpty(db) ? "Données de démonstration créées." : "La base contient déjà des données.");
  db.close();
}
