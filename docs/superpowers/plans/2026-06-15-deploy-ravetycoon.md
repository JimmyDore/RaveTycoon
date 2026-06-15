# Rave Tycoon — Production Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Continuously deploy Rave Tycoon to `https://ravetycoon.jimmydore.fr` on the Hetzner box on every push to `main`, with auto-HTTPS, a persisted leaderboard, and licensed sprites synced out-of-band.

**Architecture:** Build-on-server. GitHub Actions SSHes into the Hetzner box and runs `git reset --hard origin/main && docker compose up -d --build`. A new **Caddy** container owns ports 80/443, auto-provisions a Let's Encrypt cert for the domain, and reverse-proxies to the existing `web` (nginx) container, which serves the Vite build and proxies `/api/` to the `api` (node + node:sqlite) container. Licensed sprites (`public/assets/`, gitignored) live permanently on the server and are pushed via `rsync` only when they change; git carries everything else (code + committed audio).

**Tech Stack:** Docker + Compose v2, Caddy 2 (auto-TLS), nginx, Node 22, GitHub Actions, OVH DNS, Ubuntu 24.04.

---

## Locked Decisions (from grilling)

| # | Decision |
|---|----------|
| 1 | **Build on the server** — CI SSHes in, `git pull` + `docker compose up -d --build`. No registry. |
| 2 | **Caddy** added to the compose stack for auto-HTTPS; owns 80/443; reverse-proxies to `web`. |
| 3 | **DNS on OVH** — `A ravetycoon → 77.42.23.215`, `AAAA ravetycoon → 2a01:4f9:c012:5404::1` (user adding manually). |
| 4 | **Dedicated CI SSH key**, login as `root`. Private key in a GitHub Actions secret. |
| 5 | Repo at **`/root/ravetycoon`**. `public/assets/` synced via `rsync --delete`. |
| 6 | **Fresh empty leaderboard** (new Docker volume). |
| 7 | Brief rebuild downtime accepted; CI **health-checks** `/api/health` and goes red on failure; **fix-forward**, no auto-rollback. |
| 8 | I run the **one-time bootstrap live** over `ssh hetzner`. ACME email `jimmy@vianova.io`. |

## Verified Environment Facts

- Repo: `github.com/JimmyDore/RaveTycoon`, **public** → server clones over plain HTTPS, no auth.
- `gh` CLI authenticated as `JimmyDore` → secrets set via `gh secret set`.
- Server: Ubuntu 24.04, login `root`, **7.6 GB RAM, 61 GB free**, IPv4 `77.42.23.215`, IPv6 `2a01:4f9:c012:5404::1`.
- **No Docker installed yet.** **Nothing on 80/443.** **`ufw` active, default-DROP** → 80/443 must be opened.
- Existing stack: `web` (multi-stage Vite→nginx, build does `COPY public ./public`), `api` (zero-dep node:sqlite, volume `leaderboard-data:/data`). nginx already proxies `location /api/ → http://api:8787` and the api answers `GET /api/health → {"ok":true}`.

## File Structure

| File | Responsibility | Action |
|------|----------------|--------|
| `docker-compose.yml` | Add `caddy` service + TLS volumes; drop `web`'s host port (Caddy fronts it) | Modify |
| `deploy/Caddyfile` | Site address + ACME email + `reverse_proxy web:80`; env-parametrized so the same file serves prod (HTTPS) and local (plain HTTP) | Create |
| `.github/workflows/deploy.yml` | On push to `main`: SSH deploy + health check | Create |
| `package.json` | `deploy:assets` rsync script | Modify |
| `.gitignore` | Belt-and-suspenders ignore for any stray local deploy key | Modify |
| `README.md` | Replace the VPS deploy section with the new flow | Modify |
| *(server, no repo file)* | One-time bootstrap: ufw, Docker, clone, key, secrets, first up | Live via SSH |

---

## Task 1: Add Caddy + parametrized Caddyfile to the compose stack

**Files:**
- Create: `deploy/Caddyfile`
- Modify: `docker-compose.yml`

- [ ] **Step 1: Create `deploy/Caddyfile`**

The site address and ACME email are env-driven with production defaults, so the **same file** gives auto-HTTPS on the server and plain HTTP locally (set `SITE_ADDRESS=:80` for local).

```
{
	email {$ACME_EMAIL:jimmy@vianova.io}
}

{$SITE_ADDRESS:ravetycoon.jimmydore.fr} {
	reverse_proxy web:80
}
```

- [ ] **Step 2: Rewrite `docker-compose.yml`**

Adds `caddy` (owns 80/443, persistent cert volume), removes the `web` host port publish (only Caddy is exposed to the host now), adds Caddy volumes.

