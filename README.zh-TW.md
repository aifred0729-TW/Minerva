<p align="center">
  <img src="docs/banner.jpg" alt="Minerva - Next-Generation Mythic C2 Interface" width="100%">
</p>

<p align="center">
  繁體中文 | <a href="README.md">English</a>
</p>

<p align="center">
  <strong>Next-Generation Mythic C2 Interface</strong><br>
  具備協作式 Graph Visualization、3D Cyber-Topology 與 Real-time Operations 的進階 Command & Control 介面
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

## 概述

Minerva 是一款為 [Mythic C2 Framework](https://github.com/its-a-feature/Mythic) 打造的現代化 Cyberpunk 風格 Web 介面。它取代了 Mythic 內建的 React UI，為 Red Team Operations 提供功能豐富、視覺沉浸式的 Operator 體驗。

採用 React、TypeScript、Tailwind CSS 和 Three.js 建構，Minerva 提供 Real-time Collaborative Graph Visualization、3D Network Topology、Interactive Console，以及完整的 Operation 工具套件 — 全部包裹在簡潔的暗色 Cyberpunk 美學風格中。

### 核心亮點

- **Real-time Collaborative Graph** — 互動式 Callback 網路視覺化，支援 Custom Node 建立與多用戶同步
- **3D Cyber-Topology** — 完整的 Three.js 驅動 3D Network Map，支援 Orbit Controls、Subnet Grouping 與即時更新
- **Interactive Console** — 豐富的 Command Tasking，支援 Syntax Highlighting、Split-view Output 與 Streaming Results
- **Battle Mode** — 針對即時作戰的 Tactical UI 優化，支援 Combat/Recon/Normal Mode 切換
- **Audio Integration** — Ambient Music、Sound Effects 與 Operation Events 的音訊提示
- **Cyberpunk Theme** — Dark Theme UI，搭配 Monospace Typography、Scanline Effects 與綠色/青色 Accent Colors

---

## Screenshots

### Login

Cyberpunk 風格的 Authentication 介面，具備即時 Server Status 監控、HTTPS Encryption Indicator 與 Session State Tracking。

<p align="center">
  <img src="docs/screenshots/login.png" alt="Login Page" width="100%">
</p>

### Dashboard

Central Command 概覽，顯示 Active Callbacks 數量、Total Payloads、C2 Infrastructure 狀態、Operation 詳情、Command Statistics、Asset Collection Metrics 與 Recent Activity Feed。

<p align="center">
  <img src="docs/screenshots/dashboard.png" alt="Dashboard" width="100%">
</p>

### Active Callbacks

Callback 管理介面，具備互動式 Graph Visualization，顯示 Minerva Core Node 與 Active Agents 的連線。包含具 Real-time Status Indicators 的視覺 Topology View 與下方可排序的 Data Table。

<p align="center">
  <img src="docs/screenshots/callbacks.png" alt="Active Callbacks" width="100%">
</p>

### Payloads Overview

Payload 建立與管理中心，提供 Payload 列表、建立新 Payload 與建構 Wrapper 的分頁。支援 Payload Configuration 的 Import/Export。

<p align="center">
  <img src="docs/screenshots/payloads.png" alt="Payloads Overview" width="100%">
</p>

### Interactive Console

豐富的 Command Tasking 介面，支援 Real-time Output Rendering。Sidebar 顯示 Callback 詳細資訊（Host、OS、Architecture、Agent Type）。支援 Syntax Highlighted Output、File Browser 整合與 Structured Data 的 Split-view。

<p align="center">
  <img src="docs/screenshots/console.png" alt="Interactive Console" width="100%">
</p>

### 3D Cyber-Topology

完整的 Three.js 驅動 3D Network Topology Map，具備互動式 Orbit Controls。Nodes 依類型（Core/Alive/Dead/Custom）以顏色區分，搭配 Dashed Connection Lines。提供 Legend Overlay 與 Real-time Status Bar 顯示 Node 數量。

<p align="center">
  <img src="docs/screenshots/topology3d.png" alt="3D Cyber-Topology" width="100%">
</p>

### File Manager

集中式 File Management，Sidebar 分類為 Downloads、Uploads、Screenshots 與 Eventing Workflows。包含 Target Machine Browser 與 File Search 功能。

<p align="center">
  <img src="docs/screenshots/files.png" alt="File Manager" width="100%">
</p>

### Credentials Vault

Credential 儲存與組織，支援多欄位搜尋（Account、Realm、Credential、Comment、Tag）。追蹤 Verified 與 Harvested Credential 數量。

<p align="center">
  <img src="docs/screenshots/credentials.png" alt="Credentials Vault" width="100%">
</p>

### Tunnel Manager

Tunnel 管理介面，具備視覺化 Topology 顯示 Operator-side Proxy、C2 Server Relay 與 Target-side Endpoint。以 Cyberpunk 風格的 Flow Diagram 顯示 Active Tunnel 狀態、Port Mappings 與 Connection Chain。

<p align="center">
  <img src="docs/screenshots/tunnels.png" alt="Tunnel Manager" width="100%">
</p>

### MITRE ATT&CK

完整的 MITRE ATT&CK Matrix Visualization，涵蓋所有 Tactical Categories 的 637 項 Techniques。支援依 Tasks、Tasks/PT、Commands 或 Tags 篩選，並追蹤 Execution 狀態。

<p align="center">
  <img src="docs/screenshots/mitre.png" alt="MITRE ATT&CK" width="100%">
</p>

### C2 Profiles

C2 Communication Profile 管理，顯示所有已安裝的 Profiles（discord、dns、github、http、https、tcp、websocket），包含版本資訊、Status Indicators 與 Configuration Controls。

<p align="center">
  <img src="docs/screenshots/c2profiles.png" alt="C2 Profiles" width="100%">
</p>

### Operations Manager

Operation Lifecycle 管理，具備 Status Tracking（Active/Complete/Deleted）、Operator 指派與 Command Block Lists 以強化 OpSec。

<p align="center">
  <img src="docs/screenshots/operations.png" alt="Operations Manager" width="100%">
</p>

### Settings

完整的 Settings Panel，包含 Operator Preferences、Display Toggles、Timestamp Formatting、Task Interaction Modes、Browser Script Options 與 Theme Customization。

<p align="center">
  <img src="docs/screenshots/settings.png" alt="Settings" width="100%">
</p>

---

## 功能特色

### Core Operations

| 功能 | 說明 |
|------|------|
| **Callbacks** | Real-time Callback Tracking，具備 Health Indicators（Alive/Dead/Streaming）、Bulk Operations、Grouping 與 Sleep/Jitter 設定 |
| **Payloads** | 多步驟 Payload Creation Wizard，支援 Staging、Building、Wrapper 與 Auto-generation |
| **Console** | Interactive Command Tasking，支援 Syntax Highlighting、Split-view Output、Command History 與 Streaming Results |
| **Files** | Download/Upload Tracking、Screenshot Viewer、Keylog Search 與 Artifact Organization |
| **Credentials** | Credential Storage，支援 Deduplication、Hash Management 與 Account Linking |
| **Search** | 跨所有資料類型的 Global Search，支援 Advanced Filtering |

### Visualization

| 功能 | 說明 |
|------|------|
| **Callback Graph** | 使用 ReactFlow 的互動式 2D Graph，具備 ELK Auto-layout、Custom Node Creation、Edge Management 與 PNG Export |
| **3D Topology** | Three.js 驅動的 3D Network Map，支援 Orbit Controls、Subnet Grouping（CIDR）、Physics-based Positioning 與 Context Menus |
| **Custom Nodes** | 在 Graph View 中建立 Relay/Proxy Nodes，支援多用戶 Collaborative Editing（5 秒 Sync Polling） |
| **MITRE ATT&CK** | 完整的 ATT&CK Matrix Visualization，支援 Technique Mapping 與 Execution Tracking |
| **Tunnel Map** | Tunnel Visualization，顯示 Parent-child Relationships 與 Status |

### Advanced

| 功能 | 說明 |
|------|------|
| **Battle Mode** | Combat/Recon/Normal Mode 切換，具備 Tactical UI Optimizations 與 2x Animation Speed |
| **Eventing** | Event-driven Automation，支援 Triggers、Subscriptions 與 Real-time Notifications |
| **Audio System** | Global Music Player（IndexedDB Storage）、Operation Events Sound Effects（Callbacks、Tunnels、Auth） |
| **Operations** | Operation Lifecycle Management，支援 Role-based Access Control |
| **Reporting** | 從 Operation Data 生成 Reports 與 Analytics |
| **C2 Profiles** | Profile Configuration 與管理 |
| **Browser Scripts** | 自訂 Browser Automation Scripts |
| **Tags** | 跨所有 Entities 的 Tag-based Organization 與 Filtering |

---

## Tech Stack

| 類別 | 技術 |
|------|------|
| **Frontend** | React 18、TypeScript 5.9、React Router 7 |
| **Styling** | Tailwind CSS 3.4、Material-UI 7、Emotion、Framer Motion |
| **State Management** | Zustand（Persisted App Store）、Apollo Client（GraphQL + Cache） |
| **Real-time** | GraphQL Subscriptions via WebSocket（graphql-ws） |
| **3D Rendering** | Three.js 0.175、React Three Fiber、React Three Drei |
| **Graph Engine** | @xyflow/react 12.6、ELK.js（Hierarchical Layout） |
| **Charts** | MUI X Charts、MUI X Data Grid |
| **Editor** | React Ace，支援 Syntax Highlighting |
| **Build** | React App Rewired、PostCSS、Webpack |
| **Deploy** | Docker、Nginx（SSL Reverse Proxy） |

---

## Quick Start

### 前置需求

- [Docker](https://docs.docker.com/get-docker/) 與 Docker Compose
- 一個運行中的 [Mythic C2](https://github.com/its-a-feature/Mythic) Instance

### Production（Standalone Docker）

將 Minerva 作為獨立 Container 運行於 Port **443**，將 API Request Proxy 到 Port **7443** 的 Mythic Instance。

```bash
# 預設：連接到 https://host.docker.internal:7443 的 Mythic
docker compose build
docker compose up -d
```

開啟 **https://\<your-host\>** 並使用你的 Mythic Credentials 登入。

連接到 Remote Mythic Instance：

```bash
MYTHIC_ADDRESS=https://10.0.0.5:7443 docker compose up -d
```

停止服務：

```bash
docker compose down
```

### Setup（取代 mythic_react）

如果你偏好取代 Mythic 內建的 UI 而非獨立運行：

```bash
./scripts/minerva_setup.sh        # Full Setup
./scripts/minerva_setup.sh verify # Verify Installation
./scripts/minerva_setup.sh fix    # Fix Issues
./scripts/minerva_setup.sh status # Check Status
./scripts/minerva_setup.sh clean  # Reset Database
```

---

## Development Mode（Hot Reload）

### Architecture

Development Mode 使用兩個 Containers：

| Container | Role | 說明 |
|-----------|------|------|
| `minerva-dev` | React Dev Server | 在 Port 3000 運行 `react-app-rewired start`，支援 Hot Module Replacement（HMR）。Source Code 以 Volumes 掛載，任何檔案變更都會立即觸發瀏覽器 Refresh。 |
| `minerva` | Nginx SSL Proxy | 監聽 Port **443**，使用 Self-signed SSL Certificate。將 `/new/` Proxy 到 Dev Server、`/ws` 用於 HMR WebSocket、`/graphql/`、`/auth`、`/refresh`、`/direct/` Proxy 到 Mythic Instance。 |

```
Browser :443 ──> Nginx (SSL) ──> minerva-dev :3000 (React Dev Server)
                       |
                       └──> Mythic :7443 (API / GraphQL / WebSocket)
```

### Quick Start

```bash
# 啟動 Development Mode（首次運行會安裝 npm Dependencies）
docker compose -f docker-compose.dev.yml up -d --build

# 確認兩個 Containers 都在運行
docker compose -f docker-compose.dev.yml ps

# 查看 Dev Server Logs（等待 "webpack compiled"）
docker logs -f minerva-dev
```

開啟 **https://\<your-host\>** — 任何對 `src/` 或 `public/` 下檔案的變更都會自動 Hot Reload 到瀏覽器。

### Mounted Volumes

| Host Path | Container Path | 用途 |
|-----------|---------------|------|
| `./src/` | `/app/src/` | React Source Code（Hot Reload） |
| `./public/` | `/app/public/` | Static Assets（Audio、Favicon 等） |
| `./tailwind.config.js` | `/app/tailwind.config.js` | Tailwind CSS Configuration |
| `./postcss.config.js` | `/app/postcss.config.js` | PostCSS Configuration |
| `./config-overrides.js` | `/app/config-overrides.js` | Webpack Overrides |
| `./tsconfig.json` | `/app/tsconfig.json` | TypeScript Configuration |
| `./.env` | `/app/.env` | Environment Variables |

> **注意：** `node_modules/` 和 `package.json` **未**掛載 — 它們內建於 Docker Image 中。如果你新增/移除 npm Packages，請使用 `docker compose -f docker-compose.dev.yml up -d --build` 重新 Build。

### 連接到 Remote Mythic Instance

```bash
MYTHIC_ADDRESS=https://10.0.0.5:7443 docker compose -f docker-compose.dev.yml up -d --build
```

### 切換 Development 與 Production

```bash
# 切換到 Production（Static Build，無 Hot Reload）
docker compose -f docker-compose.dev.yml down
docker compose up -d --build

# 切換回 Development（Hot Reload）
docker compose down
docker compose -f docker-compose.dev.yml up -d --build
```

---

## Project Structure

```
Minerva/
├── src/
│   ├── Minerva/                        # Main Application
│   │   ├── App.tsx                     # Router & Layout
│   │   ├── store.ts                    # Zustand App State (Persisted)
│   │   ├── index.css                   # Global Styles & CSS Variables
│   │   │
│   │   ├── pages/                      # Page Components
│   │   │   ├── Dashboard.tsx           # Home Dashboard
│   │   │   ├── Callbacks.tsx           # Callback Management & Graph
│   │   │   ├── Console.tsx             # Interactive Command Tasking
│   │   │   ├── Payloads.tsx            # Payload Creation & Management
│   │   │   ├── Topology3D.tsx          # 3D Network Visualization
│   │   │   ├── Files.tsx               # File Management
│   │   │   ├── Credentials.tsx         # Credentials Vault
│   │   │   ├── MitreAttack.tsx         # MITRE ATT&CK Matrix
│   │   │   ├── Search.tsx              # Global Search
│   │   │   ├── Tunnels.tsx             # Tunnel Management
│   │   │   ├── Eventing.tsx            # Event Automation
│   │   │   ├── Operations.tsx          # Operation Management
│   │   │   ├── Settings.tsx            # User Preferences
│   │   │   ├── Login.tsx               # Authentication
│   │   │   └── ...                     # + More Pages
│   │   │
│   │   ├── components/                 # Reusable UI Components
│   │   │   ├── CallbackGraph.tsx       # Interactive Graph (ReactFlow)
│   │   │   ├── FileBrowser.tsx         # File Tree Browser
│   │   │   ├── OutputRenderer.tsx      # Rich Output Rendering
│   │   │   ├── Sidebar.tsx             # Navigation Sidebar
│   │   │   ├── GlobalAudioPlayer.tsx   # Music Player
│   │   │   ├── BattleMode.tsx          # Battle Mode Toggle
│   │   │   └── ...                     # + More Components
│   │   │
│   │   ├── lib/                        # Business Logic & API
│   │   │   ├── api.ts                  # GraphQL Queries & Mutations
│   │   │   ├── customGraphNodeService.ts # Graph Node Serialization
│   │   │   ├── soundEffects.ts         # Audio Playback
│   │   │   ├── utils.ts                # Helper Functions
│   │   │   └── musicDB.ts             # Music Library (IndexedDB)
│   │   │
│   │   ├── types/                      # TypeScript Interfaces
│   │   └── context/                    # React Context Providers
│   │
│   ├── components/                     # Legacy Shared Components
│   ├── index.js                        # React Root & Apollo Setup
│   └── cache.js                        # Apollo Cache & Reactive Variables
│
├── public/                             # Static Assets
├── nginx/                              # Nginx Configuration Templates
├── docker/                             # Dockerfiles (dev, prod, nginx)
├── scripts/                            # Setup & Maintenance Scripts
├── docs/                               # Banner, Screenshots
├── docker-compose.yml                  # Production Deployment
├── docker-compose.dev.yml              # Development (Hot Reload)
├── tailwind.config.js                  # Tailwind Theme Configuration
└── package.json                        # Dependencies
```

---

## Custom Graph Nodes

在 Callbacks → Graph View 中建立 Custom Nodes 以模擬 Relay/Proxy Infrastructure：

| 操作 | 方式 |
|------|------|
| 建立 Node | 右鍵點擊空白處 → "Create Custom Node" |
| 連接 Nodes | 右鍵點擊 Node → "Set Parent" |
| 編輯/刪除 | 右鍵點擊 Node → Edit/Delete |

Custom Nodes 儲存 Hostname、IP、OS、Architecture 與 C2 Profile 資料。Node Positions 跨 Sessions 持久化，資料透過 5 秒 Polling 在所有連線用戶間同步。

### Debug

在 `CallbackGraph.tsx` 中設定 `DEBUG_GRAPH = true` 以啟用 Graph Operation Logging。

---

## Theme System

Minerva 使用 CSS Custom Properties 實現動態 Theme 切換：

```css
/* Dark Theme（預設） */
:root {
  --color-signal:  255 255 255    /* Text & Highlights */
  --color-accent:  34 197 94      /* Green Accent */
  --color-void:    0 0 0          /* Background */
  --color-ghost:   153 153 153    /* Borders & Secondary */
  --color-machine: 51 51 51       /* Card Backgrounds */
}

/* Light Theme */
:root.minerva-light {
  --color-signal:  30 30 40
  --color-accent:  22 163 74
  --color-void:    240 240 245
  --color-ghost:   90 90 100
  --color-machine: 225 225 230
}
```

Fonts：**JetBrains Mono**（Monospace）與 **Inter**（Sans-serif）。

---

## Authentication & Sessions

- 基於 JWT 的 Authentication，採用 Access Token + Refresh Token 模式
- 4 小時 JWT Lifetime，支援 Auto Refresh
- Session Expiration Detection 與 Auto-logout
- WebSocket Authentication，用於 Real-time GraphQL Subscriptions
- 剩餘 30 分鐘時發出用戶警告

---

## Troubleshooting

| 問題 | 解決方案 |
|------|----------|
| CSS 未載入 | 確認 `tailwind.config.js` 與 `postcss.config.js` 存在。使用 `--build` 重新啟動。 |
| Hot Reload 無作用 | 檢查 `docker logs minerva-dev`。Dev Server 使用 `CHOKIDAR_USEPOLLING=true` 進行 Docker File Watching。 |
| `MODULE_NOT_FOUND` | 檢查 `docker-compose.dev.yml` 中的 Volume Mounts 設定。 |
| 找不到新的 npm Package | 重新 Build：`docker compose -f docker-compose.dev.yml up -d --build` |
| 瀏覽器顯示 SSL Warning | 正常現象 — Development Mode 使用 Self-signed Certificates。接受並繼續即可。 |
| Graph Nodes 未同步 | 執行 `./scripts/minerva_setup.sh fix` 驗證 agentstorage Table。 |
| Database 問題 | 執行 `./scripts/minerva_setup.sh clean` Reset，然後重新啟動。 |

---

## License

本專案採用 Dual License：

- **Open Source**：[AGPL-3.0](./LICENSE) —
  你可以在 AGPL-3.0 條款下使用、修改與散布本軟體。
  任何 Derivative Work 或使用本軟體的 Service 也必須以 AGPL-3.0 釋出。

- **Commercial License**：
  如果你希望在 Proprietary/Closed-source Product 或 Service 中使用本軟體，
  而不遵守 AGPL-3.0 義務，
  可以取得 Commercial License。
  聯絡：aifred0729tw@gmail.com
