// Point d'entrée : ouvre la base, crée l'application et démarre le serveur HTTP

import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { openDatabase } from "./db/database.js";
import { seedIfEmpty } from "./db/seed.js";

const config = loadConfig();
const db = openDatabase(config.databasePath);
if (config.seedDemo && seedIfEmpty(db)) console.log("Données de démonstration créées (mot de passe : Demo1234!)");

const app = createApp(db, config);
const server = app.listen(config.port, () => {
  console.log(`SLA Desk démarré sur http://localhost:${config.port}`);
});

// Arrêt propre (Docker envoie SIGTERM)
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    server.close(() => {
      db.close();
      process.exit(0);
    });
  });
}
