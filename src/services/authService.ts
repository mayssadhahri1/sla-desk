// Inscription, connexion et gestion des jetons JWT

import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import type { SignOptions } from "jsonwebtoken";
import { conflict, unauthorized } from "../errors.js";
import type { UserRepository } from "../repositories/userRepository.js";
import type { AuthUser, Clock, Role, User } from "../types.js";

export class AuthService {
  constructor(
    private readonly users: UserRepository,
    private readonly jwtSecret: string,
    private readonly jwtExpiresIn: string,
    private readonly clock: Clock = () => new Date(),
  ) {}

  /** Crée un compte. Les inscriptions publiques donnent toujours le rôle « client ». */
  register(data: { name: string; email: string; password: string; role?: Role }): User {
    const email = data.email.trim().toLowerCase();
    if (this.users.findByEmailWithPassword(email)) throw conflict("Un compte existe déjà avec cet e-mail");
    return this.users.create({
      name: data.name.trim(),
      email,
      passwordHash: bcrypt.hashSync(data.password, 10),
      role: data.role ?? "client",
      createdAt: this.clock().toISOString(),
    });
  }

  login(email: string, password: string): { token: string; user: User } {
    const found = this.users.findByEmailWithPassword(email.trim().toLowerCase());
    // Même message dans les deux cas : on ne révèle pas si l'e-mail existe
    if (!found || !bcrypt.compareSync(password, found.passwordHash)) {
      throw unauthorized("E-mail ou mot de passe incorrect");
    }
    const { passwordHash: _ignored, ...user } = found;
    return { token: this.sign(user), user };
  }

  sign(user: Pick<User, "id" | "name" | "role">): string {
    const payload: AuthUser = { id: user.id, name: user.name, role: user.role };
    return jwt.sign(payload, this.jwtSecret, { expiresIn: this.jwtExpiresIn as SignOptions["expiresIn"] });
  }

  verify(token: string): AuthUser {
    try {
      const decoded = jwt.verify(token, this.jwtSecret) as AuthUser;
      return { id: decoded.id, name: decoded.name, role: decoded.role };
    } catch {
      throw unauthorized("Jeton invalide ou expiré");
    }
  }
}
