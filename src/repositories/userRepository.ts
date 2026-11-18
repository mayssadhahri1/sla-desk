// Accès aux données des utilisateurs (couche Repository : seul endroit où l'on écrit du SQL)

import type { Database } from "../db/database.js";
import type { Role, User } from "../types.js";

interface UserRow {
  id: number;
  name: string;
  email: string;
  password_hash: string;
  role: Role;
  created_at: string;
}

const toUser = (row: UserRow): User => ({
  id: row.id,
  name: row.name,
  email: row.email,
  role: row.role,
  createdAt: row.created_at,
});

export class UserRepository {
  constructor(private readonly db: Database) {}

  create(data: { name: string; email: string; passwordHash: string; role: Role; createdAt: string }): User {
    const result = this.db
      .prepare("INSERT INTO users (name, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(data.name, data.email, data.passwordHash, data.role, data.createdAt);
    return this.findById(Number(result.lastInsertRowid))!;
  }

  findById(id: number): User | undefined {
    const row = this.db.prepare("SELECT * FROM users WHERE id = ?").get(id) as UserRow | undefined;
    return row ? toUser(row) : undefined;
  }

  /** Retourne aussi le hash du mot de passe : utilisé uniquement pour la connexion */
  findByEmailWithPassword(email: string): (User & { passwordHash: string }) | undefined {
    const row = this.db.prepare("SELECT * FROM users WHERE email = ?").get(email) as UserRow | undefined;
    return row ? { ...toUser(row), passwordHash: row.password_hash } : undefined;
  }

  listByRoles(roles: Role[]): User[] {
    const placeholders = roles.map(() => "?").join(", ");
    const rows = this.db
      .prepare(`SELECT * FROM users WHERE role IN (${placeholders}) ORDER BY name`)
      .all(...roles) as unknown as UserRow[];
    return rows.map(toUser);
  }
}
