<p align="center">
  <img src="docs/banner.jpg" alt="Minerva - Next-Generation Mythic C2 Interface" width="100%">
</p>

<p align="center">
  <a href="README.zh-TW.md">繁體中文</a> | English
</p>

<p align="center">
  <strong>Next-Generation Mythic C2 Interface</strong><br>
  Cyberpunk-styled, real-time, collaborative Command &amp; Control UI built for advanced red-team operators
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-0.3.106-green?style=flat-square" alt="Version">
  <img src="https://img.shields.io/badge/license-AGPL--3.0-blue?style=flat-square" alt="License">
  <img src="https://img.shields.io/badge/react-19.2-61DAFB?style=flat-square&logo=react" alt="React">
  <img src="https://img.shields.io/badge/typescript-5.9%2B-3178C6?style=flat-square&logo=typescript" alt="TypeScript">
  <img src="https://img.shields.io/badge/tailwind-3.4-06B6D4?style=flat-square&logo=tailwindcss" alt="Tailwind">
  <img src="https://img.shields.io/badge/three.js-0.183-black?style=flat-square&logo=three.js" alt="Three.js">
  <img src="https://img.shields.io/badge/apollo-4.1-311C87?style=flat-square&logo=apollographql" alt="Apollo">
</p>

<p align="center">
  <img src="docs/screenshots/dashboard.png" alt="Minerva Dashboard" width="100%">
</p>

---

## Table of Contents