```yaml
services:
  caddy:
    image: caddy:2-alpine
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    environment:
      SITE_ADDRESS: ${SITE_ADDRESS:-ravetycoon.jimmydore.fr}
      ACME_EMAIL: ${ACME_EMAIL:-jimmy@vianova.io}
    volumes:
      - ./deploy/Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy-data:/data
      - caddy-config:/config
    depends_on:
      - web

  web:
    build:
      context: .
      dockerfile: deploy/Dockerfile.web
    restart: unless-stopped
    depends_on:
      - api

  api:
    build:
      context: .
      dockerfile: deploy/Dockerfile.api
    restart: unless-stopped
    volumes:
      - leaderboard-data:/data

volumes:
  leaderboard-data:
  caddy-data:
  caddy-config:
```

- [ ] **Step 3: Verify compose config parses**

Run: `docker compose config >/dev/null && echo OK`
Expected: `OK` (no schema errors). *(If `docker` isn't on the local machine, skip — it's verified on the server in Task 6.)*

- [ ] **Step 4: Verify the local plain-HTTP path renders the Caddyfile correctly**

Run: `SITE_ADDRESS=:80 docker compose config | grep -A2 environment`
Expected: shows `SITE_ADDRESS: :80` — confirming the override wins. *(Skip if no local docker.)*

- [ ] **Step 5: Commit**

```bash
git add deploy/Caddyfile docker-compose.yml
git commit -m "feat(deploy): front the stack with Caddy for auto-HTTPS"
```

---

## Task 2: Add the asset-sync script

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Add `deploy:assets` to the `scripts` block**

Insert after the existing `"assets"` line. Uses the user's local `hetzner` SSH alias; `--delete` mirrors local → server (stale sprites removed). Trailing slash on the source copies *contents*, not the dir.

```json
    "assets": "node tools/build-assets.mjs",
    "deploy:assets": "rsync -az --delete public/assets/ hetzner:/root/ravetycoon/public/assets/",
```

- [ ] **Step 2: Verify the script is registered**

Run: `npm run deploy:assets --help 2>/dev/null; npm run 2>/dev/null | grep deploy:assets`
Expected: `deploy:assets` listed.

- [ ] **Step 3: Dry-run the rsync (no changes made)**

