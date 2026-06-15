# Rave Tycoon

Jeu de gestion hybride actif/idle sur la scène free-party française, dans la
veine de Game Dev Tycoon : tu diriges un **sound system collectif**. Tu
recrutes des DJs dans la scène, tu montes le line-up, tu achètes le matos, tu
choisis le spot — puis la nuit se déroule sous tes yeux et tu prends les
décisions qui comptent : qui joue le peak time, pousser le son ou calmer le
jeu quand les bleus tournent. Tiens jusqu'au lever du soleil, partage le prix
libre avec le crew, et grimpe jusqu'au teknival légendaire.

**Tu entends tes décisions** : stems audio adaptatifs pilotés par la
simulation (Web Audio, 100 % synthétisés). Un DJ briefé « pousser le son »
sature audiblement, un groupe électrogène fatigué crachote, la foule danse
sur le vrai kick.

## Jouer

- Navigateur, responsive mobile, tactile. Français only.
- Sauvegarde automatique en `localStorage` + codes d'export/import.
- Classement par pseudo (sans compte) : plus grosse teuf, plus gros gain,
  bust le plus légendaire.

## Dev

Les graphismes utilisent les packs payants **Modern Interiors / Modern
Exteriors** de [LimeZu](https://limezu.itch.io) (licence sans redistribution :
les packs ne sont **pas** dans le repo). Place les zips extraits dans
`assets-src/moderninteriors/` et `assets-src/modernexteriors/`, puis :

```bash
npm install
npm run assets         # compose les spritesheets → public/assets/ (gitignoré)
npm run dev            # frontend sur :5173 (proxy /api → :8787)
node server/index.mjs  # API classement (Node ≥ 22.5, node:sqlite, zéro dépendance)

npm test               # tests du cœur de simulation (vitest)
cd server && npm test  # tests de l'API (node --test)
npm run build          # build de prod dans dist/
```

### Architecture

```
src/core/    simulation pure et déterministe (testée) : nuit en sets, crew de DJs,
             événements, foule/heat/économie, idle (buzz, réparations, fatigue), saves
src/audio/   synthèse procédurale des stems + moteur de mix piloté par la simulation
src/render/  scène pixel-art (tiles + sprites LimeZu), foule dansante synchro au beat
src/ui/      écrans DOM français : préparation, nuit (transitions de sets, événements),
             recap partageable, classement
tools/       pipeline d'assets (sharp) : packs LimeZu → spritesheets minimales
server/      API classement : node:http + node:sqlite, zéro dépendance npm
deploy/      Caddy (TLS auto) + nginx + Dockerfiles
```

## Déploiement

Production : `https://ravetycoon.jimmydore.fr`, sur un VPS Hetzner, en
**build-on-server**. Chaque push sur `main` déclenche un workflow GitHub
Actions qui se connecte en SSH et reconstruit la stack.

### Stack (docker compose)

- `caddy` — termine le TLS (Let's Encrypt auto), possède 80/443, proxy → `web`
- `web` — build Vite servi par nginx, proxy `/api/` → `api`
- `api` — classement node:sqlite, sqlite persisté dans un volume

### Assets licenciés (hors git)

`public/assets/` (spritesheets LimeZu) est gitignoré : il vit en permanence
sur le serveur dans `/root/ravetycoon/public/assets/` et survit aux `git pull`.
Après un `npm run assets`, pousse-les avec :

```bash
npm run deploy:assets   # rsync --delete public/assets/ → hetzner:/root/ravetycoon/public/assets/
```

Le CI ne touche jamais aux assets : il suppose qu'ils sont déjà sur la box.

### Déploiement manuel (secours)

```bash
ssh hetzner
cd /root/ravetycoon && git pull && docker compose up -d --build
```
