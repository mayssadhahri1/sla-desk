// Configuration lue depuis les variables d'environnement (fichier .env facultatif)
try {
  process.loadEnvFile();
} catch {
  // Pas de fichier .env : on garde les valeurs par défaut
}

export interface AppConfig {
  port: number;
  databasePath: string;
  jwtSecret: string;
  jwtExpiresIn: string;
  /** Crée les comptes et tickets de démonstration au premier démarrage */
  seedDemo: boolean;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const jwtSecret = env.JWT_SECRET ?? "dev-secret-a-changer";
  if (env.NODE_ENV === "production" && jwtSecret === "dev-secret-a-changer") {
    throw new Error("JWT_SECRET doit être défini en production");
  }
  return {
    port: Number(env.PORT ?? 3000),
    databasePath: env.DATABASE_PATH ?? "./sla-desk.db",
    jwtSecret,
    jwtExpiresIn: env.JWT_EXPIRES_IN ?? "8h",
    // Par défaut : données de démo en développement, jamais en production sauf demande explicite
    seedDemo: env.SEED_DEMO ? env.SEED_DEMO === "true" : env.NODE_ENV !== "production",
  };
}
