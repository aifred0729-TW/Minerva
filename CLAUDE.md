# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **Related docs — read these too.** This file is the canonical, in-depth guide for AI agents working in this repo.
> - **[AGENTS.md](AGENTS.md)** — the cross-tool entry point (Cursor / Copilot / Codex / etc.). It is a thin pointer back to this file plus the few must-never-break rules; keep the two in sync when you change agent-facing guidance here.
> - **[CONTRIBUTING.md](CONTRIBUTING.md)** — contribution workflow and repo policy (commit/version conventions, the "must run against a real Mythic" rule, desktop build/release). Follow it for any change you intend to commit.

## What this is

**Minerva** is a cyberpunk-themed React UI that is a drop-in replacement for the [Mythic C2 Framework](https://github.com/its-a-feature/Mythic)'s built-in `MythicReactUI`. It talks to an existing Mythic backend over GraphQL (Hasura) and, optionally, to a Metasploit Framework instance over MSF-RPC. There is **no backend in this repo** — it is purely the operator-facing frontend plus the Docker/Nginx/scripts glue that deploys it against a Mythic server.

> Note: `package.json` still carries the upstream `name: "mythic"`. The app itself is Minerva; everything lives under `src/Minerva/`.

## Commands

The app is normally run **inside Docker** against a live Mythic instance (a raw `npm start` on the host has no backend to talk to). `MYTHIC_ADDRESS` (default `https://host.docker.internal:7443`) points Nginx at the Mythic API.

```bash
# Development (hot reload) — nginx + react-app-rewired dev server, source mounted from ./src
docker compose -f docker-compose.dev.yml up -d --build
docker logs -f minerva-dev            # wait for "webpack compiled"; browse https://<host>/

# Production / official deploy — nginx (TLS on 443) in front of the same dev server
docker compose up -d --build

# Optional Metasploit RPC daemon (exposes /msf-rpc/ upstream on :55553)
docker compose -f docker-compose.metasploit.yml up -d

# Point at a remote Mythic
MYTHIC_ADDRESS=https://10.0.0.5:7443 docker compose -f docker-compose.dev.yml up -d --build
```

Host-side npm scripts (via `react-app-rewired`, not plain CRA):

```bash
npm run build        # production static build (react-build)
npm start            # dev server on :3000 (polling watchers enabled for Docker)
npm run react-test   # Jest via react-scripts — NOTE: there are currently zero test files
```

There is **no lint script** and **no test suite**. ESLint runs as part of the CRA build (config in `package.json` `eslintConfig`); unused vars are warnings, and names prefixed `_` are ignored.

### Desktop app (Electron)

```bash
npm run electron:start   # react-build, then launch the desktop app against the built bundle
npm run electron:dev     # HMR: run `npm start` in another terminal first (uses the CRA dev server)
npm run dist             # react-build + package installers (dmg/zip, nsis, AppImage/deb) → dist_electron/
```

The desktop app connects to a Mythic server whose address the operator enters on first launch (or via `MINERVA_MYTHIC_ADDRESS` / `MYTHIC_ADDRESS` env). See the architecture section below — no `src/` changes are involved.

### Installing into a Mythic host instead of standalone

`scripts/minerva_install.sh` swaps Minerva into Mythic's own `MythicReactUI` dir so it ships through `./mythic-cli`. Subcommands: `verify`, `fix`, `status`, `clean`, `uninstall`, and `msf-start|msf-stop|msf-status|msf-verify`. Set `MYTHIC_DIR` (default `/opt/Mythic`). It also runs `scripts/mythic_change.sh`, which patches Mythic's Go source to accept JSON-encoded ARRAY build parameters, and `scripts/configure-hasura-agentstorage.sh` to enable shared graph-node sync.

## Build system gotchas

- Build is **CRA + react-app-rewired**; all webpack customization is in `config-overrides.js`, not a webpack config.
- **`@` is aliased to `src/Minerva`** (see `config-overrides.js`). Node builtins are polyfilled (`crypto`, `path`, `stream`, `assert`); `fs`/`vm` resolve to `false`.
- **TypeScript errors are non-blocking.** `config-overrides.js` strips `ForkTsCheckerWebpackPlugin`, and `.env` sets `TSC_COMPILE_ON_ERROR=true` / `ESLINT_NO_DEV_ERRORS=true`. A type error will not stop the dev server or the build — verify types deliberately if it matters.
- `node_modules` / `package.json` are baked into the Docker image and **not** mounted; after changing dependencies you must rebuild the image (`--build`).

## Architecture

### Entry & routing
- `src/index.js` — React root. Restores the session from `localStorage`, mounts `ApolloProvider` + `BrowserRouter` with **`basename="/new"`** (the whole app lives under `/new/…`; `homepage` in `package.json` is `/new`).
- `src/Minerva/App.tsx` — every page is `React.lazy`-imported and code-split per route. All authenticated routes are nested under a single persistent `<Layout />` so the sidebar, audio player, event subscriptions, and battle-mode shell never remount on navigation. Public routes: `login`, `invite`.

### Data layer (three coexisting state systems — know which one you're touching)
1. **Apollo Client 4 + GraphQL** is the single transport for everything Mythic-related. Queries/mutations/subscriptions live in `src/Minerva/lib/api/*.ts`, split by domain (`callbacks.ts`, `tasks.ts`, `files.ts`, …) and re-exported from `lib/api/index.ts`. Live updates use **subscriptions over `graphql-ws`** on the same `wss://<host>/graphql/` endpoint (Callbacks, EventFeed, Payloads, Console, Tunnels, …). Apollo/link setup: `src/Minerva/lib/apollo.ts` + `websocket.ts`; legacy cache in `src/cache.js`.
   - **Reactive vars** (`src/Minerva/lib/state.ts`): `meState` (auth/user) and `mePreferences` (operator preference overrides) are read via `useReactiveVar` throughout.
   - `lib/useQueryCompat.ts` is an Apollo 3→4 compatibility shim — prefer `useLazyQueryCompat`/`useQueryCompat` over raw Apollo hooks where the codebase already does.
2. **Zustand store** (`src/Minerva/store.ts`, persisted to localStorage): UI/session state that isn't server-owned — sidebar collapse, console tabs, alert count, audio (music library refs, volume, per-SFX toggles), logout flag.
3. **IndexedDB** (`lib/musicDB.ts`, custom-graph-node cache): binary music files and local graph-node cache.

### Cross-operator shared state
- **Custom graph nodes** (relay/proxy topology drawn on the callback graph) are stored server-side in Hasura's `agentstorage` table via `lib/customGraphNodeService.ts` — serialized, polled/merged every ~5 s, so all logged-in operators see the same topology. Requires the Hasura permissions set up by `configure-hasura-agentstorage.sh`.
- **Mythic KV store** (`lib/mythicKVStore.ts`) persists things like Metasploit UI state into Mythic's operator-preferences blob (same `updateOperatorPreferences` mutation Mythic uses) rather than only localStorage. Wired to the Apollo client in `App.tsx`.

### Metasploit (the one non-GraphQL integration)
- The `/new/metasploit` page (`src/Minerva/pages/Metasploit/`) drives a JSON-RPC client in `pages/Metasploit/msfrpc.ts` against `msfrpcd`, proxied through Nginx at `/msf-rpc/`. Execution history is persisted in IndexedDB.
- MSF sessions are surfaced through the **same** `/console/:id` route as Mythic callbacks. Their numeric display IDs are offset by `MSF_DISPLAY_ID_OFFSET` (see `pages/Callbacks/msfSyntheticCallbacks.ts`) to partition the ID space; the legacy `/msf-console/:sessionId` route redirects into the unified console.

### Auth
`src/Minerva/lib/auth.ts` — JWT validation, refresh, and `FailedRefresh`. `App.tsx` runs a 60 s interval that warns 30 min before expiry and auto-logs-out on expiry. Tokens live in localStorage and are restored in `src/index.js`.

### Theming, audio, battle mode
- CSS-variable-driven themes via `context/ThemeContext.tsx` + `index.css`; Tailwind tokens (`signal`/`void`/`ghost`/`machine` + accent) in `tailwind.config.js`. MUI 7 is bridged in `src/themes/`. Design conventions are documented in `docs/DESIGN_LANGUAGE.md`.
- `context/BattleModeContext.tsx` + `components/BattleMode.tsx` retune density/animation/ambient sound (Combat/Recon/Normal). Audio: `lib/soundEffects.ts` (per-event SFX) and `components/GlobalAudioPlayer.tsx` (IndexedDB music library).

### Reusable components worth reusing
`src/Minerva/components/` holds the shared shell and the `Cyber*` / `Mythic*` primitives (`CyberModal`, `CyberTable`, `CyberDropdown`, `MythicDialog`, `MythicTextField`, …), plus the big feature widgets: `CallbackGraph/` (ReactFlow + elkjs layout), `FileBrowser/`, and `OutputRenderer/` (structured console output — Mimikatz/secretsdump parsers, process lists, file-browser overlays). Prefer these over hand-rolling new dialogs/tables.

## Deployment topology (Nginx)

Nginx (port 443, self-signed cert auto-generated on first run into `nginx/ssl/`) is the single entry point and reverse proxy. It serves the app under `/new/` and proxies `/graphql/` (HTTP + WS upgrade), `/auth`, `/refresh`, `/invite`, `/direct`, and `/msf-rpc/` to `MYTHIC_ADDRESS` (and the MSF container). Templates: `nginx/nginx.conf.template` (prod) and `nginx/nginx.dev.conf.template` (dev, adds `/ws` for HMR); cert generation + `envsubst` in `nginx/docker-entrypoint.sh`.

## Desktop app architecture (`electron/`)

The desktop build (Electron) is a **standalone** operator app: install one binary, enter a Mythic address, connect — no Docker, no Nginx on the operator's laptop. The critical design constraint is that **nothing under `src/` changes** — the React app stays a pure same-origin web app.

This works because the Electron main process **replicates Nginx** in `electron/proxy.js` (a plain Node `http.Server` + `http-proxy`), and the window loads the bundled `build/` from that proxy's origin. The proxy is a faithful port of `nginx.dev.conf.template` — keep them in sync if either changes:

- `/graphql/` (HTTP + WS upgrade), `/api/`, `/auth`, `/refresh`, `/invite`, `/direct/` → forwarded verbatim to the configured Mythic address, with `secure:false` terminating Mythic's self-signed TLS (= `proxy_ssl_verify off`) and `changeOrigin:false` preserving the client Host (= `proxy_set_header Host $host`).
- `/msf-rpc/…` → **path-rewritten** to `/api/…` on the MSF address (matches nginx `proxy_pass …/api/`).
- `/` → 302 `/new/login`; `/new/*` → served from `build/` (SPA fallback to `index.html`), or proxied to the CRA dev server when `MINERVA_DEV_SERVER` is set (HMR mode).

Key files and invariants:
- `electron/main.js` — app lifecycle, window, menu, first-run settings prompt, IPC, and a **host-scoped** `certificate-error` handler (trusts only the configured Mythic/MSF hosts).
- `electron/config.js` — Mythic/MSF address resolution: env (`MINERVA_MYTHIC_ADDRESS`/`MYTHIC_ADDRESS`, `MINERVA_MSF_ADDRESS`) → `minerva-config.json` in userData → localhost default.
- `electron/settings.html` + `electron/preload.js` — the only place with a preload/`contextBridge`; the **main app window intentionally has no preload** so the web origin stays clean.
- **Stable origin matters:** the proxy binds a fixed port (`MINERVA_PORT`, default `41390`) so `window.location.origin` is stable across launches — this is what keeps the JWT in localStorage, the IndexedDB music library, and the graph-node cache alive between restarts. `127.0.0.1` is a Chromium secure context, so `navigator.clipboard` / `crypto.subtle` work over plain HTTP with no cert.
- Because upstream TLS is terminated on the Node side, the webview only ever speaks HTTP to localhost — there are **no CORS or cert prompts to work around** in the renderer.
