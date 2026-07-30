# Contributing to Minerva

Thanks for improving Minerva — the cyberpunk operator console for the [Mythic C2 Framework](https://github.com/its-a-feature/Mythic).

Before you start, skim **[CLAUDE.md](CLAUDE.md)** (architecture + conventions) and **[AGENTS.md](AGENTS.md)** (the short must-not-break list). This file covers how to set up, verify, and land a change.

## Authorized use

Minerva is offensive-security tooling: it drives a live command-and-control framework. Only contribute features intended for **authorized** engagements — sanctioned red-team operations, CTFs, security research, and defensive testing. Don't add capabilities whose only purpose is unauthorized access, mass targeting, or evading defenders in the wild. Licensed under **AGPL-3.0** (see `LICENSE`); by contributing you agree your work is released under it.

## Project shape (know this before editing)

- **Frontend only.** No backend lives here. The UI talks to a running Mythic (GraphQL/WebSocket) and, optionally, Metasploit (MSF-RPC). You need a reachable Mythic instance to run or verify anything meaningful.
- **App code is under `src/Minerva/`.** (`package.json` still carries the upstream `name: "mythic"` — that's expected.)
- **Same-origin by design.** All API calls are relative URLs; a reverse proxy (Nginx in Docker, or the Electron main process) handles routing + TLS. See rule 1 in AGENTS.md — don't break it.

## Setup & running

Pick the surface you're working on. `npm install` requires `--legacy-peer-deps` (React 19 vs react-scripts 5 peer ranges):

```bash
npm install --legacy-peer-deps
```

### Web UI (Docker, against a real Mythic)

```bash
# Hot-reload dev stack (nginx + CRA dev server); browse https://<host>/
docker compose -f docker-compose.dev.yml up -d --build
docker logs -f minerva-dev            # wait for "webpack compiled"

# Point at a remote Mythic
MYTHIC_ADDRESS=https://10.0.0.5:7443 docker compose -f docker-compose.dev.yml up -d --build
```

### Desktop app (Electron, standalone)

```bash
npm run electron:start   # react-build, then launch against the built bundle
npm run electron:dev     # HMR — run `npm start` in a second terminal first
npm run dist             # package installers → dist_electron/
```

On first launch the app asks for a Mythic address (or set `MINERVA_MYTHIC_ADDRESS` / `MYTHIC_ADDRESS`; MSF via `MINERVA_MSF_ADDRESS`). Self-signed Mythic certs are accepted for the configured host. `electron/proxy.js` is a hand-port of `nginx/nginx.dev.conf.template` — **if you touch a proxied path in one, update the other.**

## Verifying a change (there is no test suite)

This repo has **no automated tests and no lint script**, and **TypeScript errors are non-blocking** (the type-check plugin is stripped; `.env` sets `TSC_COMPILE_ON_ERROR=true`). So:

- A successful `npm run build` / green dev server does **not** prove type correctness — check types deliberately for the files you touched (e.g. `npx tsc --noEmit` on the area, understanding it may surface many pre-existing errors elsewhere).
- **Verify behavior by driving the actual feature** against a real Mythic instance (Docker stack or the Electron app), not just by compiling. Note in your PR what you exercised and what you observed.
- If you changed the Electron proxy, confirm login + a GraphQL subscription (e.g. the Callbacks page updating live) and, if relevant, an MSF-RPC call through `/msf-rpc/`.

## Releases & desktop installers (CI)

Desktop installers are built by GitHub Actions (`.github/workflows/desktop-build.yml`) on **macOS, Windows, and Linux** runners — you don't build cross-platform locally.

- **Cut a release:** bump `version` in `package.json`, then push a tag `vX.Y.Z`. The workflow builds `dmg`/`zip` (macOS), `nsis` (Windows), and `AppImage`/`deb` (Linux) and publishes them to a GitHub Release (plus `electron-updater` metadata).
- **Dry run:** trigger the workflow manually (`workflow_dispatch`) to build all three and download the installers as workflow artifacts without publishing.
- **Signing:** builds are currently **unsigned** (`CSC_IDENTITY_AUTO_DISCOVERY: false`). macOS will warn about an unidentified developer until code-signing + notarization secrets are added to the workflow.

Local packaging for one platform: `npm run dist` (installers → `dist_electron/`) or `npm run dist:dir` (unpacked app, faster sanity check).

## Commits & versioning

- **Conventional-commit prefixes**, matching the existing history: `feat:`, `fix:`, `refactor:`. Release-level commits use the form `feat: Minerva v2.1 — <summary>` / `fix: Minerva v2.1.2 — <summary>`.
- Bump the version in `package.json` for release commits; keep `CHANGELOG.MD` updated for user-facing changes.
- Keep unrelated changes in separate commits. Don't commit `build/`, `dist_electron/`, or `nginx/ssl/` (all git-ignored).
- Branch off `main`; open a PR rather than pushing to `main` directly.

## Style

- Match the surrounding code — this codebase leans on Tailwind tokens (`signal`/`void`/`ghost`/`machine` + accent) and the shared `Cyber*` / `Mythic*` components. Reuse them instead of hand-rolling dialogs, tables, and dropdowns (see CLAUDE.md → "Reusable components").
- Visual/interaction conventions live in `docs/DESIGN_LANGUAGE.md`.
- Unused vars are ESLint warnings; prefix intentionally-unused names with `_`.
