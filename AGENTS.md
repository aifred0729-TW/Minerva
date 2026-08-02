# AGENTS.md

Cross-tool entry point for AI coding agents (Cursor, Copilot, Codex, Claude Code, …) working in the **Minerva** repository.

## Canonical guidance lives in CLAUDE.md

**[CLAUDE.md](CLAUDE.md) is the source of truth** for architecture, commands, and conventions — read it first. This file only restates the few rules that are expensive to rediscover, so a tool that reads *only* `AGENTS.md` still avoids the landmines. If you change agent-facing guidance, edit `CLAUDE.md` and keep this summary in sync.

For contribution workflow and policy, see **[CONTRIBUTING.md](CONTRIBUTING.md)**.

## What Minerva is (one paragraph)

A cyberpunk-themed React UI that is a **drop-in replacement for the Mythic C2 Framework's `MythicReactUI`**. It is frontend-only: it talks to a running Mythic backend over GraphQL/WebSocket and, optionally, to Metasploit over MSF-RPC. There is no backend in this repo. App code lives under `src/Minerva/` (note `package.json` still says `name: "mythic"`).

## Must-not-break rules

1. **The app is same-origin only.** Every network call is a relative URL (`/graphql/`, `/auth`, `/refresh`, `/api/…`, `/direct/…`, `/msf-rpc/…`) resolved against `window.location.origin`. A reverse proxy (Nginx in Docker, or the Electron main process in the desktop app) does the real routing and TLS termination. **Do not hardcode Mythic's address or introduce absolute cross-origin URLs / new CORS assumptions in `src/`.**
2. **Keep the desktop proxy in sync with Nginx.** `electron/proxy.js` is a hand-port of `nginx/nginx.dev.conf.template`. If you add or change a proxied path in one, change the other (see CLAUDE.md → "Desktop app architecture").
3. **TypeScript errors are non-blocking** (the type-check plugin is stripped in `config-overrides.js`; `.env` sets `TSC_COMPILE_ON_ERROR=true`). A green build does **not** mean types are sound — verify types deliberately.
4. **There is no test suite and no lint script.** Don't claim "tests pass." Verify changes by running the app against a real Mythic instance (Docker or the Electron app).
5. **Know which state layer you're touching:** Apollo/GraphQL (server data + `meState`/`mePreferences` reactive vars), the persisted Zustand store (`store.ts`, UI/session), and IndexedDB (music, graph-node cache). Details in CLAUDE.md.
6. **This is offensive-security software (a C2 operator console).** Contributions must serve authorized red-team / defensive use — see the "Authorized use" section of [CONTRIBUTING.md](CONTRIBUTING.md).

## Fastest path to context

- Architecture, data layer, routing, desktop app: **CLAUDE.md**
- How to run / build / package, commit & version conventions: **CONTRIBUTING.md**
- Feature tour, deployment, screenshots: **README.md**
- Visual/design conventions: **docs/DESIGN_LANGUAGE.md**