Run: `rsync -azn --delete public/assets/ hetzner:/root/ravetycoon/public/assets/ | head`
Expected: prints the file list it *would* send, no errors. *(Real sync happens in Task 5; `-n` here is dry-run. The target dir may not exist yet — that's fine, Task 5 creates it.)*

- [ ] **Step 4: Commit**

```bash
git add package.json
git commit -m "chore(deploy): add deploy:assets rsync helper"
```

---

## Task 3: GitHub Actions deploy workflow

**Files:**
- Create: `.github/workflows/deploy.yml`

- [ ] **Step 1: Create the workflow**

SSHes in, fast-forwards the server to `origin/main` (gitignored `public/assets/` survives `reset --hard`), rebuilds, prunes dangling images, then polls the public health endpoint and fails red if it never returns `{"ok":true}`. `concurrency` serializes deploys so two pushes can't build at once.

```yaml
name: Deploy to Hetzner

on:
  push:
    branches: [main]
  workflow_dispatch:

concurrency:
  group: deploy-production
  cancel-in-progress: false

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Configure SSH
        run: |
          mkdir -p ~/.ssh
          echo "${{ secrets.DEPLOY_SSH_KEY }}" > ~/.ssh/id_ed25519
          chmod 600 ~/.ssh/id_ed25519
          echo "${{ secrets.DEPLOY_KNOWN_HOSTS }}" > ~/.ssh/known_hosts
          chmod 644 ~/.ssh/known_hosts

      - name: Deploy on server
        run: |
          ssh -i ~/.ssh/id_ed25519 root@77.42.23.215 'bash -s' <<'EOF'
          set -euo pipefail
          cd /root/ravetycoon
          git fetch --prune origin
          git reset --hard origin/main
          docker compose up -d --build
          docker image prune -f
          EOF

      - name: Health check
        run: |
          for i in $(seq 1 30); do
            if curl -fsS https://ravetycoon.jimmydore.fr/api/health | grep -q '"ok":true'; then
              echo "Health check passed on attempt $i"
              exit 0
            fi
            echo "Attempt $i: not healthy yet, retrying in 5s..."
            sleep 5
          done
          echo "Health check failed after 30 attempts"
          exit 1
```

- [ ] **Step 2: Lint the YAML**

Run: `python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/deploy.yml')); print('valid')"`
Expected: `valid`

- [ ] **Step 3: Commit (do NOT push yet — push happens after bootstrap in Task 6)**

```bash
git add .github/workflows/deploy.yml
git commit -m "ci(deploy): SSH deploy + health check on push to main"
```

---

## Task 4: Safety ignore + README deploy docs

**Files:**
- Modify: `.gitignore`
- Modify: `README.md`

- [ ] **Step 1: Add a deploy-key guard to `.gitignore`**

Belt-and-suspenders: the CI key is generated in `/tmp` (Task 5) so it should never land here, but guard against an accidental local copy.

Append to `.gitignore`:

```
# deploy keys — never commit
rt_deploy_key*
*.deploy_key
```

- [ ] **Step 2: Replace the "Déploiement (VPS)" section in `README.md`**

Find the current block (the last section, starting `## Déploiement (VPS)`) and replace it with:

```markdown
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
```

- [ ] **Step 3: Verify README has no leftover stale instructions**

Run: `grep -n "8080\|up -d --build" README.md`
Expected: no reference to `8080` remains; the manual-fallback `up -d --build` line is the only build command.

- [ ] **Step 4: Commit**

```bash
git add .gitignore README.md
git commit -m "docs(deploy): document Caddy/CI deploy flow and asset sync"
```

---

## Task 5: One-time server bootstrap (live via `ssh hetzner`)

> Executed live by Claude, narrating each step, pausing before anything destructive. No repo files change here. **Run this AFTER Tasks 1–4 are committed locally but coordinate with Task 6 for push ordering.**

**Pre-req gate:** Confirm DNS has propagated before starting (Caddy needs it for the cert):
- Run locally: `dig +short ravetycoon.jimmydore.fr` → must return `77.42.23.215`.

- [ ] **Step 1: Open the firewall for HTTP/HTTPS**

```bash
ssh hetzner 'ufw allow 80/tcp && ufw allow 443/tcp && ufw reload && ufw status'
```
Expected: `80/tcp ALLOW` and `443/tcp ALLOW` present; `22` still allowed (we're connected over it).

- [ ] **Step 2: Install Docker Engine + Compose plugin**

```bash
ssh hetzner 'curl -fsSL https://get.docker.com | sh && systemctl enable --now docker && docker --version && docker compose version'
```
Expected: prints Docker version and `Docker Compose version v2.x`.

- [ ] **Step 3: Clone the repo to `/root/ravetycoon`**

```bash
ssh hetzner 'git clone https://github.com/JimmyDore/RaveTycoon.git /root/ravetycoon && ls /root/ravetycoon'
```
Expected: repo contents listed (public repo, no auth needed).

- [ ] **Step 4: Generate the CI deploy keypair locally (in /tmp, never committed)**

```bash
ssh-keygen -t ed25519 -f /tmp/rt_deploy_key -N "" -C "github-actions-ravetycoon"
ls -l /tmp/rt_deploy_key /tmp/rt_deploy_key.pub
```
Expected: both files exist.

- [ ] **Step 5: Install the public key on the server (append, don't clobber)**

```bash
cat /tmp/rt_deploy_key.pub | ssh hetzner 'mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys && echo INSTALLED'
```
Expected: `INSTALLED`.

- [ ] **Step 6: Verify the CI key can log in (independent of personal key)**

```bash
ssh -i /tmp/rt_deploy_key -o IdentitiesOnly=yes root@77.42.23.215 'echo CI-KEY-OK'
```
Expected: `CI-KEY-OK`.

- [ ] **Step 7: Set GitHub Actions secrets via `gh`**

```bash
gh secret set DEPLOY_SSH_KEY < /tmp/rt_deploy_key --repo JimmyDore/RaveTycoon
ssh-keyscan -t ed25519,rsa,ecdsa 77.42.23.215 > /tmp/rt_known_hosts
gh secret set DEPLOY_KNOWN_HOSTS < /tmp/rt_known_hosts --repo JimmyDore/RaveTycoon
gh secret list --repo JimmyDore/RaveTycoon
```
Expected: `DEPLOY_SSH_KEY` and `DEPLOY_KNOWN_HOSTS` listed.

- [ ] **Step 8: Sync the licensed sprites to the server**

```bash
ssh hetzner 'mkdir -p /root/ravetycoon/public/assets'
npm run deploy:assets
ssh hetzner 'ls /root/ravetycoon/public/assets | head && find /root/ravetycoon/public/assets -type f | wc -l'
```
Expected: ~102 files present on the server (matches local count).

- [ ] **Step 9: Wipe the local CI private key from this machine (it now lives only in the GH secret)**

```bash
shred -u /tmp/rt_deploy_key 2>/dev/null || rm -f /tmp/rt_deploy_key
rm -f /tmp/rt_deploy_key.pub /tmp/rt_known_hosts
echo CLEANED
```
Expected: `CLEANED`.

---

## Task 6: First deploy + end-to-end verification

> Brings the new Caddy stack up for real and proves both the manual path and the automated CI path.

- [ ] **Step 1: Push all local commits to `main`**

```bash
git push origin main
```
Note: this triggers CI run #1. It may **fail fast** if Task 5 hasn't fully run yet (server not ready) — that's expected and harmless. We do a manual first `up` next to nail cert issuance safely (avoids hammering Let's Encrypt via CI retries).

- [ ] **Step 2: Manually bring the stack up on the server (first cert issuance)**

```bash
ssh hetzner 'cd /root/ravetycoon && git fetch origin && git reset --hard origin/main && docker compose up -d --build'
```
Expected: `caddy`, `web`, `api` containers built and started.

- [ ] **Step 3: Verify containers are healthy and Caddy got a cert**

```bash
ssh hetzner 'docker compose -f /root/ravetycoon/docker-compose.yml ps && docker compose -f /root/ravetycoon/docker-compose.yml logs caddy --tail 30 | grep -i "certificate obtained\|serving\|error"'
```
Expected: all three `Up`; Caddy log shows a certificate obtained for `ravetycoon.jimmydore.fr` (no ACME errors).

- [ ] **Step 4: Verify HTTPS + API from the outside**

```bash
curl -fsS https://ravetycoon.jimmydore.fr/api/health
echo
curl -fsSI https://ravetycoon.jimmydore.fr/ | head -5
```
Expected: `{"ok":true}` from the API; `HTTP/2 200` for the homepage with a valid cert (no `-k` needed).

- [ ] **Step 5: Verify HTTP→HTTPS redirect**

```bash
curl -sSI http://ravetycoon.jimmydore.fr/ | grep -i "location\|301\|308"
```
Expected: a redirect to `https://ravetycoon.jimmydore.fr/`.

- [ ] **Step 6: Prove the automated CI path end-to-end**

Re-run the deploy workflow (now that the server is fully bootstrapped):

```bash
gh workflow run "Deploy to Hetzner" --repo JimmyDore/RaveTycoon
gh run watch "$(gh run list --repo JimmyDore/RaveTycoon --workflow 'Deploy to Hetzner' --limit 1 --json databaseId -q '.[0].databaseId')" --repo JimmyDore/RaveTycoon
```
Expected: workflow completes **green**, including the health-check step.

- [ ] **Step 7: Verify the deploy loop with a trivial real change**

Make a no-op visible change (e.g. a comment in `README.md`), commit, push, and confirm CI auto-deploys green and the site still serves `200`.

```bash
git commit --allow-empty -m "chore: verify auto-deploy pipeline"
git push origin main
gh run watch "$(gh run list --repo JimmyDore/RaveTycoon --limit 1 --json databaseId -q '.[0].databaseId')" --repo JimmyDore/RaveTycoon
```
Expected: green run; `curl -fsS https://ravetycoon.jimmydore.fr/api/health` → `{"ok":true}`.

---

## Self-Review

**1. Spec coverage**

| Requirement (from prompt/grilling) | Task |
|---|---|
| Auto-deploy on push to main via GitHub Actions | Task 3, verified Task 6 |
| Domain `ravetycoon.jimmydore.fr` | Task 1 (Caddyfile), DNS (user/OVH), verified Task 6 |
| CNAME/DNS guidance | Provided in chat (A/AAAA on OVH), gated in Task 5 pre-req |
| Licensed `resources` not in git, copied to server cleanly | Task 2 + Task 5 Step 8 (rsync) |
| Fully dockerized / docker-compose | Pre-existing + Task 1 (Caddy) |
| HTTPS | Task 1 (Caddy auto-TLS), verified Task 6 |
| Fresh leaderboard | Task 1 (new `leaderboard-data` volume, never seeded) |
| Health-checked deploys, fix-forward | Task 3 health-check step |

**2. Placeholder scan:** No TBD/TODO/"handle edge cases" — every step has exact file contents or exact commands with expected output.

**3. Type/name consistency:** Secret names (`DEPLOY_SSH_KEY`, `DEPLOY_KNOWN_HOSTS`), host (`77.42.23.215`), path (`/root/ravetycoon`), env vars (`SITE_ADDRESS`, `ACME_EMAIL`), volumes (`caddy-data`, `caddy-config`, `leaderboard-data`), and the health string `{"ok":true}` are identical across Tasks 1, 3, 5, 6.

**Known minor:** CI run #1 (Task 6 Step 1) may show one harmless red ❌ if it races ahead of bootstrap; the manual first `up` (Step 2) owns cert issuance to avoid Let's Encrypt rate-limit retries, and Step 6 proves the green automated path.
