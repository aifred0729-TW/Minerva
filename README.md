<p align="center">
  <img src="docs/banner.jpg" alt="Minerva - Next-Generation Mythic C2 Interface" width="100%">
</p>

<p align="center">
  <a href="README.zh-TW.md">繁體中文</a> | English
</p>

<p align="center">
  <strong>Next-Generation Mythic C2 Interface</strong><br>
  Advanced Command & Control UI with collaborative graph visualization, 3D cyber-topology, and real-time operations
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-0.3.106-green?style=flat-square" alt="Version">
  <img src="https://img.shields.io/badge/license-AGPL--3.0-blue?style=flat-square" alt="License">
  <img src="https://img.shields.io/badge/react-18.3.1-61DAFB?style=flat-square&logo=react" alt="React">
  <img src="https://img.shields.io/badge/typescript-5.9.3-3178C6?style=flat-square&logo=typescript" alt="TypeScript">
  <img src="https://img.shields.io/badge/tailwind-3.4.1-06B6D4?style=flat-square&logo=tailwindcss" alt="Tailwind">
  <img src="https://img.shields.io/badge/three.js-0.175.0-black?style=flat-square&logo=three.js" alt="Three.js">
</p>

---

## Overview

Minerva is a modern, cyberpunk-themed web interface for the [Mythic C2 Framework](https://github.com/its-a-feature/Mythic). It replaces Mythic's built-in React UI with a feature-rich, visually immersive operator experience designed for red team operations.

Built with React, TypeScript, Tailwind CSS, and Three.js, Minerva provides real-time collaborative graph visualization, 3D network topology, interactive command consoles, and a full suite of operational tools — all wrapped in a sleek dark cyberpunk aesthetic.

### Key Highlights

- **Real-time Collaborative Graph** — Interactive callback network visualization with custom node creation and multi-user sync
- **3D Cyber-Topology** — Full Three.js-powered 3D network map with orbit controls, subnet grouping, and live updates
- **Interactive Console** — Rich command tasking with syntax highlighting, split-view output, and streaming results
- **Battle Mode** — Tactical UI optimizations for active operations with combat/recon/normal mode switching
- **Audio Integration** — Ambient music, sound effects, and audio cues for operational events
- **Cyberpunk Theme** — Dark-themed UI with monospace typography, scan-line effects, and green/cyan accent colors

---

## Screenshots

### Login

Cyberpunk-styled authentication with real-time server status monitoring, HTTPS encryption indicator, and session state tracking.

<p align="center">
  <img src="docs/screenshots/login.png" alt="Login Page" width="100%">
</p>

### Dashboard

Central command overview displaying active callbacks, total payloads, C2 infrastructure status, operation details, command statistics, asset collection metrics, and recent activity feed.

<p align="center">
  <img src="docs/screenshots/dashboard.png" alt="Dashboard" width="100%">
</p>

### Active Callbacks

Callback management with interactive graph visualization showing the Minerva core node connected to active agents. Includes visual topology view with real-time status indicators and a sortable data table below.

<p align="center">
  <img src="docs/screenshots/callbacks.png" alt="Active Callbacks" width="100%">
</p>

### Payloads Overview

Payload creation and management hub with tabs for listing payloads, creating new payloads, and building wrappers. Supports import/export of payload configurations.

<p align="center">
  <img src="docs/screenshots/payloads.png" alt="Payloads Overview" width="100%">
</p>

### Interactive Console

Rich command tasking interface with real-time output rendering. Displays callback details (host, OS, architecture, agent type) in the sidebar. Supports syntax-highlighted output, file browser integration, and split-view for structured data.

<p align="center">
  <img src="docs/screenshots/console.png" alt="Interactive Console" width="100%">
</p>

### 3D Cyber-Topology

Full Three.js-powered 3D network topology map with interactive orbit controls. Nodes are color-coded by type (Core/Alive/Dead/Custom) with dashed connection lines. Features a legend overlay and real-time status bar showing node counts.

<p align="center">
  <img src="docs/screenshots/topology3d.png" alt="3D Cyber-Topology" width="100%">
</p>

### File Manager

Centralized file management with categorized sidebar for Downloads, Uploads, Screenshots, and Eventing Workflows. Includes target machine browser and file search capabilities.

<p align="center">
  <img src="docs/screenshots/files.png" alt="File Manager" width="100%">
</p>

### Credentials Vault

Credential storage and organization with multi-field search (Account, Realm, Credential, Comment, Tag). Tracks verified vs harvested credential counts.

<p align="center">
  <img src="docs/screenshots/credentials.png" alt="Credentials Vault" width="100%">
</p>

### Tunnel Manager

Tunnel management with visual topology showing the operator-side proxy, C2 server relay, and target-side endpoint. Displays active tunnel status, port mappings, and connection chain in a cyberpunk-styled flow diagram.

<p align="center">
  <img src="docs/screenshots/tunnels.png" alt="Tunnel Manager" width="100%">
</p>

### MITRE ATT&CK

Full MITRE ATT&CK matrix visualization with 637 techniques mapped across all tactical categories. Filter by Tasks, Tasks/PT, Commands, or Tags with execution tracking.

<p align="center">
  <img src="docs/screenshots/mitre.png" alt="MITRE ATT&CK" width="100%">
</p>

### C2 Profiles

C2 communication profile management showing all installed profiles (discord, dns, github, http, https, tcp, websocket) with version info, status indicators, and configuration controls.

<p align="center">
  <img src="docs/screenshots/c2profiles.png" alt="C2 Profiles" width="100%">
</p>

### Operations Manager

Operation lifecycle management with status tracking (Active/Complete/Deleted), operator assignments, and command block lists for OpSec enforcement.

<p align="center">
  <img src="docs/screenshots/operations.png" alt="Operations Manager" width="100%">
</p>

### Settings

Comprehensive settings panel with operator preferences, display toggles, timestamp formatting, task interaction modes, browser script options, and theme customization.

<p align="center">
  <img src="docs/screenshots/settings.png" alt="Settings" width="100%">
</p>

---

## Features

### Core Operations

| Feature | Description |
|---------|-------------|
| **Callbacks** | Real-time callback tracking with health indicators (alive/dead/streaming), bulk operations, grouping, and sleep/jitter configuration |
| **Payloads** | Multi-step payload creation wizard with staging, building, wrapper support, and auto-generation |
| **Console** | Interactive command tasking with syntax highlighting, split-view output, command history, and streaming results |
| **Files** | Download/upload tracking, screenshot viewer, keylog search, and artifact organization |
| **Credentials** | Credential storage with deduplication, hash management, and account linking |
| **Search** | Global search across all data types with advanced filtering |

### Visualization

| Feature | Description |
|---------|-------------|
| **Callback Graph** | Interactive 2D graph using ReactFlow with ELK auto-layout, custom node creation, edge management, and PNG export |
| **3D Topology** | Three.js-powered 3D network map with orbit controls, subnet grouping (CIDR), physics-based positioning, and context menus |
| **Custom Nodes** | Create relay/proxy nodes in the graph view with multi-user collaborative editing (5s sync polling) |
| **MITRE ATT&CK** | Full ATT&CK matrix visualization with technique mapping and execution tracking |
| **Tunnel Map** | Tunnel visualization showing parent-child relationships and status |

### Advanced

| Feature | Description |
|---------|-------------|
| **Battle Mode** | Combat/Recon/Normal mode switching with tactical UI optimizations and 2x animation speed |
| **Eventing** | Event-driven automation with triggers, subscriptions, and real-time notifications |
| **Audio System** | Global music player (IndexedDB storage), sound effects for operational events (callbacks, tunnels, auth) |
| **Operations** | Operation lifecycle management with role-based access control |
| **Reporting** | Report generation from operation data with analytics |
| **C2 Profiles** | Profile configuration and management |
| **Browser Scripts** | Custom browser automation scripts |
| **Tags** | Tag-based organization and filtering across all entities |

---

## Tech Stack

| Category | Technologies |
|----------|-------------|
| **Frontend** | React 18, TypeScript 5.9, React Router 7 |
| **Styling** | Tailwind CSS 3.4, Material-UI 7, Emotion, Framer Motion |
| **State** | Zustand (persisted app store), Apollo Client (GraphQL + cache) |
| **Real-time** | GraphQL subscriptions via WebSocket (graphql-ws) |
| **3D** | Three.js 0.175, React Three Fiber, React Three Drei |
| **Graph** | @xyflow/react 12.6, ELK.js (hierarchical layout) |
| **Charts** | MUI X Charts, MUI X Data Grid |
| **Editor** | React Ace with syntax highlighting |
| **Build** | React App Rewired, PostCSS, Webpack |
| **Deploy** | Docker, Nginx (SSL reverse proxy) |

---

## Quick Start

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and Docker Compose
- A running [Mythic C2](https://github.com/its-a-feature/Mythic) instance

### Production (Standalone Docker)

Run Minerva as an independent container on port **443**, proxying API requests to your Mythic instance on **7443**.

```bash
# Default: connects to Mythic at https://host.docker.internal:7443
docker compose build
docker compose up -d
```

Open **https://\<your-host\>** and login with your Mythic credentials.

To point at a remote Mythic instance:

```bash
MYTHIC_ADDRESS=https://10.0.0.5:7443 docker compose up -d
```

To stop:

```bash
docker compose down
```

### Setup (Replace mythic_react)

If you prefer to replace Mythic's built-in UI instead of running standalone:

```bash
./scripts/minerva_setup.sh        # Full setup
./scripts/minerva_setup.sh verify # Verify installation
./scripts/minerva_setup.sh fix    # Fix issues
./scripts/minerva_setup.sh status # Check status
./scripts/minerva_setup.sh clean  # Reset database
```

---

## Development Mode (Hot Reload)

### Architecture

Dev mode uses two containers:

| Container | Role | Description |
|-----------|------|-------------|
| `minerva-dev` | React Dev Server | Runs `react-app-rewired start` on port 3000 with hot module replacement (HMR). Source code is mounted as volumes so any file change triggers an instant browser refresh. |
| `minerva` | Nginx SSL Proxy | Listens on port **443** with self-signed SSL. Proxies `/new/` to the dev server, `/ws` for HMR WebSocket, and `/graphql/`, `/auth`, `/refresh`, `/direct/` to your Mythic instance. |

```
Browser :443 ──> nginx (SSL) ──> minerva-dev :3000 (React dev server)
                       |
                       └──> Mythic :7443 (API / GraphQL / WebSocket)
```

### Quick Start

```bash
# Start dev mode (first run will install npm dependencies)
docker compose -f docker-compose.dev.yml up -d --build

# Check both containers are running
docker compose -f docker-compose.dev.yml ps

# Watch dev server logs (wait for "webpack compiled")
docker logs -f minerva-dev
```

Open **https://\<your-host\>** — any changes to files under `src/` or `public/` will automatically hot-reload in the browser.

### Mounted Volumes

| Host Path | Container Path | Purpose |
|-----------|---------------|---------|
| `./src/` | `/app/src/` | React source code (hot reload) |
| `./public/` | `/app/public/` | Static assets (audio, favicon, etc.) |
| `./tailwind.config.js` | `/app/tailwind.config.js` | Tailwind CSS configuration |
| `./postcss.config.js` | `/app/postcss.config.js` | PostCSS configuration |
| `./config-overrides.js` | `/app/config-overrides.js` | Webpack overrides |
| `./tsconfig.json` | `/app/tsconfig.json` | TypeScript configuration |
| `./.env` | `/app/.env` | Environment variables |

> **Note:** `node_modules/` and `package.json` are **not** mounted — they are baked into the Docker image. If you add/remove npm packages, rebuild with `docker compose -f docker-compose.dev.yml up -d --build`.

### Connecting to a Remote Mythic Instance

```bash
MYTHIC_ADDRESS=https://10.0.0.5:7443 docker compose -f docker-compose.dev.yml up -d --build
```

### Switching Between Dev and Production

```bash
# Switch to production (static build, no hot reload)
docker compose -f docker-compose.dev.yml down
docker compose up -d --build

# Switch back to dev (hot reload)
docker compose down
docker compose -f docker-compose.dev.yml up -d --build
```

---

## Project Structure

```
Minerva/
├── src/
│   ├── Minerva/                        # Main application
│   │   ├── App.tsx                     # Router & layout
│   │   ├── store.ts                    # Zustand app state (persisted)
│   │   ├── index.css                   # Global styles & CSS variables
│   │   │
│   │   ├── pages/                      # Page components
│   │   │   ├── Dashboard.tsx           # Home dashboard
│   │   │   ├── Callbacks.tsx           # Callback management & graph
│   │   │   ├── Console.tsx             # Interactive command tasking
│   │   │   ├── Payloads.tsx            # Payload creation & management
│   │   │   ├── Topology3D.tsx          # 3D network visualization
│   │   │   ├── Files.tsx               # File management
│   │   │   ├── Credentials.tsx         # Credential vault
│   │   │   ├── MitreAttack.tsx         # MITRE ATT&CK matrix
│   │   │   ├── Search.tsx              # Global search
│   │   │   ├── Tunnels.tsx             # Tunnel management
│   │   │   ├── Eventing.tsx            # Event automation
│   │   │   ├── Operations.tsx          # Operation management
│   │   │   ├── Settings.tsx            # User preferences
│   │   │   ├── Login.tsx               # Authentication
│   │   │   └── ...                     # + more pages
│   │   │
│   │   ├── components/                 # Reusable UI components
│   │   │   ├── CallbackGraph.tsx       # Interactive graph (ReactFlow)
│   │   │   ├── FileBrowser.tsx         # File tree browser
│   │   │   ├── OutputRenderer.tsx      # Rich output rendering
│   │   │   ├── Sidebar.tsx             # Navigation sidebar
│   │   │   ├── GlobalAudioPlayer.tsx   # Music player
│   │   │   ├── BattleMode.tsx          # Combat mode toggle
│   │   │   └── ...                     # + more components
│   │   │
│   │   ├── lib/                        # Business logic & API
│   │   │   ├── api.ts                  # GraphQL queries & mutations
│   │   │   ├── customGraphNodeService.ts # Graph node serialization
│   │   │   ├── soundEffects.ts         # Audio playback
│   │   │   ├── utils.ts                # Helper functions
│   │   │   └── musicDB.ts             # Music library (IndexedDB)
│   │   │
│   │   ├── types/                      # TypeScript interfaces
│   │   └── context/                    # React Context providers
│   │
│   ├── components/                     # Legacy shared components
│   ├── index.js                        # React root & Apollo setup
│   └── cache.js                        # Apollo cache & reactive vars
│
├── public/                             # Static assets
├── nginx/                              # Nginx configuration templates
├── docker/                             # Dockerfiles (dev, prod, nginx)
├── scripts/                            # Setup & maintenance scripts
├── docs/                               # Banner, screenshots
├── docker-compose.yml                  # Production deployment
├── docker-compose.dev.yml              # Development (hot reload)
├── tailwind.config.js                  # Tailwind theme configuration
└── package.json                        # Dependencies
```

---

## Custom Graph Nodes

Create custom nodes in Callbacks → Graph View to model relay/proxy infrastructure:

| Action | How |
|--------|-----|
| Create node | Right-click empty space → "Create Custom Node" |
| Connect nodes | Right-click node → "Set Parent" |
| Edit/Delete | Right-click node → Edit/Delete |

Custom nodes store hostname, IP, OS, architecture, and C2 profile data. Node positions persist across sessions and data syncs across all connected users via 5-second polling.

### Debug

Set `DEBUG_GRAPH = true` in `CallbackGraph.tsx` to enable graph operation logging.

---

## Theme System

Minerva uses CSS custom properties for dynamic theming:

```css
/* Dark theme (default) */
:root {
  --color-signal:  255 255 255    /* Text & highlights */
  --color-accent:  34 197 94      /* Green accent */
  --color-void:    0 0 0          /* Background */
  --color-ghost:   153 153 153    /* Borders & secondary */
  --color-machine: 51 51 51       /* Card backgrounds */
}

/* Light theme */
:root.minerva-light {
  --color-signal:  30 30 40
  --color-accent:  22 163 74
  --color-void:    240 240 245
  --color-ghost:   90 90 100
  --color-machine: 225 225 230
}
```

Fonts: **JetBrains Mono** (monospace) and **Inter** (sans-serif).

---

## Authentication & Sessions

- JWT-based authentication with access + refresh token pattern
- 4-hour JWT lifetime with automatic refresh
- Session expiration detection and auto-logout
- WebSocket authentication for real-time GraphQL subscriptions
- User warning at 30 minutes remaining

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| CSS not loading | Ensure `tailwind.config.js` and `postcss.config.js` are present. Restart with `--build`. |
| Hot reload not working | Check `docker logs minerva-dev`. Dev server uses `CHOKIDAR_USEPOLLING=true` for Docker. |
| `MODULE_NOT_FOUND` | Check volume mounts in `docker-compose.dev.yml`. |
| New npm package not found | Rebuild: `docker compose -f docker-compose.dev.yml up -d --build` |
| Browser SSL warning | Expected — dev mode uses self-signed certificates. Accept and proceed. |
| Graph nodes not syncing | Run `./scripts/minerva_setup.sh fix` to verify agentstorage table. |
| Database issues | Run `./scripts/minerva_setup.sh clean` to reset, then restart. |

---

## License

This project is dual-licensed:

- **Open Source**: [AGPL-3.0](./LICENSE) —
  You may use, modify, and distribute this software under the terms of AGPL-3.0.
  Any derivative work or service using this software must also be released under AGPL-3.0.

- **Commercial License**:
  If you wish to use this software in a proprietary/closed-source product
  or service without complying with the AGPL-3.0 obligations,
  a commercial license is available.
  Contact: aifred0729tw@gmail.com
