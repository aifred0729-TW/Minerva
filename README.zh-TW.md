<p align="center">
  <img src="docs/banner.jpg" alt="Minerva - Next-Generation Mythic C2 Interface" width="100%">
</p>

<p align="center">
  繁體中文 | <a href="README.md">English</a>
</p>

<p align="center">
  <strong>Next-Generation Mythic C2 Interface</strong><br>
  為高階紅隊 Operator 打造的 Cyberpunk 風、即時、可協作 Command &amp; Control 介面
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

## 目錄

- [概述](#概述)
- [Screenshots](#screenshots)
- [功能總覽](#功能總覽)
- [Application Map](#application-map)
- [Tech Stack](#tech-stack)
- [Quick Start（Production）](#quick-startproduction)
- [Development Mode（Hot Reload）](#development-modehot-reload)
- [Metasploit Integration](#metasploit-integration)
- [Setup Script（`minerva_install.sh`）](#setup-scriptminerva_installsh)
- [Mythic 原始碼修補（`mythic_change.sh`）](#mythic-原始碼修補mythic_changesh)
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

## 概述

<p align="center">
  <img src="docs/screenshots/login.png" alt="Minerva Login" width="100%">
</p>

**Minerva** 是一款為 [Mythic C2 Framework](https://github.com/its-a-feature/Mythic) 打造的現代化 Cyberpunk 風 Web 介面，可作為 Mythic 內建 `MythicReactUI` 的直接替代品。設計目標是給長時間執行紅隊任務、需要高資訊密度與低操作摩擦的 Operator 使用。

相較於原版 Mythic UI，Minerva 提供：

- **Real-time Collaborative Graph** — ReactFlow 驅動的 Callback Topology，支援多 Operator 共享的 Custom Node（用來描述 Relay／Proxy 等 Mythic 原生不認識的基礎設施），透過 Hasura 每 5 秒同步。
- **3D Cyber-Topology** — Three.js 場景，含 Orbit Controls、Subnet（CIDR）Grouping、物理排版、P2P 虛線、Tunnel 圖層與 Context Menu。
- **Rich Interactive Console** — 多分頁 Terminal，含結構化 Output Block、Mimikatz Parsing、Process List 渲染、File Browser 疊加，以及內嵌的 Tasking 表單。
- **Quick Hack 工作流** — 一鍵套用的紅隊工作流模板（recon／persistence／dumping／lateral movement），將指令串成 macro 對選取的 Callbacks 批次下發。
- **原生 Metasploit 整合** — 內建 MSF-RPC Client，包含 Launch Dashboard、Session 生命週期管理、可永續保存的 Execution History、以及即時 Task Browser Output 解析。
- **MITRE ATT&amp;CK Matrix** — 完整 T-id 矩陣，疊加 Task／Command／Tag 資料，讓 Operator 即時看到 Technique 覆蓋率。
- **Eventing 工作流** — 視覺化 Eventing Instance Builder，含 Keyword Trigger 與條件式步驟。
- **Battle Mode** — 戰術 UI 模式（Combat／Recon／Normal），即時調整 Density、Animation Speed 與 Ambient SFX 的強度。
- **Theming &amp; Audio** — CSS 變數驅動的 Dark／Light Theme、可自訂背景圖、JetBrains Mono／Inter 字型、IndexedDB 儲存的音樂庫、每事件對應的 SFX。

Minerva 可以用兩種方式部署：

1. **獨立 Docker 容器** — 自己一個 `minerva` 容器（Nginx + 靜態 Build），把 `/graphql`、`/auth`、`/refresh`、`/msf-rpc`、`/direct` 反向代理到既有的 Mythic Instance。適合 Production／封閉部署。
2. **取代 `mythic_react`** — 透過 `scripts/minerva_install.sh` 把 Minerva 灌進 Mythic 的 `MythicReactUI` 目錄，讓它跟著 Mythic 原本的 `./mythic-cli` 生命週期一起運轉。

---

## Screenshots

### 1 · Authentication

#### Login

Cyberpunk 風 Authentication 介面，含即時 Server Status 監控、HTTPS Encryption Indicator、Session State Tracker。

<p align="center">
  <img src="docs/screenshots/login.png" alt="Login Page" width="100%">
</p>

### 2 · Command &amp; Control

#### Dashboard

Central Command 概覽 — 顯示 Active Callbacks、Total Payloads、C2 Infrastructure 狀態、Operation 詳情、Command Statistics、Asset Collection Metrics、Top Commands 與 Recent Activity Feed。

<p align="center">
  <img src="docs/screenshots/dashboard.png" alt="Dashboard" width="100%">
</p>

#### Event Feed

即時事件串流與 Alert Counter。連動 Sidebar 的通知鈴鐺，並把新的 Callback、Alert、Custom Event、Feedback、Startup 事件即時呈現。

<p align="center">
  <img src="docs/screenshots/events.png" alt="Event Feed" width="100%">
</p>

#### Operations Manager

Operation Lifecycle 管理，支援 Status Tracking（Active／Complete／Deleted）、Operator 指派與每 Operation 專屬的 OPSEC Command Blocklist。

<p align="center">
  <img src="docs/screenshots/operations.png" alt="Operations Manager" width="100%">
</p>

#### OPSEC

每 Operation 的 OPSEC 控制 — Command Blocklist、Role-based Gate、Tasking 時的執行檢查。

<p align="center">
  <img src="docs/screenshots/opsec.png" alt="OPSEC" width="100%">
</p>

### 3 · Callbacks &amp; Tasking

#### Active Callbacks

ReactFlow Graph 顯示 Minerva Core Node 與 Active Agents 的連線。Custom Nodes 用來模擬 Relay／Proxy 基礎設施。下方為可排序的 Data Table，支援 Bulk Actions、Sleep／Jitter 編輯、Grouping 與最後 Checkin 標記。

<p align="center">
  <img src="docs/screenshots/callbacks.png" alt="Active Callbacks" width="100%">
</p>

#### Console Selection

多 Callback 互動式 Console 的分頁選擇器，列出所有 Operator 先前開啟過的分頁，讓你不丟 Context 就能在 Callback 間切換。

<p align="center">
  <img src="docs/screenshots/console-selection.png" alt="Console Selection" width="100%">
</p>

#### Interactive Console

豐富的 Command Tasking — 結構化 Output Block、Mimikatz Parsing、Process List 渲染、File Browser 疊加、內嵌 Tasking 表單、Drag-and-drop Upload 與即時 Streaming Task Block。

<p align="center">
  <img src="docs/screenshots/console.png" alt="Interactive Console" width="100%">
</p>

#### Tasks

單一 Task 的深度檢視 — 完整 Host Tree、Parameter Inspector、結構化 Output Viewer 與前後 Task 切換。

<p align="center">
  <img src="docs/screenshots/tasks.png" alt="Tasks" width="100%">
</p>

### 4 · Payloads

#### Payloads Overview

Payload 列表 + 多步驟 Create-Payload Wizard + Wrapper 流程的整合頁。支援 Payload Configuration 的 Import／Export 與從既有 Payload 重 Build。

<p align="center">
  <img src="docs/screenshots/payloads.png" alt="Payloads Overview" width="100%">
</p>

#### Create Payload Wizard

逐步 Build 流程：OS &rarr; Type &rarr; Commands &rarr; C2 &rarr; Build。每步驟都會保留狀態，Operator 可隨時退回修改而不丟進度。

<p align="center">
  <img src="docs/screenshots/create-payload.png" alt="Create Payload" width="100%">
</p>

#### Payload Types

所有已安裝 Agent／Wrapper／Translator／Consuming Service／Custom Browser 的統一檢視。頁首工具列新增**搜尋**、**排序（依名稱／狀態／命令數）**、**Online Only** 篩選與 **Show Deleted** 切換。每張卡片顯示 Agent SVG 圖示、容器狀態、Build Parameter Inspector、Command Browser、Container File Editor，以及一鍵測試 Webhook／Logger 事件。

<p align="center">
  <img src="docs/screenshots/payload-types.png" alt="Payload Types" width="100%">
</p>

### 5 · Files、Credentials &amp; Intel

#### File Manager

集中式 File Management，側欄分類為 Downloads、Uploads、Screenshots 與 Eventing Workflow Files。包含 Target Machine File Browser Tree。

<p align="center">
  <img src="docs/screenshots/files.png" alt="File Manager" width="100%">
</p>

#### Credentials Vault

Credential 儲存，支援多欄位搜尋（Account、Realm、Credential、Comment、Tag），追蹤 Verified 與 Harvested 數量，並把每筆 Credential 連回原始來源 Task。

<p align="center">
  <img src="docs/screenshots/credentials.png" alt="Credentials Vault" width="100%">
</p>

#### Artifacts

IoC／Artifact Viewer，可連回 Task 來源並標記主機歸屬。

<p align="center">
  <img src="docs/screenshots/artifacts.png" alt="Artifacts" width="100%">
</p>

#### Search

跨 Tasks／Files／Credentials／Callbacks／Artifacts 的全域搜尋與進階過濾。

<p align="center">
  <img src="docs/screenshots/search.png" alt="Global Search" width="100%">
</p>

### 6 · Infrastructure

#### C2 Profiles

C2 Communication Profile 管理，列出所有已安裝的 Profile（discord、dns、github、http、https、tcp、websocket），含版本資訊、Status Indicator、Container File 列表／編輯與 Start／Stop 控制。

<p align="center">
  <img src="docs/screenshots/c2profiles.png" alt="C2 Profiles" width="100%">
</p>

#### Tunnel Manager

Tunnel 管理介面，含視覺化 Flow Diagram 顯示 Operator-side Proxy、C2 Server Relay 與 Target-side Endpoint。即時顯示 Tunnel 狀態、Port Mapping 與完整連線鏈。

<p align="center">
  <img src="docs/screenshots/tunnels.png" alt="Tunnel Manager" width="100%">
</p>

#### 3D Cyber-Topology

完整 Three.js 驅動的 3D Network Map，含 Orbit Control。Nodes 依類型（Core／Alive／Dead／Custom）以顏色區分，虛線代表 P2P 關係，Tunnel Layer 疊加目前的 SOCKS／RPORTFWD 鏈，並提供 Legend Overlay 與 Real-time Status Bar 顯示 Node 計數。

<p align="center">
  <img src="docs/screenshots/topology3d.png" alt="3D Cyber-Topology" width="100%">
</p>

### 7 · Automation &amp; Frameworks

#### Quick Hacks

一鍵紅隊工作流庫（recon／persistence／dumping／lateral），把指令串成 macro 批次下發給選取的 Callbacks。工作流以 JSON 定義，Operator 可自行擴充。

<p align="center">
  <img src="docs/screenshots/quickhacks.png" alt="Quick Hacks" width="100%">
</p>

#### Metasploit

原生 MSF-RPC Client。Tabs 涵蓋 **Dashboard**（Session／Job／Module 統計）、**Launch Attack**（Module Browser + 參數表單）、**Operations**（活躍 Session、Job、Route）與 **Task History**（永久 Execution History 含完整輸出）。

<p align="center">
  <img src="docs/screenshots/metasploit.png" alt="Metasploit" width="100%">
</p>

#### Eventing

Mythic Eventing 的視覺化 Workflow Builder — Event Group、Instance、Keyword Trigger、條件式步驟、即時事件串流。

<p align="center">
  <img src="docs/screenshots/eventing.png" alt="Eventing" width="100%">
</p>

### 8 · Intel &amp; MITRE

#### MITRE ATT&amp;CK

完整 ATT&amp;CK Matrix Visualization，涵蓋全部 Tactic 與 637 項 Technique。可依 Tasks、Tasks/PT、Commands、Tags 篩選 — Cell 會即時亮起以顯示 Technique 執行覆蓋率。

<p align="center">
  <img src="docs/screenshots/mitre.png" alt="MITRE ATT&CK" width="100%">
</p>

### 9 · Admin &amp; Customization

#### Users

Operator 管理：建立、編輯、停用、改密碼與切換 Admin 角色。

<p align="center">
  <img src="docs/screenshots/users.png" alt="Users" width="100%">
</p>

#### Reporting

從 Operation Data 出發的 Report Builder，支援 Analytics、Filter 與 Export 選項。

<p align="center">
  <img src="docs/screenshots/reporting.png" alt="Reporting" width="100%">
</p>

#### Browser Scripts

可編輯的 Browser Script 庫，含虛擬化 Table、可排序欄位、`tabs` 渲染與 Per-PT Scoping。

<p align="center">
  <img src="docs/screenshots/browser-scripts.png" alt="Browser Scripts" width="100%">
</p>

#### Tags

跨所有 Entity 的 Tag-based Organization 與 Filtering。

<p align="center">
  <img src="docs/screenshots/tags.png" alt="Tags" width="100%">
</p>

#### Settings

完整 Preferences Panel，涵蓋 Operator Preferences、Display Toggle、Timestamp Formatting、Task Interaction Mode、Browser Script Option、Audio／Music Library、Theme Palette、Sidebar Shortcut 排序等。

<p align="center">
  <img src="docs/screenshots/settings.png" alt="Settings" width="100%">
</p>

---

## 功能總覽

### Core Operations

| 功能 | 說明 |
|------|------|
| **Callbacks** | 即時 Callback Tracking，含 Health Indicator（alive／dead／streaming）、Bulk Operations、Grouping、最後 Checkin 標記與 Sleep／Jitter 編輯 |
| **Console** | 多分頁互動式 Command Tasking，支援語法高亮 Output Block、Split-view DB Output、Command History、autoScroll 切換、Drag-and-drop File Upload、Streaming 結果 |
| **Tasks** | 專屬 Single Task View，含完整 Host Tree、Parameter Inspector、Output Viewer 與 Task 切換 |
| **Payloads** | 多步驟 Create-Payload Wizard（OS &rarr; Type &rarr; Commands &rarr; C2 &rarr; Build）、Wrapper 流程、Payload Import／Export、從既有 Payload 重 Build、Browser Script `tabs` 輸出的最大數限制 |
| **Files** | Download／Upload 追蹤、Screenshot 縮圖瀏覽、Keylog 搜尋、Modal Drag-and-drop Upload、Artifact 整理 |
| **Credentials** | Vault，支援 Deduplication、Hash Management、Account Linking、多欄位搜尋 |
| **Search** | 跨 Tasks／Files／Credentials／Callbacks／Artifacts 的全域搜尋與進階過濾 |
| **Artifacts** | IoC／Artifact Viewer，可連回 Task 來源 |
| **Tags** | 跨所有 Entity 的 Tag-based Organization 與 Filtering |

### Visualization

| 功能 | 說明 |
|------|------|
| **Callback Graph** | ReactFlow 互動式 2D Graph，含 ELK 自動排版、Custom Node 建立、Edge 管理、PNG Export 與 Graph Config Panel |
| **3D Topology** | Three.js 3D Network Map，含 Orbit Control、CIDR Grouping、物理排版、Tunnel 圖層與右鍵 Context Menu |
| **Custom Nodes** | Operator 自訂的 Relay／Proxy Node，存在 Hasura `agentstorage`，每 5 秒在所有連線 Operator 間同步 |
| **MITRE ATT&amp;CK** | 完整 ATT&amp;CK Matrix，疊加 Tasks／Commands／Tags 以顯示 Technique 執行覆蓋率 |
| **Tunnel Map** | Cyberpunk Flow Diagram 顯示 Parent-child Tunnel 關係、Port Mapping 與即時狀態 |

### Advanced

| 功能 | 說明 |
|------|------|
| **Battle Mode** | Combat／Recon／Normal 模式切換，Combat 模式 2&times; Animation Speed，Recon 模式淡化非關鍵 Chrome |
| **Eventing** | Mythic Eventing 的視覺化 Workflow Builder — Event Group、Instance、Keyword Trigger、條件式步驟、即時事件串流 |
| **Quick Hack** | 一鍵紅隊工作流庫（recon／persistence／dumping／lateral），把指令串成 macro 批次下發給選取的 Callbacks |
| **Metasploit** | 原生 MSF-RPC Client，含 Launch Dashboard、Session 列表、Job 控制、儲存 Credential、可永續保存的 Execution History |
| **Operations** | Operation Lifecycle 管理，支援 Role-based Access 與每 Operation 的 OPSEC Command Blocklist |
| **Reporting** | 從 Operation Data 生成 Report 與 Analytics |
| **C2 Profiles** | Profile Configuration、Container File 列表／編輯、Start／Stop 控制 |
| **PayloadTypes** | 統一檢視所有已安裝的 Agent／Wrapper／Translator／Consuming Service／Custom Browser，含即時狀態、Build Parameter Inspector、Command Browser、Container File Editor，以及一鍵測試 Webhook／Logger 事件 |
| **Browser Scripts** | 可編輯的 Browser Script 庫，含虛擬化 Table、可排序欄位、`tabs` 渲染、Per-PT Scoping |
| **Audio System** | Global Music Player（IndexedDB 儲存）、每事件 SFX（Callback、Tunnel、Auth、Error）、單一 SFX 個別開關 |
| **Theme &amp; Palette** | Dark／Light Theme、可自訂 Accent 顏色、自訂背景圖、JetBrains Mono／Inter 字型 |

---

## Application Map

整個 UI 都掛在 `/new/...` 之下（可以與原版 `mythic_react` 並存）。Route 對照：

| Path | Page | 用途 |
|------|------|------|
| `/new/login` | `Login` | JWT 登入 + Server Status／SSL Indicator |
| `/new/invite` | `Invite` | Operator Invite 連結註冊 |
| `/new/dashboard` | `Dashboard` | 作戰總覽與活動 Feed |
| `/new/events` | `EventFeed` | 即時事件串流與 Alert Counter |
| `/new/callbacks` | `Callbacks` | 活躍 Callback 表格 + Graph View |
| `/new/callbacks/:displayId` | `Callbacks` | 聚焦特定 Callback（Deep Link） |
| `/new/console` | `ConsoleSelection` | Console 分頁選擇器 |
| `/new/console/:id` | `Console` | 互動 Tasking Terminal |
| `/new/task` &middot; `/new/task/:displayId` | `SingleTaskView` | 單一 Task 深度檢視 |
| `/new/payloads` | `Payloads` | Payload 列表 + 分頁（list／create／wrapper） |
| `/new/create-payload/*` | `CreatePayload` | 多步驟 Build Wizard |
| `/new/create-wrapper` | （Redirect） | &rarr; `/payloads?tab=wrapper` |
| `/new/credentials` | `Credentials` | Credential Vault |
| `/new/files` | `Files` | File Manager + Screenshots |
| `/new/c2-profiles` | `C2Profiles` | C2 Profile 管理 |
| `/new/payload-types` | `PayloadTypes` | 所有已安裝的 Agent／Service |
| `/new/tunnels` | `Tunnels` | SOCKS／RPORTFWD Topology |
| `/new/topology` | `Topology3D` | 3D Network Map |
| `/new/quickhacks` | `QuickHacks` | 一鍵工作流庫 |
| `/new/metasploit` | `Metasploit` | MSF-RPC Dashboard／Attack／History |
| `/new/eventing` | `Eventing` | Workflow／Event Group Builder |
| `/new/mitre` | `MitreAttack` | ATT&amp;CK Matrix |
| `/new/search` | `Search` | 全域搜尋 |
| `/new/artifacts` | `Artifacts` | Artifact Viewer |
| `/new/reporting` | `Reporting` | Report Builder |
| `/new/operations` | `Operations` | Operation Lifecycle + OPSEC Blocklist |
| `/new/users` | `Users` | Operator 管理 |
| `/new/browser-scripts` | `BrowserScripts` | Custom Browser Scripts |
| `/new/tags` | `Tags` | Tag 管理 |
| `/new/opsec` | `Opsec` | Operation OPSEC Control |
| `/new/settings` | `Settings` | 全部 Operator Preferences |

> Sidebar 項目可以透過 **Settings &rarr; Sidebar Shortcuts** 個別重排或隱藏。預設清單還包含外部連結 `/new/jupyter`、`/new/graphql`，會分別開啟 Mythic 的 Jupyter Notebook 與 Hasura Console。

---

## Tech Stack

| 類別 | 技術 |
|------|------|
| **Frontend** | React 19、TypeScript 5.9+、React Router 7 |
| **Styling** | Tailwind CSS 3.4、Material-UI 7、Emotion、Framer Motion |
| **State** | Zustand 5（Persisted App Store）、Apollo Client 4（GraphQL + Cache + Reactive Variables） |
| **Real-time** | GraphQL Subscriptions over WebSocket（`graphql-ws`） |
| **3D** | Three.js 0.183、`@react-three/fiber`、`@react-three/drei` |
| **Graph** | `@xyflow/react` 12.6 + `elkjs` 0.11 階層自動排版 |
| **Charts** | MUI X Charts、MUI X Data Grid |
| **Editor** | React Ace（Code Editor／Eventing Workflow 語法高亮） |
| **資料 / 儲存** | IndexedDB（`musicDB`、Custom Graph Node 快取）、`sql.js` 本地 SQLite、Hasura `agentstorage` 共享狀態 |
| **動畫** | Framer Motion（Transition、Modal）、CSS Animation（Scan Line、Glitch） |
| **Build** | React App Rewired 2.2、Webpack 5、PostCSS、`config-overrides.js` |
| **Deploy** | Docker、Nginx（SSL + Reverse Proxy + WS Upgrade） |
| **External** | MSF-RPC（Metasploit Framework）JSON-RPC over HTTP |

---

## Quick Start（Production）

<p align="center">
  <img src="docs/screenshots/dashboard.png" alt="Production target" width="100%">
</p>

### 前置需求

- [Docker](https://docs.docker.com/get-docker/) 與 Docker Compose
- 一個從 Host 可連到的 [Mythic C2](https://github.com/its-a-feature/Mythic) Instance（預設：`https://host.docker.internal:7443`）
- Host 上的 **443** 連接埠可使用

### 獨立 Container

```bash
git clone https://github.com/redmeow-tw/Minerva.git
cd Minerva

# Build 靜態 React Bundle + Nginx Image，然後啟動
docker compose build
docker compose up -d
```

開啟 **https://&lt;your-host&gt;/** — 會自動重導向到 `/new/login`，使用你的 Mythic 帳密登入。

連到遠端 Mythic：

```bash
MYTHIC_ADDRESS=https://10.0.0.5:7443 docker compose up -d
```

停止：

```bash
docker compose down
```

> 預設的 `docker-compose.yml` 只暴露 Minerva（Port 443）。`MYTHIC_ADDRESS` 會被以 Template 變數的形式傳給 Nginx，用於 `/graphql`、`/auth`、`/refresh`、`/invite`、`/direct` 的 Upstream。

### 取代 `mythic_react`（推薦的 Operator 部署）

如果你希望 Minerva 直接*變成* Mythic 的 Web UI（隨 `./mythic-cli` 一起啟停），請使用內附的 Setup Script：

```bash
# 從 /opt/Minerva 執行
./scripts/minerva_install.sh         # 完整安裝（backup + copy + build + patch）
./scripts/minerva_install.sh verify  # 驗證安裝
./scripts/minerva_install.sh status  # Container 狀態與 Log
./scripts/minerva_install.sh fix     # 重新同步 src 並重 Build
./scripts/minerva_install.sh clean   # 從 DB 清除 Custom Graph Nodes
./scripts/minerva_install.sh uninstall  # 還原原本的 MythicReactUI

# Metasploit：
./scripts/minerva_install.sh msf-start    # 啟動 MSF-RPC Container
./scripts/minerva_install.sh msf-stop     # 停止 MSF-RPC Container
./scripts/minerva_install.sh msf-status   # 狀態 + Log
./scripts/minerva_install.sh msf-verify   # 用 Python 驗證連線
```

此 Script 會：

1. 備份原本的 `MythicReactUI` 到 `MythicReactUI.bak`。
2. 把 Minerva 的 `src/`、Config、`Dockerfile`、`package*.json` 複製進 `MythicReactUI`。
3. 執行 `mythic_change.sh` 修補 Mythic 的 Go 原始碼（見下節）。
4. 設定 Hasura `agentstorage` Table，讓 Custom Graph Node 可以跨 Operator 同步。
5. 重 Build `mythic_react` Container。

如果 Mythic 不在 `/opt/Mythic`，請設 `MYTHIC_DIR` 環境變數。

---

## Development Mode（Hot Reload）

### Architecture

Dev 模式使用兩個 Container：

| Container | Role | 說明 |
|-----------|------|------|
| `minerva-dev` | React Dev Server | 在 Port 3000 跑 `react-app-rewired start`，支援 HMR。Source Code 以 Volume 掛載，任何修改都會立即觸發 Browser Refresh。 |
| `minerva`     | Nginx SSL Proxy  | 監聽 **443**（Self-signed SSL）。把 `/new/` Proxy 到 Dev Server、`/ws` 用於 HMR WebSocket、`/graphql/`、`/auth`、`/refresh`、`/invite`、`/msf-rpc/`、`/direct/` Proxy 到 Mythic。 |

```
Browser :443 ── Nginx (SSL) ── minerva-dev :3000   (React Dev Server + HMR)
                       ├──  Mythic :7443           (API / GraphQL / WebSocket)
                       └──  Metasploit :55553      (選用 MSF-RPC)
```

### Quick Start

```bash
docker compose -f docker-compose.dev.yml up -d --build
docker logs -f minerva-dev   # 等到 "webpack compiled"
```

開啟 **https://&lt;your-host&gt;/** — `src/` 或 `public/` 下任何檔案變更都會在 1 秒內 Hot Reload。

### Mounted Volumes

| Host Path | Container Path | 用途 |
|-----------|----------------|------|
| `./src/` | `/app/src/` | React Source（Hot Reload） |
| `./public/` | `/app/public/` | 靜態資源 |
| `./tailwind.config.js` | `/app/tailwind.config.js` | Tailwind Theme |
| `./postcss.config.js` | `/app/postcss.config.js` | PostCSS |
| `./config-overrides.js` | `/app/config-overrides.js` | Webpack Overrides |
| `./tsconfig.json` | `/app/tsconfig.json` | TypeScript 設定 |
| `./.env` | `/app/.env` | Build-time 環境變數 |

> `node_modules/` 與 `package.json` **未**掛載 — 它們存在 Image 內。新增／移除 npm Package 後需要 `docker compose -f docker-compose.dev.yml up -d --build` 重新 Build。

### 連到遠端 Mythic

```bash
MYTHIC_ADDRESS=https://10.0.0.5:7443 \
docker compose -f docker-compose.dev.yml up -d --build
```

### 切換 Development 與 Production

```bash
# Dev (HMR) → Production (Static Build)
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

Minerva 內建一個一級 Metasploit Page，後端由一個 MSF-RPC Daemon Container 提供。

### Stack

```
React (Metasploit Page)
   └── /msf-rpc/  (nginx proxy_pass)
         └── minerva_msf :55553  (msfrpcd --user msf --pass minerva_msf -S -a 0.0.0.0)
```

### 啟動 MSF-RPC

```bash
# 方法 A：透過 minerva_install.sh 包裝
./scripts/minerva_install.sh msf-start
./scripts/minerva_install.sh msf-verify   # 透過 msfrpc_verify.py 做 Python 驗證

# 方法 B：直接用 compose
docker compose -f docker-compose.metasploit.yml up -d
```

覆寫帳密 / Port：

```bash
MSFRPC_USER=msf MSFRPC_PASS=changeme MSFRPC_PORT=55553 \
docker compose -f docker-compose.metasploit.yml up -d
```

### 頁面分頁

| 分頁 | 用途 |
|------|------|
| **Dashboard** | 連線狀態、Host 統計、Session 計數、最近 Job |
| **Attack** | Module Browser、參數表單、選擇 Target／Payload 後 Launch、儲存 Credential、Dry-run Preview |
| **Operations** | 活躍 Session、Job 與 Route — Kill Session、Stop Job、Hop／Portfwd |
| **History** | 永久（IndexedDB）保存所有 Launch 過的攻擊及其完整輸出 |

MSF-RPC Client 位於 `src/Minerva/pages/Metasploit/msfrpc.ts`，頁面每 15 秒呼叫一次 `getFullStatus`，並 Lazy Load 每個分頁。

---

## Setup Script（`minerva_install.sh`）

把 Minerva 灌進 Mythic、管理選用的 MSF-RPC 服務、以及重設狀態的統一入口。

```
Usage: ./scripts/minerva_install.sh [command]

Commands:
  (none)      完整安裝（backup + copy + build + patches）
  verify      驗證安裝
  fix         重新同步 src 並重 Build mythic_react
  status      顯示 Container 狀態與 Log
  clean       清除資料庫中的 Custom Graph Node
  uninstall   還原原本的 MythicReactUI

Metasploit:
  msf-start   部署並啟動 Metasploit RPC Container
  msf-stop    停止 Metasploit RPC Container
  msf-status  顯示 MSF Container 狀態與 Log
  msf-verify  用 Python 驗證 MSF-RPC 連線

  help        顯示此說明

Environment:
  MYTHIC_DIR  Mythic 路徑（預設：/opt/Mythic）
```

此 Script 為 Idempotent — 重複跑 `install` 是安全的，已完成的步驟會被跳過。

---

## Mythic 原始碼修補（`mythic_change.sh`）

Minerva 的幾個功能（例如 Array 型 Build Parameter、Payload 重 Import）需要對 Mythic 本體做修補。`scripts/mythic_change.sh` 會以確定性的方式套用這些 Patch：

| 修補的檔案 | 不修補的症狀 | Fix |
|-----------|------------|-----|
| `mythic-docker/src/rabbitmq/utils.go` &middot; `GetFinalStringForDatabaseInstanceValueFromUserSuppliedValue` — ARRAY case | 在 re-import／rebuild 含 Array 型參數的 Payload 時出現 `bad type for *_PARAMETER_TYPE_ARRAY: string`，因為 JSON-encoded String 沒被處理 | 新增 `case string:`，驗證是合法的 JSON Array 後回傳 |
| `mythic-docker/src/rabbitmq/utils.go` &middot; `getSyncToDatabaseValueForDefaultValue` — ARRAY case | 當 C2 Profile／Payload Type 送來 JSON-encoded Array 預設值時，Agent Sync 會出現一樣的錯 | 同樣加上 `case string:` handler |

此 Script 會被 `minerva_install.sh` 自動呼叫，也可以單獨執行：

```bash
MYTHIC_DIR=/opt/Mythic ./scripts/mythic_change.sh
```

重複執行是安全的。

---

## Project Structure

```
Minerva/
├── docker-compose.yml              # Production（單一 nginx container）
├── docker-compose.dev.yml          # Development（nginx + dev server）
├── docker-compose.metasploit.yml   # 選用 MSF-RPC Daemon
├── docker/
│   ├── Dockerfile.prod             # Build 靜態 React + Nginx
│   ├── Dockerfile.dev              # Node Dev Server + HMR
│   ├── Dockerfile.nginx            # Nginx（dev compose 使用）
│   └── Dockerfile                  # 灌進 Mythic 時使用（mythic_react）
├── nginx/
│   ├── nginx.conf.template         # Prod Template（alias /new + proxy）
│   ├── nginx.dev.conf.template     # Dev Template（proxy 到 dev server + /ws）
│   └── docker-entrypoint.sh        # SSL 憑證產生 + envsubst
├── scripts/
│   ├── minerva_install.sh          # install / verify / fix / status / msf-*
│   ├── mythic_change.sh            # 修補 Mythic Go 原始碼（array params）
│   ├── configure-hasura-agentstorage.sh   # 啟用 agentstorage 供 graph 同步
│   ├── clear-custom-nodes.sh       # 從 DB 清除 Custom Graph Node
│   ├── clear-nodes.sql             # clear-custom-nodes 用的 SQL
│   ├── debug-custom-nodes.sh       # 從 Hasura 印出 Custom Node 狀態
│   ├── msfrpc_verify.py            # MSF-RPC 連線健康檢查
│   ├── take_screenshots.js         # README 截圖自動化（Puppeteer）
│   └── take_login_only.js          # 單次 Login 截圖
├── docs/                           # Banner + Screenshots
├── public/                         # 靜態資源（favicon、audio 等）
├── tailwind.config.js              # Theme Token（signal/void/ghost/machine + accent）
├── postcss.config.js
├── config-overrides.js             # Webpack Overrides
├── tsconfig.json
├── package.json
└── src/
    ├── index.js                    # React 根 + Apollo + WS Link
    ├── cache.js                    # Apollo Cache + Reactive Variables
    ├── themes/                     # MUI Theme Bridge
    ├── components/                 # 共用 Legacy 元件
    └── Minerva/
        ├── App.tsx                 # Router + 認證 bootstrap（route code-split）
        ├── store.ts                # Zustand App Store（Sidebar、Audio、Console Tabs）
        ├── index.css               # Tailwind base + CSS 變數 + cyber-scrollbar
        │
        ├── context/
        │   ├── BattleModeContext.tsx
        │   └── ThemeContext.tsx
        │
        ├── pages/                  # 所有 Route（Lazy Load）
        │   ├── Dashboard.tsx
        │   ├── Login.tsx · Invite.tsx
        │   ├── Callbacks/          (Graph + Table + Dialog + utils)
        │   ├── Console/            (Terminal + Context Menu + Parser)
        │   ├── ConsoleSelection.tsx
        │   ├── SingleTaskView/     (Host Tree、Task Detail、List)
        │   ├── Payloads/
        │   ├── CreatePayload/      (多步驟 Wizard)
        │   ├── CreateWrapper/
        │   ├── PayloadTypes/       (搜尋／排序／Agent Icon + Build Param + Command + File)
        │   │   ├── index.tsx
        │   │   ├── BuildParamsDialog.tsx
        │   │   ├── CommandsDialog.tsx
        │   │   └── ContainerFilesDialog.tsx
        │   ├── Files/              (FileTable、Screenshots、Modal)
        │   ├── Credentials.tsx
        │   ├── C2Profiles.tsx
        │   ├── Tunnels/ · TunnelMap.tsx
        │   ├── Topology3D/         (3D Scene + Tunnel Layer + Detail Panel)
        │   ├── QuickHacks.tsx
        │   ├── Metasploit/         (msfrpc、LaunchAttack、Operations、TaskBrowser、History)
        │   ├── Eventing/           (Workflow Builder、Trigger、Instance)
        │   ├── EventFeed.tsx
        │   ├── Operations/         (Lifecycle + OPSEC Blocklist)
        │   ├── Opsec.tsx
        │   ├── MitreAttack.tsx
        │   ├── BrowserScripts.tsx
        │   ├── Search/
        │   ├── Artifacts.tsx
        │   ├── Reporting.tsx
        │   ├── Tags.tsx
        │   ├── Users.tsx
        │   └── Settings/           (Audio、Palette、SidebarShortcuts、Rows)
        │
        ├── components/             # 可重用 UI
        │   ├── Layout.tsx           # 共用外殼（Sidebar + Outlet）
        │   ├── Sidebar.tsx
        │   ├── CallbackGraph/       # ReactFlow Graph + Node + Edge + Layout
        │   ├── FileBrowser/         # Callback／Server／Virtual File Tree
        │   ├── OutputRenderer/      # core、panels、parsed、graph 渲染器
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
        │   ├── api/                 # 依領域拆分的 GraphQL Query／Mutation／Subscription
        │   │   ├── index.ts          (re-export 全部)
        │   │   ├── payloadTypes.ts   (/payload-types 後端)
        │   │   ├── callbacks.ts · tasks.ts · files.ts · tunnels.ts · operations.ts …
        │   ├── auth.ts               # JWT 工具、Refresh 邏輯
        │   ├── state.ts              # Apollo Reactive Variables（meState、mePreferences）
        │   ├── snackbar.ts           # Toast 包裝
        │   ├── soundEffects.ts       # 每事件 SFX
        │   ├── musicDB.ts            # IndexedDB 音樂庫
        │   ├── customGraphNodeService.ts  # 共享 Graph Node（Hasura agentstorage）
        │   ├── useQueryCompat.ts     # Apollo 4 相容層
        │   └── utils.ts
        │
        ├── hooks/                   # useCopyToClipboard、useDebounce、useFromNow、usePagination
        ├── types/                   # 每個領域的 TS Interface
        └── constants/               # API endpoint、Color
```

---

## Architecture

### Apollo Client + Reactive Variables

- **GraphQL** 是除了 Metasploit RPC 以外的唯一資料管道。Query／Mutation 依領域拆在 `lib/api/*.ts`。
- **Subscription** 走相同的 `wss://&lt;host&gt;/graphql/` 端點，使用 `graphql-ws`。Callbacks、EventFeed、Payloads、PayloadTypes、Tunnels、Console 等頁面都靠 Subscription 做即時更新。
- **Reactive Variables**（`meState`、`mePreferences`）把已認證使用者狀態與偏好覆寫暴露給任何元件。

### Routing &amp; Code-splitting

- 每個 Route 在 `App.tsx` 中都用 `React.lazy` Import，初始 Bundle 很小；訪問該 Route 才會串入它的 Chunk。
- 所有已認證 Route 共用一個 `<Layout />`，所以 Sidebar、Audio Player、Event Notification、Battle Mode 外殼在切換 Route 時不會被重新 Mount。

### State

- **Zustand Store**（`store.ts`，Persist 到 localStorage）保存：Sidebar 收合、Console Tabs、Alert Count、音訊（音樂庫、音量、每 SFX 開關）、通知偏好。
- **Apollo Cache** 保存 GraphQL 實體。
- **IndexedDB** 儲存二進位音樂檔與本地 Custom Graph Node 快取。

### 即時 Custom Graph Nodes

Custom Graph Nodes 存在 Hasura 的 `agentstorage` Table，因此每位 Operator 看到的 Topology 是一致的。`customGraphNodeService.ts` 負責序列化、每 5 秒同步、容忍衝突的合併與 `DEBUG_GRAPH` Log。安裝時 `configure-hasura-agentstorage.sh` 會設定相關 Hasura 權限。

---

## Routing &amp; Sidebar

Sidebar（見 `components/Sidebar.tsx`）會列出所有頁面。Operator 可透過 **Settings &rarr; Sidebar Shortcuts** 重排或隱藏項目。

預設的 Key 清單（給 `getMythicSetting('sideShortcuts')` 使用）：

```
dashboard · events · callbacks · console · task · payloads · credentials · files
c2-profiles · tunnels · quickhacks · users · search · topology · metasploit · settings
opsec · operations · artifacts · mitre · reporting · tags · browser-scripts · eventing
payload-types · jupyter · graphql
```

`jupyter` 與 `graphql` 是*外部*連結，會分別開啟 Mythic 的 Jupyter Notebook 與 Hasura Console。

---

## Nginx Proxy Layout

Nginx（Port 443，Self-signed SSL）是唯一進入點，負責 SSL Termination 並把流量分派到 Mythic 或 Metasploit。

| Location | Upstream | 備註 |
|----------|----------|------|
| `/` | 重導向 `/new/login` | |
| `/new/` | 靜態 Bundle（prod）**或** `minerva-dev:3000`（dev） | Dev 同時支援 Hot Reload + WS Upgrade |
| `/ws` | `minerva-dev:3000/ws`（僅 dev） | webpack HMR socket |
| `/graphql/` | `${MYTHIC_ADDRESS}/graphql/` | HTTP + WS Upgrade，86400 秒 read timeout |
| `/auth` | `${MYTHIC_ADDRESS}/auth` | JWT 取得 |
| `/invite` | `${MYTHIC_ADDRESS}/invite` | Operator Invite 註冊 |
| `/refresh` | `${MYTHIC_ADDRESS}/refresh` | JWT Refresh |
| `/direct/` | `${MYTHIC_ADDRESS}/direct/` | 檔案下載 |
| `/msf-rpc/` | `minerva_msf:55553` | MSF-RPC JSON-RPC（選用） |

Buffer 與 Body 都針對大 JWT（16k）與 50 MB 上傳調過。

---

## Theme System

<p align="center">
  <img src="docs/screenshots/settings.png" alt="Settings &amp; Theme Palette" width="100%">
</p>

Minerva 用 CSS Custom Properties 做 Theme，所以切換 Theme 不需要重 Compile。Base Palette 定義在 `index.css`：

```css
/* Dark Theme（預設） */
:root {
  --color-signal:  255 255 255  /* 文字 & 強調           */
  --color-accent:   34 197  94  /* 綠色 Accent           */
  --color-void:      0   0   0  /* 背景                  */
  --color-ghost:   153 153 153  /* Border & 次要         */
  --color-machine:  51  51  51  /* Card 背景             */
}

/* Light Theme */
:root.minerva-light {
  --color-signal:   30  30  40
  --color-accent:   22 163  74
  --color-void:    240 240 245
  --color-ghost:    90  90 100
  --color-machine: 225 225 230
}
```

字型：**JetBrains Mono**（Monospace）與 **Inter**（Sans-serif）。

Operator 也可以透過 **Settings &rarr; Palette** 設定自訂背景圖與各元件輸出顏色。

---

## Battle Mode

<p align="center">
  <img src="docs/screenshots/callbacks.png" alt="Battle Mode 套用於 Callbacks 頁" width="100%">
</p>

`context/BattleModeContext.tsx` 提供三種作戰模式：

- **NORMAL** — 預設；完整 UI 與動畫預算。
- **RECON** — 淡化非關鍵 Chrome、優先可讀性。
- **COMBAT** — 戰術 UI：2&times; 動畫速度、Accent 轉成警示紅、Ambient SFX 音量提高。

可從 Sidebar 的 Combat／Recon 圖示切換。模式會被 Persist 到 Zustand Store。

---

## Audio System

<p align="center">
  <img src="docs/screenshots/settings.png" alt="Audio Settings" width="100%">
</p>

兩層音訊：

1. **Global Music Player** — Operator 自己上傳的曲目，存在 IndexedDB（`musicDB`）。播放會跨 Navigation 持續，也會在頁面 Reload 後透過 `useAppStore` 狀態（`musicPlaying`、`musicTrackId`）恢復。
2. **Sound Effects** — 每事件（新 Callback、Tunnel、Auth Alert、按鍵點擊等）對應的 SFX。每個 SFX 都可以在 **Settings &rarr; Audio** 個別開關。

所有音訊都會尊重全域的 `sfxEnabled` / `musicEnabled` 旗標。

---

## Custom Graph Nodes

<p align="center">
  <img src="docs/screenshots/callbacks.png" alt="Custom Nodes 在 Callbacks Graph 中" width="100%">
</p>

Custom Node 用來模擬 Mythic 原生不認識的 Relay／Proxy 基礎設施。它們存在 Hasura 的 `agentstorage` Table，所以所有 Operator 看到的 Topology 是一致的。

| 操作 | 方法 |
|------|------|
| 建立 Node | 在 **Callbacks &rarr; Graph View** 右鍵點空白處 &rarr; *Create Custom Node* |
| 連接 Nodes | 右鍵點 Node &rarr; *Set Parent* |
| 編輯／刪除 | 右鍵點 Node &rarr; *Edit* / *Delete* |
| 全部清掉 | `./scripts/clear-custom-nodes.sh` |

每個 Node 都會儲存 Hostname、IP、OS、Architecture、C2 Profile 選擇、座標與顏色。座標跨 Session 持久化；資料每 5 秒在已連線的 Operator 間同步。需要詳盡 Log 時可在 `CallbackGraph/index.tsx` 把 `DEBUG_GRAPH` 設為 `true`。

---

## Authentication &amp; Sessions

<p align="center">
  <img src="docs/screenshots/login.png" alt="Authentication" width="100%">
</p>

- 基於 JWT 的 Authentication（Access + Refresh Token），透過 `/auth`、`/refresh`。
- 4 小時 JWT 壽命，背景自動 Refresh。
- Refresh 時會重新 Auth WebSocket，GraphQL Subscription 不會中斷。
- Session 過期偵測 — 剩 30 分鐘時跳出 Toast 警告，過期時強制 Logout。
- 所有掛在 `<Layout />` 下的 Route 都需要有效 `meState`；匿名使用者會被導向 `/login`。

---

## Environment Variables

| 變數 | 預設 | 用途 |
|------|------|------|
| `MYTHIC_ADDRESS` | `https://host.docker.internal:7443` | Nginx 上游，所有 Mythic API 都走它 |
| `MSFRPC_USER` | `msf` | MSF-RPC 帳號（`docker-compose.metasploit.yml`） |
| `MSFRPC_PASS` | `minerva_msf` | MSF-RPC 密碼 |
| `MSFRPC_PORT` | `55553` | `minerva_msf` 對外的 Port |
| `MYTHIC_DIR` | `/opt/Mythic` | `minerva_install.sh` 與 `mythic_change.sh` 使用 |
| `CHOKIDAR_USEPOLLING` | `true`（dev） | 強制 Docker 內走 File Polling 給 HMR 使用 |
| `WDS_SOCKET_PATH` | `ws`（dev） | HMR Socket 路徑（走 Nginx） |
| `WDS_SOCKET_PORT` | `443`（dev） | HMR Socket Port（走 Nginx） |

---

## Troubleshooting

| 問題 | 解決方案 |
|------|----------|
| CSS 未載入 | 確認 `tailwind.config.js`、`postcss.config.js` 已掛載（dev）或複製（prod），用 `--build` 重啟。 |
| Hot Reload 無作用 | 看 `docker logs minerva-dev`。Dev 一定要 `CHOKIDAR_USEPOLLING=true`。 |
| 編輯後 `MODULE_NOT_FOUND` | 檢查 `docker-compose.dev.yml` 的 Volume 掛載。 |
| 找不到新 npm Package | 重 Build：`docker compose -f docker-compose.dev.yml up -d --build` |
| 瀏覽器 SSL Warning | 正常 — Self-signed 憑證。信任此憑證或接受警告即可。 |
| Payload Build／Import 出現 `bad type for *_PARAMETER_TYPE_ARRAY: string` | 跑 `./scripts/mythic_change.sh` 後重 Build `mythic_server`。 |
| Graph Node 沒同步 | 跑 `./scripts/minerva_install.sh fix` — 會驗證 Hasura `agentstorage` Table。 |
| Graph Node 資料亂掉 | `./scripts/clear-custom-nodes.sh` 全部清掉重來。 |
| Metasploit 頁顯示 offline | `./scripts/minerva_install.sh msf-status` 與 `msf-verify`，並檢查 Settings 中的 `MSFRPC_USER`／`PASS` 是否跟 `msfrpcd` 啟動參數一致。 |
| Sidebar 項目消失 | Settings &rarr; Sidebar Shortcuts — 儲存的順序可能已隱藏新加的項目。重置為預設值即可。 |
| JWT 過期 Toast 一直出現 | 瀏覽器時鐘可能偏移；同步系統時間並清掉 localStorage。 |

---

## License

本專案採用 Dual License：

- **Open Source** — [AGPL-3.0](./LICENSE)
  你可以在 AGPL-3.0 條款下使用、修改與散布本軟體。任何 Derivative Work 或使用本軟體的 Service 也必須以 AGPL-3.0 釋出。

- **Commercial License** — 若想在 Proprietary／Closed-source Product 或 Service 中使用而不受 AGPL 約束，可洽商業授權。聯絡：**aifred0729tw@gmail.com**
