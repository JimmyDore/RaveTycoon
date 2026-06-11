# Rave Tycoon

Tycoon hybride actif/idle sur la scène free-party française. Tu montes ton
sound system, tu poses ton mur de son dans un champ paumé, et tu travailles
la table de mixage pendant la teuf : pousser le volume et les basses fait
venir les teufeurs — mais chaque dB nourrit la jauge des bleus. Tiens jusqu'au
lever du soleil, encaisse le prix libre, réinvestis dans du matos, et grimpe
jusqu'au teknival légendaire.

**La table mixe vraiment le son** : stems audio adaptatifs (Web Audio API,
100 % synthétisés, zéro asset), la foule danse sur le vrai kick, le clipping
distord audiblement, et la surcharge du groupe électrogène coupe le son.

## Jouer

- Navigateur, responsive mobile, tactile. Français only.
- Sauvegarde automatique en `localStorage` + codes d'export/import.
- Classement par pseudo (sans compte) : plus grosse teuf, plus gros gain,
  bust le plus légendaire.

## Dev

```bash
npm install
npm run dev            # frontend sur :5173 (proxy /api → :8787)
node server/index.mjs  # API classement (Node ≥ 22.5, node:sqlite, zéro dépendance)

npm test               # tests du cœur de simulation (vitest)
cd server && npm test  # tests de l'API (node --test)
npm run build          # build de prod dans dist/
```

### Architecture

```
src/core/    simulation pure et déterministe (testée) : foule, heat, matos, économie, idle, saves
src/audio/   synthèse procédurale des stems (OfflineAudioContext) + moteur de mix adaptatif
src/render/  scène pixel-art canvas + simulation de teufeurs synchronisée au beat
src/ui/      écrans DOM français, faders tactiles, carte recap partageable, client API
server/      API classement : node:http + node:sqlite, zéro dépendance npm
deploy/      nginx + Dockerfiles
```

## Déploiement (VPS)

```bash
docker compose up -d --build   # web sur :8080 (nginx, proxy /api → api), sqlite persisté en volume
```