- [Overview](#overview)
- [Screenshots](#screenshots)
- [Feature Matrix](#feature-matrix)
- [Application Map](#application-map)
- [Tech Stack](#tech-stack)
- [Quick Start (Production)](#quick-start-production)
- [Development Mode (Hot Reload)](#development-mode-hot-reload)
- [Metasploit Integration](#metasploit-integration)
- [Setup Script (`minerva_install.sh`)](#setup-script-minerva_installsh)
- [Mythic Source Patches (`mythic_change.sh`)](#mythic-source-patches-mythic_changesh)
- [Project Structure](#project-structure)
- [Architecture](#architecture)
- [Routing &amp; Sidebar](#routing--sidebar)
- [Nginx Proxy Layout](#nginx-proxy-layout)
- [Theme System](#theme-system)
- [Battle Mode](#battle-mode)
- [Audio System](#audio-system)
- [Custom Graph Nodes](#custom-graph-nodes)
- [Authentication &amp; Sessions](#authentication--sessions)
- [Environment Variables](#environment-variables)
- [Troubleshooting](#troubleshooting)
- [License](#license)

---

## Overview

<p align="center">
  <img src="docs/screenshots/login.png" alt="Minerva Login" width="100%">
</p>

**Minerva** is a modern, cyberpunk-themed web interface for the [Mythic C2 Framework](https://github.com/its-a-feature/Mythic). It is a drop-in replacement for Mythic's built-in `MythicReactUI`, designed from the ground up for operators who run long red-team engagements and need a dense, low-friction operational console.

Compared to the stock Mythic UI, Minerva adds:

- **Real-time collaborative graphs** &mdash; ReactFlow-powered callback topology with shared custom nodes for relay / proxy infrastructure, synced every 5 s across all logged-in operators via Hasura.
- **3D cyber-topology** &mdash; Three.js scene with orbit controls, subnet (CIDR) grouping, physics-based positioning, dashed P2P links, and context menus.
- **Rich interactive console** &mdash; Multi-tab terminal with structured output blocks, Mimikatz parsing, process list rendering, file-browser overlays, and inline tasking forms.
- **Quick Hack workflows** &mdash; Pre-canned, one-click red-team workflows over callbacks (recon, persistence, dumping, lateral movement) chained as tasking macros.
- **Native Metasploit integration** &mdash; First-class MSF-RPC client with launch dashboard, session-lifecycle management, persistent execution history, and live task-browser output parsing.
- **MITRE ATT&amp;CK matrix** &mdash; Full T-id matrix with task / command / tag overlays so operators can see live coverage of techniques.
- **Eventing workflows** &mdash; Visual builder for Mythic eventing instances with keyword triggers and conditional steps.
- **Battle Mode** &mdash; Tactical UI mode (Combat / Recon / Normal) that re-tunes density, animation speed, and ambient sound for active operations.
- **Theming &amp; audio** &mdash; CSS-variable driven dark/light themes, custom background image, JetBrains Mono / Inter typography, IndexedDB-backed music library, and per-event SFX.

Minerva can run two ways:

1. **Standalone Docker** &mdash; A self-contained `minerva` container (Nginx + static build) that proxies `/graphql`, `/auth`, `/refresh`, `/msf-rpc`, `/direct` to an existing Mythic instance. Best for production / sealed deployments.
2. **Replace `mythic_react`** &mdash; Use `scripts/minerva_install.sh` to swap Minerva into Mythic's own `MythicReactUI` directory so it ships through Mythic's normal lifecycle (`./mythic-cli ...`).

---

## Screenshots

### 1 · Authentication

#### Login

Cyberpunk-styled authentication with real-time server status monitoring, HTTPS encryption indicator, and a session-state tracker.

<p align="center">
  <img src="docs/screenshots/login.png" alt="Login Page" width="100%">
</p>

### 2 · Command &amp; Control

#### Dashboard

Central operational overview &mdash; active callbacks, total payloads, C2 infrastructure status, operation details, command statistics, asset-collection metrics, top commands and a recent activity feed.

<p align="center">
  <img src="docs/screenshots/dashboard.png" alt="Dashboard" width="100%">
</p>

#### Event Feed

Live event stream with alert counter. Drives the sidebar notification bell and surfaces new callbacks, alerts, custom events, feedback and startup events as they happen.

<p align="center">
  <img src="docs/screenshots/events.png" alt="Event Feed" width="100%">
</p>

#### Operations Manager

Operation lifecycle management with status tracking (Active / Complete / Deleted), operator assignments, and per-operation OPSEC command blocklists.

<p align="center">
  <img src="docs/screenshots/operations.png" alt="Operations Manager" width="100%">
</p>

#### OPSEC

Per-operation OPSEC controls &mdash; command blocklists, role-based gates, and tasking-time enforcement.

<p align="center">
  <img src="docs/screenshots/opsec.png" alt="OPSEC" width="100%">
</p>

### 3 · Callbacks &amp; Tasking

#### Active Callbacks

ReactFlow graph view showing the Minerva core node connected to active agents. Shared custom nodes model relay / proxy infrastructure. The sortable data table below supports bulk actions, sleep / jitter editing, grouping, and last-checkin badges.

<p align="center">
  <img src="docs/screenshots/callbacks.png" alt="Active Callbacks" width="100%">
</p>

#### Console Selection

Tab picker for the multi-callback interactive console. Displays every previously opened tab so operators can jump between callbacks without losing context.

<p align="center">
  <img src="docs/screenshots/console-selection.png" alt="Console Selection" width="100%">
</p>

#### Interactive Console

Rich command tasking with structured output blocks &mdash; Mimikatz parsing, process listings, file-browser overlays, inline tasking forms, drag-and-drop uploads, and a real-time streaming task block.

<p align="center">
  <img src="docs/screenshots/console.png" alt="Interactive Console" width="100%">
</p>

#### Tasks

Per-task deep-view with full host tree, parameter inspector, structured output viewer, and prev/next task navigation.

<p align="center">
  <img src="docs/screenshots/tasks.png" alt="Tasks" width="100%">
</p>

### 4 · Payloads

#### Payloads Overview

Hub for payload listing, multi-step Create-Payload wizard, and the Wrapper flow. Supports import / export of payload configurations and rebuild-from-existing.

<p align="center">
  <img src="docs/screenshots/payloads.png" alt="Payloads Overview" width="100%">
</p>

#### Create Payload Wizard

Step-by-step build pipeline: OS &rarr; type &rarr; commands &rarr; C2 &rarr; build. Each step persists state so operators can step back and adjust without losing progress.

<p align="center">
  <img src="docs/screenshots/create-payload.png" alt="Create Payload" width="100%">
</p>

#### Payload Types

Unified view of every installed agent / wrapper / translator / consuming-service / custom-browser. Header toolbar adds **search**, **sort (name / status / commands)**, **online-only** filter, and a **show-deleted** toggle. Each card shows the agent's SVG icon, container status, build-parameter inspector, command browser, container-file editor, and one-click test of webhook / logger events.

<p align="center">
  <img src="docs/screenshots/payload-types.png" alt="Payload Types" width="100%">
</p>

### 5 · Files, Credentials &amp; Intel

#### File Manager

Centralized file management with a categorized sidebar for Downloads, Uploads, Screenshots, and Eventing workflow files. Includes the target-machine file-browser tree.

<p align="center">
  <img src="docs/screenshots/files.png" alt="File Manager" width="100%">
</p>

#### Credentials Vault

Credential storage with multi-field search (Account, Realm, Credential, Comment, Tag). Tracks verified vs harvested counts and links each credential back to its originating task.

<p align="center">
  <img src="docs/screenshots/credentials.png" alt="Credentials Vault" width="100%">
</p>

#### Artifacts

Indicator-of-compromise / artifact viewer with task linkage and host attribution.

<p align="center">
  <img src="docs/screenshots/artifacts.png" alt="Artifacts" width="100%">
</p>

#### Search

Global cross-entity search across tasks, files, credentials, callbacks, and artifacts with advanced filtering.

<p align="center">
  <img src="docs/screenshots/search.png" alt="Global Search" width="100%">
</p>

### 6 · Infrastructure

#### C2 Profiles

C2 communication profile management showing all installed profiles (discord, dns, github, http, https, tcp, websocket) with version info, status indicators, container-file listing / editing, and start/stop controls.

<p align="center">
  <img src="docs/screenshots/c2profiles.png" alt="C2 Profiles" width="100%">
</p>

#### Tunnel Manager

Tunnel management with a visual flow diagram showing operator-side proxy, C2 server relay, and target-side endpoint. Displays active tunnel status, port mappings, and the full connection chain.

<p align="center">
  <img src="docs/screenshots/tunnels.png" alt="Tunnel Manager" width="100%">
</p>

#### 3D Cyber-Topology

Full Three.js 3D map with interactive orbit controls. Nodes are color-coded by type (Core / Alive / Dead / Custom). Dashed lines indicate P2P relations; a tunnel layer overlays active SOCKS / RPORTFWD chains; a legend / status bar tracks real-time node counts.

<p align="center">
  <img src="docs/screenshots/topology3d.png" alt="3D Cyber-Topology" width="100%">
</p>

### 7 · Automation &amp; Frameworks

#### Quick Hacks

One-click red-team workflow library (recon / persistence / dumping / lateral) that chains commands across selected callbacks. Workflows are JSON-defined and operator-extensible.

<p align="center">
  <img src="docs/screenshots/quickhacks.png" alt="Quick Hacks" width="100%">
</p>

#### Metasploit

Native MSF-RPC client. Tabs cover **Dashboard** (sessions / jobs / modules), **Launch Attack** (module browser + parameter form), **Operations** (live sessions, jobs, routes), and **Task History** (persistent execution history with full output).

<p align="center">
  <img src="docs/screenshots/metasploit.png" alt="Metasploit" width="100%">
</p>

#### Eventing

Visual workflow builder for Mythic eventing &mdash; event groups, instances, keyword triggers, conditional steps, and a real-time stream of matching events.

<p align="center">
  <img src="docs/screenshots/eventing.png" alt="Eventing" width="100%">
</p>

### 8 · Intel &amp; MITRE

#### MITRE ATT&amp;CK

Full MITRE ATT&amp;CK matrix visualization with 637 techniques mapped across all tactical categories. Filter by Tasks, Tasks/PT, Commands, or Tags &mdash; cells light up to show live execution coverage.

<p align="center">
  <img src="docs/screenshots/mitre.png" alt="MITRE ATT&CK" width="100%">
</p>

### 9 · Admin &amp; Customization

#### Users

Operator administration: create, edit, deactivate, change passwords, and toggle admin roles.

<p align="center">
  <img src="docs/screenshots/users.png" alt="Users" width="100%">
</p>

#### Reporting

Report builder driven by operation data with analytics, filters, and export options.

<p align="center">
  <img src="docs/screenshots/reporting.png" alt="Reporting" width="100%">
</p>

#### Browser Scripts

Editable browser-script library with virtualized tables, sortable columns, `tabs` rendering, and per-payload-type scoping.

<p align="center">
  <img src="docs/screenshots/browser-scripts.png" alt="Browser Scripts" width="100%">
</p>

#### Tags

Tag-based organization and filtering across all entities.

<p align="center">
  <img src="docs/screenshots/tags.png" alt="Tags" width="100%">
</p>

#### Settings

Comprehensive preferences panel covering operator preferences, display toggles, timestamp formatting, task-interaction modes, browser-script options, audio / music library, theme palette, and sidebar shortcut ordering.

<p align="center">
  <img src="docs/screenshots/settings.png" alt="Settings" width="100%">
</p>

---

## Feature Matrix

### Core Operations

| Feature | Description |
|---------|-------------|
| **Callbacks** | Real-time callback tracking with health indicators (alive/dead/streaming), bulk operations, grouping, last-checkin badges, and sleep/jitter editing |
| **Console** | Multi-tab interactive command tasking with syntax-highlighted output blocks, split-view DB output, command history, autoScroll toggle, drag-and-drop file uploads, and streaming task results |
| **Tasks** | Dedicated single-task view with full host tree, parameter inspector, output viewer, and per-task navigation |
| **Payloads** | Multi-step Create-Payload wizard (OS &rarr; type &rarr; commands &rarr; C2 &rarr; build), Wrapper flow, payload import/export, rebuild-from-existing, and tab-cap on browser-script `tabs` output |
| **Files** | Download / upload tracking, screenshot viewer with thumbnail grid, keylog search, drag-and-drop modal uploads, and artifact organization |
| **Credentials** | Vault with deduplication, hash management, account linking, and multi-field search |
| **Search** | Global cross-entity search across tasks, files, credentials, callbacks, and artifacts with advanced filtering |
| **Artifacts** | Indicator-of-compromise / artifact viewer with task linkage |
| **Tags** | Tag-based organization and filtering across all entities |

### Visualization

| Feature | Description |
|---------|-------------|
| **Callback Graph** | Interactive 2D graph using ReactFlow with ELK auto-layout, custom node creation, edge management, PNG export, and a graph-config panel |
| **3D Topology** | Three.js 3D network map with orbit controls, subnet grouping (CIDR), physics-based positioning, tunnel-layer overlay, and right-click context menus |
| **Custom Nodes** | Operator-defined relay / proxy nodes stored server-side in Hasura `agentstorage`; synced across all connected operators every 5 s |
| **MITRE ATT&amp;CK** | Full ATT&amp;CK matrix with technique mapping, execution tracking, and Task / Command / Tag overlays |
| **Tunnel Map** | Cyberpunk flow diagram showing parent-child tunnel relationships, port mappings, and live status |

### Advanced

| Feature | Description |
|---------|-------------|
| **Battle Mode** | Combat / Recon / Normal mode switching with tactical UI optimizations (2&times; animation speed in Combat, dimmed non-critical info in Recon) |
| **Eventing** | Visual workflow builder for Mythic eventing &mdash; event groups, instances, keyword triggers, conditional steps, real-time stream of matching events |
| **Quick Hack** | One-click red-team workflow library (recon / persistence / dumping / lateral) that chains commands across selected callbacks |
| **Metasploit** | Native MSF-RPC client with launch dashboard, session list, job control, stored credentials, and persistent execution history |
| **Operations** | Operation lifecycle management with role-based access and per-op OPSEC command blocklists |
| **Reporting** | Report generation from operation data with analytics |
| **C2 Profiles** | Profile configuration, container file listing / editing, and start/stop control |
| **PayloadTypes** | Unified view of every installed agent / wrapper / translator / consuming-service / custom-browser with live status, build-parameter inspector, command browser, container-file editor, and one-click test of webhook / logger events |
| **Browser Scripts** | Editable custom browser-script library with virtualized tables, sortable columns, `tabs` rendering, and per-PT scoping |
| **Audio System** | Global music player (IndexedDB-stored library), per-event sound effects (callback, tunnel, auth, error), individual SFX toggles |
| **Theme &amp; Palette** | Dark / Light themes, customizable accent colors, custom background image, JetBrains Mono / Inter typography |

---

## Application Map

The whole UI is mounted under `/new/...` (so it can co-exist with stock `mythic_react`). Routes:

| Path | Page | Purpose |
|------|------|---------|
| `/new/login` | `Login` | JWT auth + server status / SSL indicator |
| `/new/invite` | `Invite` | Operator invite-link registration |
| `/new/dashboard` | `Dashboard` | Operational overview &amp; activity feed |
| `/new/events` | `EventFeed` | Live event stream w/ alert counter |
| `/new/callbacks` | `Callbacks` | Active callback table + graph view |
| `/new/callbacks/:displayId` | `Callbacks` | Focused callback (deep-link) |
| `/new/console` | `ConsoleSelection` | Console tab picker |
| `/new/console/:id` | `Console` | Interactive tasking terminal |
| `/new/task` &middot; `/new/task/:displayId` | `SingleTaskView` | Per-task deep view |
| `/new/payloads` | `Payloads` | Payload list + tabs (list / create / wrapper) |
| `/new/create-payload/*` | `CreatePayload` | Multi-step build wizard |
| `/new/create-wrapper` | (redirect) | &rarr; `/payloads?tab=wrapper` |
| `/new/credentials` | `Credentials` | Credential vault |
| `/new/files` | `Files` | File manager + screenshots |
| `/new/c2-profiles` | `C2Profiles` | C2 profile management |
| `/new/payload-types` | `PayloadTypes` | All installed agents / services |
| `/new/tunnels` | `Tunnels` | SOCKS / RPORTFWD topology |
| `/new/topology` | `Topology3D` | 3D network map |
| `/new/quickhacks` | `QuickHacks` | One-click workflow library |
| `/new/metasploit` | `Metasploit` | MSF-RPC dashboard / attack / history |
| `/new/eventing` | `Eventing` | Workflow / event-group builder |
| `/new/mitre` | `MitreAttack` | ATT&amp;CK matrix |
| `/new/search` | `Search` | Global search |
| `/new/artifacts` | `Artifacts` | Artifact viewer |
| `/new/reporting` | `Reporting` | Report builder |
| `/new/operations` | `Operations` | Operation lifecycle + OPSEC blocklists |
| `/new/users` | `Users` | Operator administration |
| `/new/browser-scripts` | `BrowserScripts` | Custom browser scripts |
| `/new/tags` | `Tags` | Tag management |
| `/new/opsec` | `Opsec` | Operation OPSEC controls |
| `/new/settings` | `Settings` | All operator preferences |

> Sidebar items can be re-ordered or hidden per-operator via **Settings &rarr; Sidebar Shortcuts**. The default list is also where `/new/jupyter` and `/new/graphql` external links live (they open Mythic's Jupyter and Hasura console respectively).

---

## Tech Stack

| Category | Technologies |
|----------|--------------|
| **Frontend** | React 19, TypeScript 5.9+, React Router 7 |
| **Styling** | Tailwind CSS 3.4, Material-UI 7, Emotion, Framer Motion |
| **State** | Zustand 5 (persisted app store), Apollo Client 4 (GraphQL + cache + reactive vars) |
| **Real-time** | GraphQL subscriptions over WebSocket via `graphql-ws` |
| **3D** | Three.js 0.183, `@react-three/fiber`, `@react-three/drei` |
| **Graph** | `@xyflow/react` 12.6 + `elkjs` 0.11 hierarchical layout |
| **Charts** | MUI X Charts, MUI X Data Grid |
| **Editor** | React Ace (syntax highlighting in code editors / Eventing workflows) |
| **Data &amp; Storage** | IndexedDB (`musicDB`, custom-graph-node cache), `sql.js` for local SQLite, Hasura `agentstorage` for shared state |
| **Animation** | Framer Motion (transitions, modals), CSS animations (scan-lines, glitch) |
| **Build** | React App Rewired 2.2, Webpack 5, PostCSS, `config-overrides.js` |
| **Deploy** | Docker, Nginx (SSL + reverse proxy + WS upgrade) |
| **External** | MSF-RPC (Metasploit Framework) via JSON-RPC over HTTP |

---

## Quick Start (Production)

<p align="center">
  <img src="docs/screenshots/dashboard.png" alt="Production target" width="100%">
</p>

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and Docker Compose
- A running [Mythic C2](https://github.com/its-a-feature/Mythic) instance reachable from the host (default: `https://host.docker.internal:7443`)
- Open port **443** on the host

### Standalone Container

```bash
git clone https://github.com/redmeow-tw/Minerva.git
cd Minerva

# Build static React bundle and Nginx image, then run
docker compose build
docker compose up -d
```

Open **https://&lt;your-host&gt;/** &mdash; you'll be redirected to `/new/login`. Log in with your Mythic credentials.

To point at a remote Mythic instance:

```bash
MYTHIC_ADDRESS=https://10.0.0.5:7443 docker compose up -d
```

To stop:

```bash
docker compose down
```

> The default `docker-compose.yml` exposes only Minerva (port 443). `MYTHIC_ADDRESS` is passed into Nginx as a template variable and used for `/graphql`, `/auth`, `/refresh`, `/invite`, `/direct` upstreams.

### Replacing `mythic_react` (Recommended for Operators)

If you want Minerva to *be* Mythic's web UI (handled by `./mythic-cli`), use the bundled setup script:

```bash
# From /opt/Minerva
./scripts/minerva_install.sh         # full install (backup + copy + build + apply patches)
./scripts/minerva_install.sh verify  # verify install
./scripts/minerva_install.sh status  # show container status & logs
./scripts/minerva_install.sh fix     # re-sync src and rebuild
./scripts/minerva_install.sh clean   # clean custom graph nodes from DB
./scripts/minerva_install.sh uninstall  # restore original MythicReactUI from backup

# Metasploit:
./scripts/minerva_install.sh msf-start    # start MSF-RPC container
./scripts/minerva_install.sh msf-stop     # stop MSF-RPC container
./scripts/minerva_install.sh msf-status   # status + logs
./scripts/minerva_install.sh msf-verify   # Python connectivity check
```

The script:

1. Backs up the original `MythicReactUI` to `MythicReactUI.bak`.
2. Copies Minerva's `src/`, config files, `Dockerfile`, and `package*.json` into `MythicReactUI`.
3. Runs `mythic_change.sh` to patch Mythic's Go source (see below).
4. Configures the Hasura `agentstorage` table so custom graph nodes can sync between operators.
5. Rebuilds the `mythic_react` container.

Set `MYTHIC_DIR` env var if your Mythic install is not at `/opt/Mythic`.

---

## Development Mode (Hot Reload)

### Architecture

Dev mode uses two containers:

| Container | Role | Description |
|-----------|------|-------------|
| `minerva-dev` | React Dev Server | Runs `react-app-rewired start` on port 3000 with HMR. Source code is mounted as volumes so any change triggers an instant browser refresh. |
| `minerva`     | Nginx SSL Proxy  | Listens on **443** with self-signed SSL. Proxies `/new/` &rarr; dev server, `/ws` &rarr; HMR WebSocket, and `/graphql/`, `/auth`, `/refresh`, `/invite`, `/msf-rpc/`, `/direct/` &rarr; Mythic. |

```
Browser :443 ── nginx (SSL) ── minerva-dev :3000   (React dev server + HMR)
                       ├──  Mythic :7443           (API / GraphQL / WebSocket)
                       └──  Metasploit :55553      (optional MSF-RPC)
```

### Quick Start

```bash
docker compose -f docker-compose.dev.yml up -d --build
docker logs -f minerva-dev   # wait for "webpack compiled"
```

Open **https://&lt;your-host&gt;/** &mdash; any change under `src/` or `public/` hot-reloads in &lt; 1 s.

### Mounted Volumes

| Host Path | Container Path | Purpose |
|-----------|----------------|---------|
| `./src/` | `/app/src/` | React source (hot reload) |
| `./public/` | `/app/public/` | Static assets |
| `./tailwind.config.js` | `/app/tailwind.config.js` | Tailwind theme |
| `./postcss.config.js` | `/app/postcss.config.js` | PostCSS |
| `./config-overrides.js` | `/app/config-overrides.js` | Webpack overrides |
| `./tsconfig.json` | `/app/tsconfig.json` | TypeScript config |
| `./.env` | `/app/.env` | Build-time env vars |

> `node_modules/` and `package.json` are **not** mounted &mdash; they live in the image. After adding / removing npm packages, rebuild with `docker compose -f docker-compose.dev.yml up -d --build`.

### Connecting to a Remote Mythic

```bash
MYTHIC_ADDRESS=https://10.0.0.5:7443 \
docker compose -f docker-compose.dev.yml up -d --build
```

### Switching Between Dev and Production

```bash
# Dev (HMR) → Production (static build)
docker compose -f docker-compose.dev.yml down
docker compose up -d --build

# Production → Dev
docker compose down
docker compose -f docker-compose.dev.yml up -d --build
```

---

## Metasploit Integration

<p align="center">
  <img src="docs/screenshots/metasploit.png" alt="Metasploit dashboard" width="100%">
</p>

Minerva ships a first-class Metasploit page powered by an MSF-RPC daemon container.

### Stack

```
React (Metasploit page)
   └── /msf-rpc/  (nginx, proxy_pass)
         └── minerva_msf :55553  (msfrpcd --user msf --pass minerva_msf -S -a 0.0.0.0)
```

### Starting MSF-RPC

```bash
# Option A: via minerva_install.sh wrapper
./scripts/minerva_install.sh msf-start
./scripts/minerva_install.sh msf-verify   # Python sanity check via msfrpc_verify.py

# Option B: directly with compose
docker compose -f docker-compose.metasploit.yml up -d
```

Override credentials / port:

```bash
MSFRPC_USER=msf MSFRPC_PASS=changeme MSFRPC_PORT=55553 \
docker compose -f docker-compose.metasploit.yml up -d
```

### Page Tabs

| Tab | Purpose |
|-----|---------|
| **Dashboard** | Connection state, host stats, session counts, recent jobs |
| **Attack** | Module browser, parameter form, launch with target / payload, save credentials, dry-run preview |
| **Operations** | Active sessions, jobs &amp; routes &mdash; kill session, stop job, hop / portfwd |
| **History** | Persistent (IndexedDB) execution history of every launched attack with full output |

The MSF-RPC client lives in `src/Minerva/pages/Metasploit/msfrpc.ts`. The page polls `getFullStatus` every 15 s and lazy-loads each tab.

---

## Setup Script (`minerva_install.sh`)

Unified entry point for installing Minerva into Mythic, managing the optional MSF-RPC service, and resetting state.

```
Usage: ./scripts/minerva_install.sh [command]

Commands:
  (none)      Full install (backup + copy + build + patches)
  verify      Verify installation is correct
  fix         Re-sync source and rebuild mythic_react
  status      Show container status and logs
  clean       Remove custom graph nodes from the database
  uninstall   Restore original MythicReactUI from backup

Metasploit:
  msf-start   Deploy & start Metasploit RPC container
  msf-stop    Stop Metasploit RPC container
  msf-status  Show Metasploit container status & logs
  msf-verify  Verify MSF-RPC connectivity (Python)

  help        Show this message

Environment:
  MYTHIC_DIR  Path to Mythic (default: /opt/Mythic)
```

The script is idempotent &mdash; re-running `install` is safe and will skip steps that are already complete.

---

## Mythic Source Patches (`mythic_change.sh`)

A few Minerva features (array-type build parameters, payload re-import) need patched logic inside Mythic itself. `scripts/mythic_change.sh` applies these patches deterministically:

| File patched | Symptom without patch | Fix |
|--------------|-----------------------|-----|
| `mythic-docker/src/rabbitmq/utils.go` &middot; `GetFinalStringForDatabaseInstanceValueFromUserSuppliedValue` &mdash; ARRAY case | `bad type for *_PARAMETER_TYPE_ARRAY: string` when re-importing or rebuilding payloads whose array parameters arrive JSON-encoded as strings | Add `case string:` that validates the input is a valid JSON array and returns it |
| `mythic-docker/src/rabbitmq/utils.go` &middot; `getSyncToDatabaseValueForDefaultValue` &mdash; ARRAY case | Same error on agent sync when a C2 profile / payload type sends a JSON-encoded array default | Same `case string:` handler |

The script is invoked automatically by `minerva_install.sh`, but you can run it standalone:

```bash
MYTHIC_DIR=/opt/Mythic ./scripts/mythic_change.sh
```

Running it twice is safe (idempotent).

---

## Project Structure

```
Minerva/
├── docker-compose.yml              # Production (single nginx container)
├── docker-compose.dev.yml          # Development (nginx + dev server)
├── docker-compose.metasploit.yml   # Optional MSF-RPC daemon
├── docker/
│   ├── Dockerfile.prod             # Build static React + Nginx
│   ├── Dockerfile.dev              # Node dev server + HMR
│   ├── Dockerfile.nginx            # Nginx (used in dev compose)
│   └── Dockerfile                  # Inside-Mythic build (mythic_react)
├── nginx/
│   ├── nginx.conf.template         # Prod template (alias /new + proxies)
│   ├── nginx.dev.conf.template     # Dev template (proxy to dev server + /ws)
│   └── docker-entrypoint.sh        # SSL cert generation + envsubst
├── scripts/
│   ├── minerva_install.sh          # install / verify / fix / status / msf-*
│   ├── mythic_change.sh            # Patches Mythic Go source (array params)
│   ├── configure-hasura-agentstorage.sh   # Enable agentstorage for graph sync
│   ├── clear-custom-nodes.sh       # Wipe custom graph nodes from DB
│   ├── clear-nodes.sql             # SQL used by clear-custom-nodes
│   ├── debug-custom-nodes.sh       # Print custom-node state from Hasura
│   ├── msfrpc_verify.py            # Sanity check MSF-RPC connectivity
│   ├── take_screenshots.js         # README screenshot capture (Puppeteer)
│   └── take_login_only.js          # One-shot login screenshot
├── docs/                           # Banner + screenshots
├── public/                         # Static assets (favicon, audio, etc.)
├── tailwind.config.js              # Theme tokens (signal/void/ghost/machine + accent)
├── postcss.config.js
├── config-overrides.js             # Webpack overrides
├── tsconfig.json
├── package.json
└── src/
    ├── index.js                    # React root + Apollo + WS link
    ├── cache.js                    # Apollo cache + reactive vars
    ├── themes/                     # MUI theme bridges
    ├── components/                 # Legacy shared components
    └── Minerva/
        ├── App.tsx                 # Router + auth bootstrap (code-split routes)
        ├── store.ts                # Zustand app store (sidebar, audio, console tabs)
        ├── index.css               # Tailwind base + CSS vars + cyber-scrollbar
        │
        ├── context/
        │   ├── BattleModeContext.tsx
        │   └── ThemeContext.tsx
        │
        ├── pages/                  # All routes (lazy-loaded)
        │   ├── Dashboard.tsx
        │   ├── Login.tsx · Invite.tsx
        │   ├── Callbacks/          (graph + table + dialogs + utils)
        │   ├── Console/            (terminal + context menu + parsers)
        │   ├── ConsoleSelection.tsx
        │   ├── SingleTaskView/     (host tree, task detail, list)
        │   ├── Payloads/
        │   ├── CreatePayload/      (multi-step wizard)
        │   ├── CreateWrapper/
        │   ├── PayloadTypes/       (search/sort/agent icons + build params + commands + files)
        │   │   ├── index.tsx
        │   │   ├── BuildParamsDialog.tsx
        │   │   ├── CommandsDialog.tsx
        │   │   └── ContainerFilesDialog.tsx
        │   ├── Files/              (filetable, screenshots, modals)
        │   ├── Credentials.tsx
        │   ├── C2Profiles.tsx
        │   ├── Tunnels/ · TunnelMap.tsx
        │   ├── Topology3D/         (3D scene + tunnel layer + detail panel)
        │   ├── QuickHacks.tsx
        │   ├── Metasploit/         (msfrpc, LaunchAttack, Operations, TaskBrowser, history)
        │   ├── Eventing/           (workflow builder, triggers, instances)
        │   ├── EventFeed.tsx
        │   ├── Operations/         (lifecycle + OPSEC blocklists)
        │   ├── Opsec.tsx
        │   ├── MitreAttack.tsx
        │   ├── BrowserScripts.tsx
        │   ├── Search/
        │   ├── Artifacts.tsx
        │   ├── Reporting.tsx
        │   ├── Tags.tsx
        │   ├── Users.tsx
        │   └── Settings/           (Audio, Palette, SidebarShortcuts, rows)
        │
        ├── components/             # Reusable UI
        │   ├── Layout.tsx           # Shared shell (sidebar + outlet)
        │   ├── Sidebar.tsx
        │   ├── CallbackGraph/       # ReactFlow graph + nodes + edges + layout
        │   ├── FileBrowser/         # Callback / server / virtual file trees
        │   ├── OutputRenderer/      # core, panels, parsed, graph renderers
        │   ├── CyberModal.tsx · CyberAlert · CyberDropdown · CyberTable
        │   ├── GlobalAudioPlayer.tsx
        │   ├── BattleMode.tsx
        │   ├── EventNotifications.tsx
        │   ├── ErrorBoundary.tsx
        │   ├── OSIcons.tsx
        │   ├── MythicConfirmDialog · MythicDialog · MythicFileUpload · MythicTextField …
        │   └── …
        │
        ├── lib/
        │   ├── api/                 # GraphQL queries / mutations / subscriptions, split per domain
        │   │   ├── index.ts          (re-exports everything)
        │   │   ├── payloadTypes.ts   (the file backing /payload-types)
        │   │   ├── callbacks.ts · tasks.ts · files.ts · tunnels.ts · operations.ts …
        │   ├── auth.ts               # JWT helpers, refresh logic
        │   ├── state.ts              # Apollo reactive vars (meState, mePreferences)
        │   ├── snackbar.ts           # toast helpers
        │   ├── soundEffects.ts       # per-event SFX
        │   ├── musicDB.ts            # IndexedDB music library
        │   ├── customGraphNodeService.ts  # Shared graph nodes (Hasura agentstorage)
        │   ├── useQueryCompat.ts     # Apollo 4 compat layer
        │   └── utils.ts
        │
        ├── hooks/                   # useCopyToClipboard, useDebounce, useFromNow, usePagination
        ├── types/                   # TS interfaces for every domain
        └── constants/               # api endpoints, colors
```

---

## Architecture

### Apollo client + reactive vars

- **GraphQL** is the single transport for everything except the Metasploit RPC. Queries and mutations live in `lib/api/*.ts`, grouped by domain.
- **Subscriptions** use `graphql-ws` over the same `wss://&lt;host&gt;/graphql/` endpoint. Pages such as Callbacks, EventFeed, Payloads, PayloadTypes, Tunnels, and Console rely on subscriptions for live updates.
- **Reactive variables** (`meState`, `mePreferences`) expose authenticated user state and preference overrides to any component.

### Routing &amp; code-splitting

- Every route is `React.lazy`-imported in `App.tsx` so the initial bundle is small; visiting a route streams in its chunk.
- A single shared `<Layout />` is mounted for every authenticated route so the sidebar, audio player, event notifications, and battle-mode shell never re-mount during navigation.

### State

- **Zustand store** (`store.ts`, persisted to localStorage) holds: sidebar collapse, console tabs, alert count, audio (music library, volume, per-SFX toggles), and notification preferences.
- **Apollo cache** holds GraphQL entities.
- **IndexedDB** stores binary music files and a local custom-graph-node cache.

### Real-time custom graph nodes

Custom graph nodes are stored server-side in Hasura's `agentstorage` table so every operator sees the same topology. `customGraphNodeService.ts` handles serialization, 5 s polling sync, conflict-tolerant merging, and `DEBUG_GRAPH` logging. The `configure-hasura-agentstorage.sh` script wires up the necessary Hasura permissions on install.

---

## Routing &amp; Sidebar

The sidebar (see `components/Sidebar.tsx`) lists every page. Operators can re-order or hide entries via **Settings &rarr; Sidebar Shortcuts**.

Default key set (used by `getMythicSetting('sideShortcuts')`):

```
dashboard · events · callbacks · console · task · payloads · credentials · files
c2-profiles · tunnels · quickhacks · users · search · topology · metasploit · settings
opsec · operations · artifacts · mitre · reporting · tags · browser-scripts · eventing
payload-types · jupyter · graphql
```

`jupyter` and `graphql` are *external* links that open Mythic's Jupyter notebook and Hasura console.

---

## Nginx Proxy Layout

Nginx (port 443, self-signed SSL) is the single entry point. It performs SSL termination and proxies to either Mythic or Metasploit.

| Location | Upstream | Notes |
|----------|----------|-------|
| `/` | redirect to `/new/login` | |
| `/new/` | static bundle (prod) **or** `minerva-dev:3000` (dev) | hot reload + WS upgrade in dev |
| `/ws` | `minerva-dev:3000/ws` (dev only) | webpack HMR socket |
| `/graphql/` | `${MYTHIC_ADDRESS}/graphql/` | HTTP + WS upgrade, 86400 s read timeout |
| `/auth` | `${MYTHIC_ADDRESS}/auth` | JWT acquisition |
| `/invite` | `${MYTHIC_ADDRESS}/invite` | Operator invite registration |
| `/refresh` | `${MYTHIC_ADDRESS}/refresh` | JWT refresh |
| `/direct/` | `${MYTHIC_ADDRESS}/direct/` | File download |
| `/msf-rpc/` | `minerva_msf:55553` | MSF-RPC JSON-RPC (optional) |

Buffers and bodies are tuned for large JWTs (16k) and 50 MB uploads.

---

## Theme System

<p align="center">
  <img src="docs/screenshots/settings.png" alt="Settings &amp; theme palette" width="100%">
</p>

Minerva uses CSS custom properties so themes can be swapped without recompiling. The base palette is defined in `index.css`:

```css
/* Dark theme (default) */
:root {
  --color-signal:  255 255 255  /* text & highlights      */
  --color-accent:   34 197  94  /* green accent           */
  --color-void:      0   0   0  /* background             */
  --color-ghost:   153 153 153  /* borders & secondary    */
  --color-machine:  51  51  51  /* card backgrounds       */
}

/* Light theme */
:root.minerva-light {
  --color-signal:   30  30  40
  --color-accent:   22 163  74
  --color-void:    240 240 245
  --color-ghost:    90  90 100
  --color-machine: 225 225 230
}
```

Fonts: **JetBrains Mono** (monospace) and **Inter** (sans-serif).

Operators can also set a custom background image and per-component output colors via **Settings &rarr; Palette**.

---

## Battle Mode

<p align="center">
  <img src="docs/screenshots/callbacks.png" alt="Battle Mode on the Callbacks page" width="100%">
</p>

`context/BattleModeContext.tsx` exposes three operational modes:

- **NORMAL** &mdash; default; full chrome &amp; animation budget.
- **RECON** &mdash; dim non-critical chrome, prioritize legibility.
- **COMBAT** &mdash; tactical UI: 2&times; animation speed, accent color shifts to alarm-red, ambient SFX volume bumped.

Toggle via the sidebar's combat / recon icons. The mode is persisted in the Zustand store.

---

## Audio System

<p align="center">
  <img src="docs/screenshots/settings.png" alt="Audio settings" width="100%">
</p>

Two-layer audio:

1. **Global music player** &mdash; user-uploaded tracks stored in IndexedDB (`musicDB`). Playback survives navigation and survives full page reloads via `useAppStore` state (`musicPlaying`, `musicTrackId`).
2. **Sound effects** &mdash; per-event SFX for new callbacks, tunnels, auth alerts, key clicks, etc. Individual SFX can be toggled via **Settings &rarr; Audio**.

All audio respects the global `sfxEnabled` / `musicEnabled` flags.

---

## Custom Graph Nodes

<p align="center">
  <img src="docs/screenshots/callbacks.png" alt="Custom nodes in the Callbacks graph" width="100%">
</p>

Custom nodes model relay / proxy infrastructure that Mythic doesn't natively know about. They are persisted in Hasura's `agentstorage` table so all operators see the same view.

| Action | How |
|--------|-----|
| Create node | Right-click empty space in **Callbacks &rarr; Graph View** &rarr; *Create Custom Node* |
| Connect nodes | Right-click a node &rarr; *Set Parent* |
| Edit / delete | Right-click a node &rarr; *Edit* / *Delete* |
| Reset all | `./scripts/clear-custom-nodes.sh` |

Each node stores hostname, IP, OS, architecture, C2 profile selection, position, and color. Positions persist across sessions; data syncs across connected operators via 5 s polling. Toggle `DEBUG_GRAPH = true` in `CallbackGraph/index.tsx` for verbose logging.

---

## Authentication &amp; Sessions

<p align="center">
  <img src="docs/screenshots/login.png" alt="Authentication" width="100%">
</p>

- JWT-based authentication (access + refresh tokens) via `/auth`, `/refresh`.
- 4-hour JWT lifetime with automatic background refresh.
- WebSocket re-auth on token renewal so GraphQL subscriptions never break.
- Session-expiry detection &mdash; toast warning at 30 minutes remaining and forced logout on expiry.
- All routes inside `<Layout />` require a valid `meState`; anonymous users are redirected to `/login`.

---

## Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `MYTHIC_ADDRESS` | `https://host.docker.internal:7443` | Nginx upstream for all Mythic API calls |
| `MSFRPC_USER` | `msf` | Username for MSF-RPC (`docker-compose.metasploit.yml`) |
| `MSFRPC_PASS` | `minerva_msf` | Password for MSF-RPC |
| `MSFRPC_PORT` | `55553` | Port exposed by `minerva_msf` |
| `MYTHIC_DIR` | `/opt/Mythic` | Used by `minerva_install.sh` &amp; `mythic_change.sh` |
| `CHOKIDAR_USEPOLLING` | `true` (dev) | Forces file polling inside Docker for HMR |
| `WDS_SOCKET_PATH` | `ws` (dev) | HMR socket path behind Nginx |
| `WDS_SOCKET_PORT` | `443` (dev) | HMR socket port behind Nginx |

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| CSS not loading | Ensure `tailwind.config.js` and `postcss.config.js` are mounted (dev) or copied (prod). Rebuild with `--build`. |
| Hot reload not working | Check `docker logs minerva-dev`. Dev server uses `CHOKIDAR_USEPOLLING=true` for Docker. |
| `MODULE_NOT_FOUND` after editing | Check volume mounts in `docker-compose.dev.yml`. |
| New npm package not found | Rebuild: `docker compose -f docker-compose.dev.yml up -d --build` |
| Browser SSL warning | Expected &mdash; self-signed cert. Trust the cert or accept the warning. |
| `bad type for *_PARAMETER_TYPE_ARRAY: string` on payload build/import | Run `./scripts/mythic_change.sh` then rebuild `mythic_server`. |
| Graph nodes not syncing | Run `./scripts/minerva_install.sh fix` &mdash; verifies the Hasura `agentstorage` table. |
| Graph nodes corrupted | `./scripts/clear-custom-nodes.sh` to wipe and start clean. |
| Metasploit page shows "offline" | `./scripts/minerva_install.sh msf-status` and `msf-verify`. Check that `MSFRPC_USER` / `PASS` in Settings match what `msfrpcd` is running with. |
| Sidebar items missing | Settings &rarr; Sidebar Shortcuts &mdash; the saved order may have hidden new items. Reset to defaults. |
| JWT expired toast keeps appearing | The browser's clock may be skewed; sync system clock and clear localStorage. |

---

## License

This project is dual-licensed:

- **Open Source** &mdash; [AGPL-3.0](./LICENSE)
  You may use, modify, and distribute this software under AGPL-3.0. Any derivative work or service using this software must also be released under AGPL-3.0.

- **Commercial License** &mdash; for proprietary / closed-source use without AGPL obligations. Contact: **aifred0729tw@gmail.com**
