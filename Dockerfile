# ---- Étape 1 : compilation TypeScript ----
FROM node:22-slim AS build
WORKDIR /app
COPY package.json ./
RUN npm install --no-audit --no-fund
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

# ---- Étape 2 : image d'exécution légère (sans outils de développement) ----
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY public ./public

# Utilisateur non-root et dossier pour la base SQLite
RUN mkdir -p /app/data && chown -R node:node /app/data
USER node
ENV DATABASE_PATH=/app/data/sla-desk.db PORT=3000
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s CMD node -e "fetch('http://localhost:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "--disable-warning=ExperimentalWarning", "dist/server.js"]
