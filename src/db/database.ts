// Connexion SQLite (module natif node:sqlite) et création du schéma

import { DatabaseSync } from "node:sqlite";

export type Database = DatabaseSync;

const SCHEMA = `
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT    NOT NULL,
    email         TEXT    NOT NULL UNIQUE,
    password_hash TEXT    NOT NULL,
    role          TEXT    NOT NULL CHECK (role IN ('client', 'agent', 'admin')),
    created_at    TEXT    NOT NULL
  );

  CREATE TABLE IF NOT EXISTS tickets (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    title             TEXT    NOT NULL,
    description       TEXT    NOT NULL,
    priority          TEXT    NOT NULL CHECK (priority IN ('low', 'medium', 'high', 'critical')),
    category          TEXT    NOT NULL,
    status            TEXT    NOT NULL DEFAULT 'open'
                              CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
    requester_id      INTEGER NOT NULL REFERENCES users(id),
    assignee_id       INTEGER REFERENCES users(id),
    created_at        TEXT    NOT NULL,
    updated_at        TEXT    NOT NULL,
    first_response_at TEXT,
    resolved_at       TEXT,
    closed_at         TEXT,
    response_due_at   TEXT    NOT NULL,
    resolution_due_at TEXT    NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_tickets_status    ON tickets(status);
  CREATE INDEX IF NOT EXISTS idx_tickets_requester ON tickets(requester_id);
  CREATE INDEX IF NOT EXISTS idx_tickets_assignee  ON tickets(assignee_id);

  CREATE TABLE IF NOT EXISTS comments (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_id  INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    author_id  INTEGER NOT NULL REFERENCES users(id),
    body       TEXT    NOT NULL,
    internal   INTEGER NOT NULL DEFAULT 0,
    created_at TEXT    NOT NULL
  );

  -- Journal d'audit : chaque action sur un ticket est tracée
  CREATE TABLE IF NOT EXISTS ticket_events (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_id  INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    actor_id   INTEGER NOT NULL REFERENCES users(id),
    type       TEXT    NOT NULL,
    detail     TEXT    NOT NULL,
    created_at TEXT    NOT NULL
  );
`;

export function openDatabase(path: string): Database {
  const db = new DatabaseSync(path);
  db.exec(SCHEMA);
  return db;
}

/** Exécute plusieurs requêtes dans une transaction (tout ou rien) */
export function transaction<T>(db: Database, work: () => T): T {
  db.exec("BEGIN");
  try {
    const result = work();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
