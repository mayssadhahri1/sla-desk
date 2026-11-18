# 🎫 SLA Desk — Plateforme de support client avec suivi des SLA

> Application de **helpdesk** : les clients ouvrent des tickets, les agents les traitent, et la plateforme calcule en temps réel le respect des **SLA** (délais de première réponse et de résolution) selon la priorité.
> API REST sécurisée (JWT, rôles), machine à états des tickets, journal d'audit, tableau de bord et 25 tests automatisés.

![Node.js](https://img.shields.io/badge/Node.js-22-339933?logo=nodedotjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)
![Express](https://img.shields.io/badge/Express-5-000000?logo=express&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-node%3Asqlite-003B57?logo=sqlite&logoColor=white)
![JWT](https://img.shields.io/badge/Auth-JWT-d63aff?logo=jsonwebtokens&logoColor=white)
![Vitest](https://img.shields.io/badge/tests-Vitest-6E9F18?logo=vitest&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-2496ED?logo=docker&logoColor=white)
![License](https://img.shields.io/badge/licence-MIT-green)

---

## ✨ Fonctionnalités

- 🔐 **Authentification JWT** et **3 rôles** : client, agent, administrateur
- ⏱️ **Calcul des SLA** selon la priorité, avec états *dans les délais*, *à risque* (plus de 75 % du délai consommé), *dépassé* et *respecté*
- 🔄 **Cycle de vie des tickets** contrôlé par une **machine à états** : chaque transition est autorisée ou refusée selon le rôle
- 👥 **Affectation** : un agent prend un ticket libre (affectation automatique) ; l'admin affecte à n'importe quel agent
- 💬 **Échanges** client / support, avec **notes internes** invisibles pour le client
- 🧾 **Journal d'audit** : chaque action est tracée (qui, quoi, quand)
- 📊 **Tableau de bord** : tickets actifs, SLA dépassés ou à risque, taux de respect, temps moyen de résolution, charge des agents
- 🔎 Liste **filtrée, triée et paginée** (statut, priorité, recherche par mot-clé)
- 🛡️ **Sécurité** : validation de toutes les entrées (Zod), mots de passe hachés (bcrypt), en-têtes HTTP sécurisés (Helmet), cloisonnement des données entre clients

## ⏱️ Politique de SLA

| Priorité | Première réponse | Résolution |
|---|---|---|
| 🔴 Critique | 1 h | 4 h |
| 🟠 Haute | 4 h | 24 h |
| 🔵 Moyenne | 8 h | 72 h |
| ⚪ Basse | 24 h | 5 jours |

La **première réponse** est enregistrée quand un agent prend le ticket en charge ou répond publiquement au client.

## 🔄 Cycle de vie d'un ticket

```
  open ──► in_progress ──► resolved ──► closed
    │          │               │
    │          └──► open       └──► in_progress   (réouverture par le client)
    └──► closed   (annulation)
```

| Transition | Rôles autorisés |
|---|---|
| Prendre en charge (`open → in_progress`) | agent, admin |
| Marquer comme résolu (`in_progress → resolved`) | agent, admin |
| Confirmer et fermer (`resolved → closed`) | client, admin |
| Rouvrir (`resolved → in_progress`) | client, agent, admin |
| Annuler (`open → closed`) | client, admin |

## 🏗️ Architecture

Architecture en couches, avec **injection des dépendances** : chaque couche ne connaît que celle du dessous.

```
  Navigateur (public/)            Client HTTP
          │                            │
          ▼                            ▼
  ┌───────────────────────────────────────────┐
  │ Routes Express  + validation Zod          │  routes/, schemas.ts
  │ Middlewares : JWT, rôles, erreurs         │  middleware/
  ├───────────────────────────────────────────┤
  │ Services (règles métier)                  │  services/
  │   TicketService · AuthService · Stats     │
  ├───────────────────────────────────────────┤
  │ Domaine pur (sans base ni HTTP)           │  domain/
  │   sla.ts · workflow.ts (machine à états)  │
  ├───────────────────────────────────────────┤
  │ Repositories (seul endroit avec du SQL)   │  repositories/
  ├───────────────────────────────────────────┤
  │ SQLite (node:sqlite) · transactions       │  db/
  └───────────────────────────────────────────┘
```

**Choix techniques**
- **Horloge injectable** (`Clock`) : les tests « avancent le temps » pour vérifier qu'un SLA passe bien en retard, sans attendre des heures.
- **Domaine isolé** : les règles de SLA et le workflow sont des fonctions pures, testées sans base de données.
- **Transactions** : une action et sa ligne d'audit sont enregistrées ensemble, ou pas du tout.
- **404 plutôt que 403** quand un client demande le ticket d'un autre client : on ne révèle pas son existence.
- **SQLite natif de Node.js 22** : aucune dépendance native à compiler, démarrage immédiat.

## 🚀 Lancer le projet

### En local (Node.js 22.13 ou plus)

```bash
npm install
cp .env.example .env     # optionnel
npm run dev              # http://localhost:3000
```

Au premier démarrage, des **données de démonstration** sont créées. Tous les comptes utilisent le mot de passe `Demo1234!` :

| Rôle | E-mail |
|---|---|
| Administrateur | `admin@sladesk.dev` |
| Agent | `agent@sladesk.dev` · `ines@sladesk.dev` |
| Client | `client@sladesk.dev` · `beta@sladesk.dev` |

### Avec Docker

```bash
JWT_SECRET=une-cle-longue-et-secrete docker compose up --build
```

Image en deux étapes (compilation puis exécution sans outils de développement), utilisateur non-root, healthcheck et volume pour la base.

## 🔌 API

Toutes les routes (sauf inscription, connexion et santé) attendent l'en-tête `Authorization: Bearer <jeton>`.

| Méthode | Endpoint | Rôle | Description |
|---|---|---|---|
| `POST` | `/api/auth/register` | public | Créer un compte client |
| `POST` | `/api/auth/login` | public | Se connecter, obtenir un jeton JWT |
| `GET` | `/api/auth/me` | connecté | Profil de l'utilisateur |
| `GET` | `/api/tickets` | connecté | Liste (`status`, `priority`, `assigneeId`, `unassigned`, `search`, `page`, `pageSize`) |
| `POST` | `/api/tickets` | connecté | Créer un ticket |
| `GET` | `/api/tickets/:id` | connecté | Détail : SLA, actions possibles, échanges, historique |
| `PATCH` | `/api/tickets/:id/status` | selon le workflow | Changer le statut |
| `PATCH` | `/api/tickets/:id/assignee` | agent, admin | Affecter le ticket |
| `POST` | `/api/tickets/:id/comments` | connecté | Répondre (ou note interne pour le support) |
| `GET` | `/api/stats` | connecté | Indicateurs du tableau de bord |
| `GET` | `/api/users/agents` | agent, admin | Liste des agents |
| `POST` | `/api/users` | admin | Créer un compte agent ou admin |
| `GET` | `/api/sla-policy` | public | Politique de SLA |

Exemple :

```bash
TOKEN=$(curl -s -X POST localhost:3000/api/auth/login -H "Content-Type: application/json" \
  -d '{"email":"client@sladesk.dev","password":"Demo1234!"}' | jq -r .token)

curl -X POST localhost:3000/api/tickets -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"title":"Erreur 500 au paiement","description":"Le paiement échoue depuis ce matin.","priority":"critical","category":"billing"}'
```

Les erreurs ont toujours le même format :

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Titre trop court (5 caractères minimum)", "details": [...] } }
```

## ✅ Qualité

```bash
npm run typecheck   # TypeScript en mode strict
npm run lint        # ESLint
npm test            # 25 tests : SLA, workflow et API de bout en bout
```

Les tests d'API utilisent une base **en mémoire** et une **horloge contrôlée**. Ils couvrent l'authentification, les droits par rôle, le cloisonnement entre clients, les notes internes, la pagination, le cycle de vie complet et le calcul des statistiques.

L'intégration continue (GitHub Actions) vérifie les types, le lint, les tests, la compilation et la construction de l'image Docker à chaque push.

## 🛣️ Pistes d'amélioration

- Notifications par e-mail quand un SLA devient « à risque »
- Heures ouvrées (pause du SLA la nuit et le week-end)
- Mise à jour en temps réel du tableau de bord (WebSocket ou Server-Sent Events)
- Passage à PostgreSQL pour un déploiement multi-instances

---

👩‍💻 **Mayssa Dhahri** — Élève-ingénieure en Génie Logiciel · [LinkedIn](https://www.linkedin.com/in/mayssa-dhahri-38b1373bb/) · [GitHub](https://github.com/mayssadhahri1)
