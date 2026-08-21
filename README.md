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
  <img src="https://img.shields.io/badge/minerva-2.2.1-22C55E?style=flat-square" alt="Minerva Version">
  <img src="https://img.shields.io/badge/mythic-0.3.106-lightgrey?style=flat-square" alt="Mythic Compatibility">
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
  - [★ 3D Cyber-Topology](#topology3d)
- [Feature Matrix](#feature-matrix)
- [Application Map](#application-map)
- [Tech Stack](#tech-stack)
- [Quick Start (Production)](#quick-start-production)
- [Development Mode (Hot Reload)](#development-mode-hot-reload)
- [Desktop App (Windows / macOS)](#desktop-app-windows--macos)
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

**Minerva** is a modern, cyberpunk-themed web interface for the [Mythic C2 Framework](https://github.com/its-a-feature/Mythic). It runs as a standalone stack alongside Mythic — a separate front-end to Mythic's built-in `MythicReactUI`, not a swap-in for it — designed from the ground up for operators who run long red-team engagements and need a dense, low-friction operational console.

What Minerva adds on top of the stock UI:

- **3D Cyber-Topology** &mdash; the flagship view. A live Three.js map of the whole engagement: subnets as translucent volumes, C2 and P2P links drawn apart, and per-node **QUICKHACK** and **DOSSIER** panels that open over the scene without leaving it. See [the tour below](#topology3d).
- **Real-time collaborative graphs** &mdash; ReactFlow callback topology with shared custom nodes for relay / proxy infrastructure, synced every 5 s across all logged-in operators via Hasura.
- **Rich interactive console** &mdash; multi-tab terminal with structured output blocks, Mimikatz parsing, process-list rendering, file-browser overlays, drag-and-drop uploads, and inline tasking forms.
- **Quick Hack workflows** &mdash; pre-canned, one-click red-team workflows over callbacks (recon, persistence, dumping, lateral movement) chained as tasking macros.
- **Native Metasploit integration** &mdash; first-class MSF-RPC client with launch dashboard, session-lifecycle management, persistent execution history, and live task-browser output parsing.
- **MITRE ATT&amp;CK matrix** &mdash; full T-id matrix with task / command / tag overlays so operators can see live technique coverage.
- **Eventing workflows** &mdash; visual builder for Mythic eventing instances with keyword triggers and conditional steps.
- **Battle Mode** &mdash; tactical UI mode (Combat / Recon / Normal) that re-tunes density, animation speed, and ambient sound for active operations.
- **Theming &amp; audio** &mdash; CSS-variable driven dark/light themes, custom background image, JetBrains Mono / Inter typography, IndexedDB-backed music library, and per-event SFX.

### How it deploys

Minerva runs as **its own Docker stack, fully separate from Mythic** — it is never copied into Mythic's `MythicReactUI` directory or baked into the `mythic_react` container. `scripts/minerva_install.sh` (or `docker compose up -d`) brings up two containers: `minerva-dev` (the React app served by `react-app-rewired`, the same way Mythic serves its own UI) behind a `minerva` Nginx container that terminates TLS on **443** and proxies `/graphql`, `/auth`, `/refresh`, `/msf-rpc`, `/direct` to an existing Mythic instance over `host.docker.internal`. It self-signs a TLS cert on first run and leaves Mythic's own UI untouched.

`minerva_install.sh` also performs the one-time Mythic-side prep a vanilla Mythic needs: configuring its `.env`, applying the required Go patches (`mythic_change.sh`), and setting up Hasura. These touch Mythic's *backend* only — Minerva itself stays in its own containers.

> **Cross-container reachability (`.env`):** because the `minerva` container is not on Mythic's docker network, it reaches Mythic through the host gateway (`host.docker.internal`). For that to work Mythic must publish its ports on all interfaces, not just loopback — so `NGINX_BIND_LOCALHOST_ONLY` (port 7443) and `MYTHIC_SERVER_DYNAMIC_PORTS_BIND_LOCALHOST_ONLY` (C2 ports 7000-7010) **must be `"false"`** in Mythic's `.env`. `minerva_install.sh` sets these automatically and idempotently; if you install by hand, set them yourself and run `./mythic-cli start` to rebind. Leaving them `"true"` is the most common cause of a fresh install failing with connection-refused errors.

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

Central operational overview &mdash; active callbacks, total payloads, C2 infrastructure status, operation details with a T- / T-0 / T+ engagement timeline, command statistics, asset-collection metrics, top commands, and a recent activity feed. The panel layout is an unbounded tree of splits: any panel can be divided horizontally or vertically and the arrangement persists per operator.

<p align="center">
  <img src="docs/screenshots/dashboard.png" alt="Dashboard" width="100%">
</p>

<a id="topology3d"></a>

#### 3D Cyber-Topology &nbsp;·&nbsp; ★ Flagship

> **The view Minerva is built around.** Everything the dashboard counts, the topology shows in place — which hosts you own, how the traffic actually reaches them, and what stands between you and the next hop.

A full Three.js scene with free orbit controls. Machines are placed by a physics layout and grouped into **network spaces** — one translucent volume per CIDR, labelled with its subnet and node count. Link type is carried by colour, not guesswork: cyan for direct **C2**, magenta for **P2P** relay chains, each edge tagged with its transport (`http`, `tcp`). A tunnel layer overlays live SOCKS / RPORTFWD chains on top of the same graph.

Node colour is state: **CORE** (the Minerva server itself), **ALIVE**, **HIGH PRIV**, **DEAD**, and operator-defined **CUSTOM** relay nodes. The status bar along the bottom keeps a live count of machines, callbacks, live / dead sessions, custom nodes, edges, and networks. Spaces can be hidden per CIDR to cut the scene down to the segment you're working; the hide list persists across reloads and is restored from the scene menu's **HIDDEN SPACES** group.

<p align="center">
  <img src="docs/screenshots/topology3d.png" alt="3D Cyber-Topology" width="100%">
</p>

Right-clicking a node opens its action menu — every row is a framed control, state rides in a chip on the right (`LOCKED`, `ON`, `ARMED`), and destructive rows arm before they fire. Two of those rows take the viewport **without leaving the scene**, which is what the shot below captures:

- **QUICKHACK** &mdash; the strike panel docks beside the node (`HARVEST`, `RPFWD`, `SOCKS`, `DISCONNECT`, `AMPLIFICATION`). Hacks the target's agent can't run are greyed out and chipped `N/A`; the rest carry the number of parameters they take (`1 VAR`, `3 VARS`) before they fire. The footer tracks the armed target.
- **VIEW DETAILS** &mdash; the node dossier. The machine's record on the left — identity, platform, network and link, grouped under `//SECTION` headers — and the **DEFENCE MATRIX** on the right, listing every session on the host plus the three states that decide whether a box is safe to work on: **anti-virus / EDR**, **firewall**, and **privilege**. AV and firewall are operator marks (Mythic reports neither) that persist per host through the operator's preferences; privilege is derived live from the session and reads per platform — `ROOT` on Linux/macOS, `SYSTEM` / `ADMIN` on Windows.

Both panels are docked, not modal: the topology keeps updating behind them, and nothing closes until `ESC` / **EXIT INTERFACE**.

<p align="center">
  <img src="docs/screenshots/topology3d-details.png" alt="Quickhack panel, node dossier and defence matrix over the live scene" width="100%">
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

Hub for payload listing, the multi-step Create-Payload wizard, and the Wrapper flow. Supports import / export of payload configurations and rebuild-from-existing.

<p align="center">
  <img src="docs/screenshots/payloads.png" alt="Payloads Overview" width="100%">
</p>

#### Create Payload Wizard

Step-by-step build pipeline: OS &rarr; type &rarr; commands &rarr; C2 &rarr; build. Each step persists state so operators can step back and adjust without losing progress.

<p align="center">
  <img src="docs/screenshots/create-payload.png" alt="Create Payload" width="100%">
</p>

#### Payload Types

Unified view of every installed agent / wrapper / translator / consuming-service / custom-browser. Header toolbar adds **search**, **sort (name / status / commands)**, an **online-only** filter, and a **show-deleted** toggle. Each card shows the agent's SVG icon, container status, build-parameter inspector, command browser, container-file editor, and one-click test of webhook / logger events.

<p align="center">
  <img src="docs/screenshots/payload-types.png" alt="Payload Types" width="100%">
</p>

### 5 · Infrastructure

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

### 6 · Files, Credentials &amp; Intel

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

Global cross-entity search across tasks, files, credentials, callbacks, and artifacts with advanced filtering. Every query is scoped to the current operation.

<p align="center">
  <img src="docs/screenshots/search.png" alt="Global Search" width="100%">
</p>

### 7 · Automation &amp; Frameworks

#### Quick Hacks

One-click red-team workflow library (recon / persistence / dumping / lateral) that chains commands across selected callbacks. Workflows are JSON-defined and operator-extensible, and the same library backs the topology's per-node **QUICKHACK** panel.

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

### Visualization

| Feature | Description |
|---------|-------------|
| **3D Topology** &nbsp;★ | Three.js 3D network map — orbit controls, CIDR network spaces as translucent volumes (hideable, persisted), physics placement, colour-separated C2 / P2P edges, tunnel-layer overlay, live status bar, right-click node menu, in-scene **QUICKHACK** panel and **node dossier + DEFENCE MATRIX** |
| **Callback Graph** | Interactive 2D graph using ReactFlow with ELK auto-layout, custom node creation, edge management, PNG export, and a graph-config panel |
| **Custom Nodes** | Operator-defined relay / proxy nodes stored server-side in Hasura `agentstorage`; synced across all connected operators every 5 s |
| **MITRE ATT&amp;CK** | Full ATT&amp;CK matrix with technique mapping, execution tracking, and Task / Command / Tag overlays |
| **Tunnel Map** | Cyberpunk flow diagram showing parent-child tunnel relationships, port mappings, and live status |

### Core Operations

| Feature | Description |
|---------|-------------|
| **Dashboard** | Operational overview with a T- / T-0 / T+ engagement timeline and an unbounded split-tree panel layout persisted per operator |
| **Callbacks** | Real-time callback tracking with health indicators (alive/dead/streaming), bulk operations, grouping, last-checkin badges, and sleep/jitter editing |
| **Console** | Multi-tab interactive command tasking with syntax-highlighted output blocks, split-view DB output, command history, autoScroll toggle, drag-and-drop file uploads, and streaming task results |
| **Tasks** | Dedicated single-task view with full host tree, parameter inspector, output viewer, and per-task navigation |
| **Payloads** | Multi-step Create-Payload wizard (OS &rarr; type &rarr; commands &rarr; C2 &rarr; build), Wrapper flow, payload import/export, rebuild-from-existing, and tab-cap on browser-script `tabs` output |
| **Files** | Download / upload tracking, screenshot viewer with thumbnail grid, keylog search, drag-and-drop modal uploads, and artifact organization |
| **Credentials** | Vault with deduplication, hash management, account linking, and multi-field search |
| **Search** | Global cross-entity search across tasks, files, credentials, callbacks, and artifacts — scoped to the current operation |
| **Artifacts** | Indicator-of-compromise / artifact viewer with task linkage |
| **Tags** | Tag-based organization and filtering across all entities |

### Advanced

| Feature | Description |
|---------|-------------|
| **Battle Mode** | Combat / Recon / Normal mode switching with tactical UI optimizations (2&times; animation speed in Combat, dimmed non-critical info in Recon) |
| **Eventing** | Visual workflow builder for Mythic eventing &mdash; event groups, instances, keyword triggers, conditional steps, real-time stream of matching events |
| **Quick Hack** | One-click red-team workflow library (recon / persistence / dumping / lateral) that chains commands across selected callbacks; also drives the topology's per-node strike panel |
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
| `/new/topology` | `Topology3D` | **3D network map** (flagship) |
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

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and Docker Compose
- A running [Mythic C2](https://github.com/its-a-feature/Mythic) instance reachable from the host (default: `https://host.docker.internal:7443`)
- Open port **443** on the host
- Mythic's `.env` must publish its ports beyond loopback so the Minerva container can reach them over `host.docker.internal`: `NGINX_BIND_LOCALHOST_ONLY="false"` and `MYTHIC_SERVER_DYNAMIC_PORTS_BIND_LOCALHOST_ONLY="false"`. `scripts/minerva_install.sh` sets these for you.

### One-command install (`minerva_install.sh`) — recommended

The bundled setup script is the supported path onto a vanilla Mythic. It deploys Minerva's own stack and leaves Mythic's UI and containers untouched:

```bash
# From /opt/Minerva
./scripts/minerva_install.sh          # full install (see steps below)
./scripts/minerva_install.sh up       # (re)build & start minerva + minerva-dev only
./scripts/minerva_install.sh down     # stop the Minerva stack
./scripts/minerva_install.sh verify   # verify install (.env keys, containers, HTTP 200)
./scripts/minerva_install.sh status   # show Minerva + Mythic container status & logs
./scripts/minerva_install.sh fix      # re-assert .env + rebuild/restart the stack
./scripts/minerva_install.sh clean    # clean custom graph nodes from DB
./scripts/minerva_install.sh uninstall  # stop & remove the Minerva stack (Mythic untouched)

# Metasploit:
./scripts/minerva_install.sh msf-start    # start MSF-RPC container
./scripts/minerva_install.sh msf-stop     # stop MSF-RPC container
./scripts/minerva_install.sh msf-status   # status + logs
./scripts/minerva_install.sh msf-verify   # Python connectivity check
```

The install:

1. Configures Mythic's `.env` for cross-container reachability (idempotent; the two `*_BIND_LOCALHOST_ONLY` keys above).
2. Runs `mythic_change.sh` to patch Mythic's Go source and rebuild `mythic_server` (see below).
3. Applies the Mythic-agent patches (Apollo SOCKS/TCP, IPC buffers).
4. Configures the Hasura `agentstorage` table so custom graph nodes can sync between operators.
5. Builds and starts the `minerva` + `minerva-dev` containers (nginx on **443**).

Steps 1–4 are the only things that touch Mythic, and all of them are backend-only and idempotent. Minerva's UI never enters Mythic's file tree or containers. Set the `MYTHIC_DIR` env var if your Mythic install is not at `/opt/Mythic`.

### Standalone Container

```bash
git clone https://github.com/aifred0729-TW/Minerva.git
cd Minerva

# Build the app + Nginx images, then run (self-signed cert auto-generated)
docker compose build
docker compose up -d
```

> First start compiles the React app inside `minerva-dev` &mdash; give it ~1&ndash;2 minutes, then `https://<host>/` serves. The `minerva` Nginx container proxies to it once it's up.

Open **https://&lt;your-host&gt;/** &mdash; you'll be redirected to `/new/login`. Log in with your Mythic credentials.

To point at a remote Mythic instance:

```bash
MYTHIC_ADDRESS=https://10.0.0.5:7443 docker compose up -d
```

To stop:

```bash
docker compose down
```

> The default `docker-compose.yml` exposes only Minerva (port 443). `MYTHIC_ADDRESS` is passed into Nginx as a template variable and used for `/graphql`, `/auth`, `/refresh`, `/invite`, `/direct` upstreams. Drop your own `minerva.crt` / `minerva.key` into `nginx/ssl/` to replace the auto-generated self-signed cert.

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
# Dev (HMR) → Production
docker compose -f docker-compose.dev.yml down
docker compose up -d --build

# Production → Dev
docker compose down
docker compose -f docker-compose.dev.yml up -d --build
```

---

## Desktop App (Windows / macOS)

<p align="center">
  <img src="docs/screenshots/topology3d.png" alt="Minerva running as a desktop console" width="100%">
</p>

Minerva also ships as a native console for **Windows** and **macOS** — the same
React bundle, wrapped in Electron, with no fork of `src/`.

There is no nginx in a desktop app, and the console addresses every backend
through its own origin (`window.location.origin + "/graphql/"`, `wss://" +
window.location.host + "/graphql/"`, `/direct/download/...`). So the proxy moves
in-process: the Electron main process runs a loopback gateway that mirrors
`nginx.conf.template` route for route, and the window loads the bundle from it.
The React app cannot tell the difference.

**The operator points the console at Mythic before a login screen exists.** In
the container deploy that address is compose configuration; here one binary
travels between engagements, so the app opens a connect window first, runs a
reachability preflight, and only then hands over:

```
launch ──▶ connect window ──▶ preflight ──▶ gateway ──▶ console ──▶ Mythic login
```

```bash
# 1. build the bundle once, at the repository root
npm install && npm run build

# 2. package the shell
cd desktop
npm install
npm run dist:win     # NSIS installer + portable, x64 & arm64
npm run dist:mac     # dmg + zip, arm64 & x64   (requires a macOS host)
```

Installers land in `desktop/dist/`. `.github/workflows/desktop-build.yml` builds
both platforms on a tag push and attaches them to a GitHub Release — the way to
get a `.dmg` without owning a Mac.

Two things differ from the container deploy on purpose:

- **Egress is closed by default.** The renderer reaches the loopback gateway and
  nothing else, which blocks the bundle's Google Fonts request. A C2 console
  should not call out to a third party from an operator's machine mid-engagement.
- **MSF-RPC keeps its gate.** `/msf-config` and `/msf-rpc/` are authorized by a
  subrequest to Mythic's `GET /me`, the same `auth_request` control nginx
  applies, so Metasploit is never reachable without a valid operator token.

Full detail — architecture, dev workflow with HMR, signing, settings file
location, security posture — in [`desktop/README.md`](desktop/README.md).

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
         └── minerva_msf :55553  (msfrpcd --user msf --pass <generated> -S  (bound to 127.0.0.1))
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

> `MSFRPC_PASS` has no default. `minerva_install.sh msf-start` generates one and writes it to `.env.msf`, which is git-ignored — the credential is never committed.

### Page Tabs

| Tab | Purpose |
|-----|---------|
| **Dashboard** | Connection state, host stats, session counts, recent jobs |
| **Attack** | Module browser, parameter form, launch with target / payload, save credentials, dry-run preview |
| **Operations** | Active sessions, jobs &amp; routes &mdash; kill session, stop job, hop / portfwd |
| **History** | Persistent (IndexedDB) execution history of every launched attack with full output |

The MSF-RPC client lives in `src/Minerva/pages/Metasploit/msfrpc.ts`. The page polls `getFullStatus` every 15 s and lazy-loads each tab. SOCKS port allocation for MSF routes is shared and atomic, so two operators can't be handed the same local port.

---

## Setup Script (`minerva_install.sh`)

Unified entry point for installing Minerva alongside Mythic, managing the optional MSF-RPC service, and resetting state.

```
Usage: ./scripts/minerva_install.sh [command]

Commands:
  (none)      Full install (.env + backend patches + Hasura + bring up stack)
  up          Build & start the minerva + minerva-dev containers
  down        Stop the Minerva stack
  verify      Verify the installation is correct
  fix         Re-assert .env + rebuild/restart the stack
  status      Show Minerva + Mythic container status and logs
  clean       Remove custom graph nodes from the database
  uninstall   Stop & remove the Minerva stack (Mythic left untouched)

Metasploit:
  msf-start   Deploy & start Metasploit RPC container
  msf-stop    Stop Metasploit RPC container
  msf-status  Show Metasploit container status & logs
  msf-verify  Verify MSF-RPC connectivity (Python)

  help        Show this message

Environment:
  MYTHIC_DIR      Path to Mythic (default: /opt/Mythic)
  MYTHIC_ADDRESS  Nginx upstream for Mythic (set in docker-compose.yml;
                  default: https://host.docker.internal:7443)
```

The script is idempotent &mdash; re-running it is safe and it skips steps that are already complete. **Invariant: running `minerva_install.sh` from a fresh clone fully installs Minerva onto a vanilla Mythic.**

---

## Mythic Source Patches (`mythic_change.sh`)

Some Minerva features need behaviour that Mythic's backend doesn't provide on its own. Every one of those changes is recorded in `scripts/mythic_change.sh` as an **idempotent, guarded patch** — never as a loose edit — and the script is chained from `minerva_install.sh`, so a fresh clone reproduces the full set on a vanilla Mythic.

| # | File | Symptom without the patch | Fix |
|---|------|---------------------------|-----|
| **0** | Mythic `.env` (config, not source) | Minerva's nginx container can't reach Mythic's 7443 / C2 ports over `host.docker.internal` — connection refused on a fresh install | Force `NGINX_BIND_LOCALHOST_ONLY="false"` and `MYTHIC_SERVER_DYNAMIC_PORTS_BIND_LOCALHOST_ONLY="false"`; postgres / rabbitmq / hasura / jupyter stay loopback-only |
| **1** | `rabbitmq/utils.go` &middot; `GetFinalStringForDatabaseInstanceValueFromUserSuppliedValue` | `bad type for *_PARAMETER_TYPE_ARRAY: string` when importing or rebuilding a payload whose array parameters arrive JSON-encoded as strings | Add a `case string:` that validates the value is a valid JSON array and returns it |
| **2** | `rabbitmq/utils.go` &middot; `getSyncToDatabaseValueForDefaultValue` | Same error during agent sync when a C2 profile / payload type sends a JSON-encoded array default | Same `case string:` handler |
| **3** | `webserver/controllers/hasura_claims.go` | Hasura rejects requests with `missing session variable: x-hasura-operations` | Assign the `x-hasura-operations` / `x-hasura-admin-operations` claims that were built but never written to the claims map |
| **4** | `webserver/controllers/operationeventlog_create_webhook.go` | `mythic_server` fails to build — unused `strings` import | Drop the unused import |
| **5** | `agentstorage` table (Hasura / Postgres) | Custom-graph-node upserts fail — `on_conflict` needs a named constraint, not a bare unique index | Convert the unique INDEX to a named CONSTRAINT |
| **6** | `rabbitmq/util_agent_message_actions_update_info.go`<br>`rabbitmq/recv_mythic_rpc_callback_update.go` | **Set Primary IP** in the topology is clobbered seconds later by the next agent check-in, which rewrites `callback.ip` in interface-enumeration order | Diff the *set* of stored vs incoming IPs; if equal, leave the field alone — otherwise keep surviving operator-ordered IPs first and append new ones |
| **7** | `rabbitmq/util_agent_message_actions_post_response.go` | Phantom P2P links: on a stale link Apollo's `unlink` emits no `EdgeNode remove`, so `callbackgraphedge.end_timestamp` stays NULL forever | On completion of any `unlink*` command, bidirectionally close every active P2P edge sourced at that callback |
| **8** | `rabbitmq/util_agent_message.go` | A hidden P2P callback pops back into the UI as soon as relay traffic flows through it | Hide sticks for P2P callbacks; only an explicit **Show Callback** brings them back. Direct-C2 callbacks unchanged |
| **9** | `rabbitmq/utils_proxy_traffic.go`<br>`rabbitmq/util_agent_message_push_c2.go` | SOCKS / RPORTFWD throughput collapses, and oversubscribed channels drop frames silently — corrupting the tunnelled TCP stream | Proxy channel buffers 1000 &rarr; 16384 (top-level 2000 &rarr; 16384), three silent-drop selects converted to try-then-block-10s so backpressure reaches the agent POST, and the 20 ms read-loop throttle removed |
| **10** | `webserver/controllers/user_update_operator_password_webhook.go` | `operator.email` is UNIQUE — the second password change on an email-less account collides on `''`, after the password write already committed | Bind the `sql.NullString` the handler already computed, so a blank email stores NULL |

Run it standalone if you need to:

```bash
MYTHIC_DIR=/opt/Mythic ./scripts/mythic_change.sh
```

Running it twice is safe. The Hasura metadata side (agentstorage tracking + `minerva_%` row scoping) is applied by its companion, `scripts/configure-hasura-agentstorage.sh`, which `minerva_install.sh` also chains.

---

## Project Structure

```
Minerva/
├── docker-compose.yml              # Standalone stack (nginx + dev server) — the official deploy
├── docker-compose.dev.yml          # Development (nginx + dev server, source mounted)
├── docker-compose.metasploit.yml   # Optional MSF-RPC daemon
├── docker/
│   ├── Dockerfile.prod             # Build static React + Nginx
│   ├── Dockerfile.dev              # Node dev server + HMR
│   ├── Dockerfile.nginx            # Nginx (used in dev compose)
│   └── Dockerfile                  # Inside-Mythic build (legacy)
├── nginx/
│   ├── nginx.conf.template         # Prod template (alias /new + proxies)
│   ├── nginx.dev.conf.template     # Dev template (proxy to dev server + /ws)
│   └── docker-entrypoint.sh        # SSL cert generation + envsubst
├── scripts/
│   ├── minerva_install.sh          # install / verify / fix / status / msf-*
│   ├── mythic_change.sh            # Idempotent record of every Mythic-side patch
│   ├── MythicAgentPatch.sh         # Agent-side patches (Apollo SOCKS/TCP, IPC buffers)
│   ├── configure-hasura-agentstorage.sh   # Hasura metadata for shared graph state
│   ├── clear-custom-nodes.sh       # Wipe custom graph nodes from DB
│   ├── clear-nodes.sql             # SQL used by clear-custom-nodes
│   ├── debug-custom-nodes.sh       # Print custom-node state from Hasura
│   ├── msfrpc_verify.py            # Sanity check MSF-RPC connectivity
│   ├── take_screenshots.js         # README screenshot capture (Puppeteer)
│   └── take_login_only.js          # One-shot login screenshot
├── docs/
│   ├── DESIGN_LANGUAGE.md          # The canonical UI spec — read before any UI change
│   ├── banner.jpg
│   └── screenshots/
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
        │   ├── Topology3D/         # ★ the flagship view
        │   │   ├── index.tsx           (scene, camera, layout, hidden spaces)
        │   │   ├── SceneObjects.tsx    (nodes, edges, subnet volumes, labels)
        │   │   ├── TunnelLayer.tsx     (SOCKS / RPORTFWD overlay)
        │   │   ├── DetailPanel.tsx     (right-click node menu)
        │   │   ├── QuickHack.tsx       (in-scene strike panel)
        │   │   ├── NodeDossier.tsx     (VIEW DETAILS — identity / platform / network / link)
        │   │   ├── defenseMatrix.tsx   (AV·EDR / firewall / privilege)
        │   │   ├── defenseMarks.ts     (operator marks, persisted per host)
        │   │   ├── Topology3DModals.tsx
        │   │   └── topology.ts         (graph model + placement)
        │   ├── Callbacks/          (graph + table + dialogs + utils)
        │   ├── Console/            (terminal + context menu + parsers)
        │   ├── ConsoleSelection.tsx
        │   ├── SingleTaskView/     (host tree, task detail, list)
        │   ├── Payloads/
        │   ├── CreatePayload/      (multi-step wizard)
        │   ├── CreateWrapper/
        │   ├── PayloadTypes/       (search/sort/agent icons + build params + commands + files)
        │   ├── Files/              (filetable, screenshots, modals)
        │   ├── Credentials.tsx
        │   ├── C2Profiles.tsx
        │   ├── Tunnels/ · TunnelMap.tsx
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
        │   └── …
        │
        ├── lib/
        │   ├── api/                 # GraphQL queries / mutations / subscriptions, per domain
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

> All UI work follows [`docs/DESIGN_LANGUAGE.md`](docs/DESIGN_LANGUAGE.md) — the smooth advanced-minimalist Cyberpunk spec that governs the palette, contrast rules, panel frames, and transition choreography.

---

## Architecture

### Apollo client + reactive vars

- **GraphQL** is the single transport for everything except the Metasploit RPC. Queries and mutations live in `lib/api/*.ts`, grouped by domain.
- **Subscriptions** use `graphql-ws` over the same `wss://<host>/graphql/` endpoint. Callbacks, EventFeed, Payloads, PayloadTypes, Tunnels, Topology3D, and Console rely on subscriptions for live updates.
- **Reactive variables** (`meState`, `mePreferences`) expose authenticated user state and preference overrides to any component.

### Routing &amp; code-splitting

- Every route is `React.lazy`-imported in `App.tsx` so the initial bundle stays small; visiting a route streams in its chunk. Chunk-load failures recover into a retry instead of dead-ending the route.
- A single shared `<Layout />` is mounted for every authenticated route, so the sidebar, audio player, event notifications, and battle-mode shell never re-mount during navigation.

### State

- **Zustand store** (`store.ts`, persisted to localStorage) holds sidebar collapse, console tabs, alert count, audio (music library, volume, per-SFX toggles), and notification preferences.
- **Apollo cache** holds GraphQL entities.
- **IndexedDB** stores binary music files, the MSF task history, and a local custom-graph-node cache.
- **Mythic operator preferences** back anything that must follow the operator across machines — the topology's hidden spaces and the DEFENCE MATRIX marks live here, not in localStorage.

### Idle behaviour

Polling and subscriptions stand down when the tab isn't visible, so an open Minerva window doesn't hold the machine at load while nobody is looking at it. The console opens one shared subscription rather than one per task.

### Liveness

Callback liveness in the UI is computed from the last check-in against the agent's sleep interval, not from Mythic's `dead` column — that column lags by up to a minute, which would show live nodes as `DEAD` in the topology and callback table.

### Real-time custom graph nodes

Custom graph nodes are stored server-side in Hasura's `agentstorage` table so every operator sees the same topology. `customGraphNodeService.ts` handles serialization, 5 s polling sync, conflict-tolerant merging, and `DEBUG_GRAPH` logging. `configure-hasura-agentstorage.sh` wires up the necessary Hasura permissions on install.

---

## Routing &amp; Sidebar

The sidebar (`components/Sidebar.tsx`) lists every page. Operators can re-order or hide entries via **Settings &rarr; Sidebar Shortcuts**.

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

Nginx (port 443, self-signed SSL) is the single entry point. It terminates SSL and proxies to either Mythic or Metasploit.

| Location | Upstream | Notes |
|----------|----------|-------|
| `/` | redirect to `/new/login` | |
| `/new/` | `minerva-dev:3000` | app + HMR WS upgrade |
| `/ws` | `minerva-dev:3000/ws` | webpack HMR socket |
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

Fonts: **JetBrains Mono** (monospace) and **Inter** (sans-serif). Operators can also set a custom background image and per-component output colors via **Settings &rarr; Palette**.

---

## Battle Mode

<p align="center">
  <img src="docs/screenshots/callbacks.png" alt="Battle Mode on the Callbacks page" width="100%">
</p>

`context/BattleModeContext.tsx` exposes three operational modes:

- **NORMAL** &mdash; default; full chrome and animation budget.
- **RECON** &mdash; dim non-critical chrome, prioritize legibility.
- **COMBAT** &mdash; tactical UI: 2&times; animation speed, accent shifts to alarm-red, ambient SFX volume bumped.

Toggle via the sidebar's combat / recon icons. The mode is persisted in the Zustand store.

---

## Audio System

Two layers:

1. **Global music player** &mdash; operator-uploaded tracks stored in IndexedDB (`musicDB`). Playback survives navigation and full page reloads via `useAppStore` state (`musicPlaying`, `musicTrackId`).
2. **Sound effects** &mdash; per-event SFX for new callbacks, tunnels, auth alerts, key clicks, and errors. Individual SFX can be toggled via **Settings &rarr; Audio**.

All audio respects the global `sfxEnabled` / `musicEnabled` flags.

---

## Custom Graph Nodes

<p align="center">
  <img src="docs/screenshots/callbacks.png" alt="Custom nodes in the Callbacks graph" width="100%">
</p>

Custom nodes model relay / proxy infrastructure that Mythic doesn't natively know about — the orange nodes in the 3D topology above. They are persisted in Hasura's `agentstorage` table so all operators see the same view.

| Action | How |
|--------|-----|
| Create node | Right-click empty space in **Callbacks &rarr; Graph View** &rarr; *Create Custom Node* |
| Connect nodes | Right-click a node &rarr; *Set Parent* |
| Edit / delete | Right-click a node &rarr; *Edit* / *Delete* |
| Reset all | `./scripts/clear-custom-nodes.sh` |

Each node stores hostname, IP, OS, architecture, C2 profile selection, position, and color. Positions persist across sessions; data syncs across connected operators via 5 s polling. Toggle `DEBUG_GRAPH = true` in `CallbackGraph/index.tsx` for verbose logging.

---

## Authentication &amp; Sessions

- JWT-based authentication (access + refresh tokens) via `/auth`, `/refresh`.
- 4-hour JWT lifetime with automatic background refresh.
- WebSocket re-auth on token renewal so GraphQL subscriptions never break.
- Session-expiry detection &mdash; toast warning at 30 minutes remaining, forced logout on expiry.
- Logout tears the session down for real: tokens cleared, subscriptions closed, caches dropped.
- All routes inside `<Layout />` require a valid `meState`; anonymous users are redirected to `/login`.

> Mythic's `/auth` payload carries no `admin` field, so admin-gated UI is derived from the `operator` table rather than from the login response.

---

## Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `MYTHIC_ADDRESS` | `https://host.docker.internal:7443` | Nginx upstream for all Mythic API calls |
| `MSFRPC_USER` | `msf` | Username for MSF-RPC (`docker-compose.metasploit.yml`) |
| `MSFRPC_PASS` | _(generated)_ | Password for MSF-RPC — required, no default; `minerva_install.sh msf-start` writes it to `.env.msf` |
| `MSFRPC_PORT` | `55553` | Port exposed by `minerva_msf` |
| `MYTHIC_DIR` | `/opt/Mythic` | Used by `minerva_install.sh` &amp; `mythic_change.sh` |
| `CHOKIDAR_USEPOLLING` | `true` | Forces file polling inside Docker for HMR |
| `WDS_SOCKET_PATH` | `ws` | HMR socket path behind Nginx |
| `WDS_SOCKET_PORT` | `443` | HMR socket port behind Nginx |

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Fresh install can't reach Mythic (connection refused) | Mythic's `.env` still binds to loopback. Set both `*_BIND_LOCALHOST_ONLY="false"` keys and `./mythic-cli start`, or just run `./scripts/minerva_install.sh fix`. |
| CSS not loading | Ensure `tailwind.config.js` and `postcss.config.js` are mounted. Rebuild with `--build`. |
| Hot reload not working | Check `docker logs minerva-dev`. The dev server uses `CHOKIDAR_USEPOLLING=true` inside Docker. |
| `MODULE_NOT_FOUND` after editing | Check volume mounts in `docker-compose.dev.yml`. |
| New npm package not found | Rebuild: `docker compose -f docker-compose.dev.yml up -d --build` |
| Browser SSL warning | Expected &mdash; self-signed cert. Trust it or accept the warning. |
| `bad type for *_PARAMETER_TYPE_ARRAY: string` on payload build/import | Run `./scripts/mythic_change.sh`, then rebuild `mythic_server`. |
| Topology shows live hosts as `DEAD` | Mythic's `dead` column lags. Make sure you're on a build that computes liveness from last check-in — `./scripts/minerva_install.sh verify`. |
| Phantom P2P links that never close | Patch 7 isn't applied. Re-run `mythic_change.sh` and rebuild `mythic_server`. |
| SOCKS / RPORTFWD crawling or corrupting streams | Patch 9 isn't applied. Re-run `mythic_change.sh` and rebuild `mythic_server`. |
| Hidden P2P callbacks keep coming back | Patch 8 isn't applied. Re-run `mythic_change.sh` and rebuild `mythic_server`. |
| Graph nodes not syncing | `./scripts/minerva_install.sh fix` &mdash; verifies the Hasura `agentstorage` table. |
| Graph nodes corrupted | `./scripts/clear-custom-nodes.sh` to wipe and start clean. |
| Metasploit page shows "offline" | `./scripts/minerva_install.sh msf-status` and `msf-verify`. Check `MSFRPC_USER` / `PASS` in Settings match what `msfrpcd` is running with. |
| Sidebar items missing | **Settings &rarr; Sidebar Shortcuts** &mdash; a saved order may hide newer items. Reset to defaults. |
| JWT expired toast keeps appearing | The browser clock may be skewed; sync the system clock and clear localStorage. |

---

## License

This project is dual-licensed:

- **Open Source** &mdash; [AGPL-3.0](./LICENSE)
  You may use, modify, and distribute this software under AGPL-3.0. Any derivative work or service using this software must also be released under AGPL-3.0.

- **Commercial License** &mdash; for proprietary / closed-source use without AGPL obligations. Contact: **aifred0729tw@gmail.com**
