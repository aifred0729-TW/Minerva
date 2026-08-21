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

## 目錄

- [概述](#概述)
- [Screenshots](#screenshots)
  - [★ 3D Cyber-Topology](#topology3d)
- [功能總覽](#功能總覽)
- [Application Map](#application-map)
- [Tech Stack](#tech-stack)
- [Quick Start（Production）](#quick-startproduction)
- [Development Mode（Hot Reload）](#development-modehot-reload)
- [桌面應用程式（Windows / macOS）](#桌面應用程式windows--macos)
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

**Minerva** 是一款為 [Mythic C2 Framework](https://github.com/its-a-feature/Mythic) 打造的現代化 Cyberpunk 風 Web 介面。它以**獨立 Stack** 的形式與 Mythic 並存 —— 是 Mythic 內建 `MythicReactUI` 之外的另一個前端，而不是把它換掉。設計目標是給長時間執行紅隊任務、需要高資訊密度與低操作摩擦的 Operator 使用。

相較於原版 Mythic UI，Minerva 提供：

- **3D Cyber-Topology** —— 旗艦視圖。用 Three.js 把整場 Engagement 畫成一張活的地圖：Subnet 是半透明體積、C2 與 P2P 連線分色呈現，每個節點還能就地開出 **QUICKHACK** 與 **DOSSIER** 面板，全程不離開場景。詳見[下方導覽](#topology3d)。
- **Real-time Collaborative Graph** —— ReactFlow 驅動的 Callback Topology，支援多 Operator 共享的 Custom Node（描述 Relay／Proxy 等 Mythic 原生不認識的基礎設施），透過 Hasura 每 5 秒同步。
- **Rich Interactive Console** —— 多分頁 Terminal，含結構化 Output Block、Mimikatz Parsing、Process List 渲染、File Browser 疊加、拖放上傳，以及內嵌的 Tasking 表單。
- **Quick Hack 工作流** —— 一鍵套用的紅隊工作流模板（recon／persistence／dumping／lateral movement），將指令串成 macro 對選取的 Callbacks 批次下發。
- **原生 Metasploit 整合** —— 內建 MSF-RPC Client，包含 Launch Dashboard、Session 生命週期管理、可永續保存的 Execution History、以及即時 Task Browser Output 解析。
- **MITRE ATT&amp;CK Matrix** —— 完整 T-id 矩陣，疊加 Task／Command／Tag 資料，讓 Operator 即時看到 Technique 覆蓋率。
- **Eventing 工作流** —— 視覺化 Eventing Instance Builder，含 Keyword Trigger 與條件式步驟。
- **Battle Mode** —— 戰術 UI 模式（Combat／Recon／Normal），即時調整 Density、Animation Speed 與 Ambient SFX 的強度。
- **Theming &amp; Audio** —— CSS 變數驅動的 Dark／Light Theme、可自訂背景圖、JetBrains Mono／Inter 字型、IndexedDB 儲存的音樂庫、每事件對應的 SFX。

### 部署方式

Minerva 跑在**自己的 Docker Stack，與 Mythic 完全分離** —— 不會被複製進 Mythic 的 `MythicReactUI` 目錄，也不會被打包進 `mythic_react` 容器。`scripts/minerva_install.sh`（或 `docker compose up -d`）會拉起兩個容器：`minerva-dev`（用 `react-app-rewired` 提供 React App，與 Mythic 自己提供 UI 的方式相同），前面擋著 `minerva` Nginx 容器，在 **443** 終結 TLS，並把 `/graphql`、`/auth`、`/refresh`、`/msf-rpc`、`/direct` 透過 `host.docker.internal` 反向代理到既有的 Mythic Instance。首次啟動自動簽發自簽憑證，Mythic 原本的 UI 不受影響。

`minerva_install.sh` 也會做 vanilla Mythic 需要的一次性後端準備：設定 `.env`、套用必要的 Go patch（`mythic_change.sh`）、設定 Hasura。這些**只動 Mythic 的後端**，Minerva 本身始終留在自己的容器裡。

> **跨容器連通性（`.env`）：** `minerva` 容器不在 Mythic 的 docker network 上，是透過 host gateway（`host.docker.internal`）連過去的。因此 Mythic 必須把 port 綁在所有介面而不只是 loopback —— `.env` 裡的 `NGINX_BIND_LOCALHOST_ONLY`（port 7443）與 `MYTHIC_SERVER_DYNAMIC_PORTS_BIND_LOCALHOST_ONLY`（C2 ports 7000-7010）**必須是 `"false"`**。`minerva_install.sh` 會自動且冪等地設好；若手動安裝請自行設定並執行 `./mythic-cli start` 重新綁定。保持 `"true"` 是全新安裝失敗（connection refused）最常見的原因。

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

Central Command 概覽 —— Active Callbacks、Total Payloads、C2 Infrastructure 狀態、含 T- / T-0 / T+ 任務時間軸的 Operation 詳情、Command Statistics、Asset Collection Metrics、Top Commands 與 Recent Activity Feed。面板配置是一棵不限層數的 Split Tree：任何面板都能再水平或垂直切開，配置會依 Operator 保存。

<p align="center">
  <img src="docs/screenshots/dashboard.png" alt="Dashboard" width="100%">
</p>

<a id="topology3d"></a>

#### 3D Cyber-Topology &nbsp;·&nbsp; ★ 旗艦功能

> **Minerva 就是繞著這個視圖蓋起來的。** Dashboard 用數字統計的東西，Topology 直接畫在該在的位置上 —— 你拿下了哪些主機、流量實際怎麼繞過去、下一跳前面還擋著什麼。

完整的 Three.js 場景，可自由 Orbit。機器由物理排版擺位，並依 **Network Space** 分組 —— 每個 CIDR 一個半透明體積，標上網段與節點數。連線型態靠顏色區分，不用猜：青色是直連 **C2**，洋紅是 **P2P** Relay 鏈，每條邊標註其傳輸方式（`http`、`tcp`）。Tunnel 圖層則把進行中的 SOCKS／RPORTFWD 鏈疊在同一張圖上。

節點顏色即狀態：**CORE**（Minerva Server 自己）、**ALIVE**、**HIGH PRIV**、**DEAD**，以及 Operator 自訂的 **CUSTOM** Relay 節點。底部狀態列即時統計機器、Callback、存活／死亡 Session、Custom Node、邊與網段數量。Network Space 可以依 CIDR 隱藏，把場景縮到你正在打的網段；隱藏清單會跨重新整理保存，並可從場景選單的 **HIDDEN SPACES** 群組還原。

<p align="center">
  <img src="docs/screenshots/topology3d.png" alt="3D Cyber-Topology" width="100%">
</p>

在節點上按右鍵會開出它的動作選單 —— 每一列都是有框的控制項，狀態由右側的 chip 承載（`LOCKED`、`ON`、`ARMED`），破壞性的列會先進入待發（arm）狀態才會真的執行。其中兩列會**接管畫面但不離開場景**，也就是下面這張圖捕捉到的畫面：

- **QUICKHACK** —— 攻擊面板就停在節點旁邊（`HARVEST`、`RPFWD`、`SOCKS`、`DISCONNECT`、`AMPLIFICATION`）。目標 Agent 跑不了的 hack 會變灰並標記 `N/A`；其餘則標示它需要幾個參數（`1 VAR`、`3 VARS`）才能發動。footer 追蹤目前 arm 住的目標。
- **VIEW DETAILS** —— 節點檔案（Dossier）。左邊是這台機器的紀錄：Identity、Platform、Network、Link，以 `//SECTION` 標頭分組；右邊是 **DEFENCE MATRIX**，列出這台主機上的所有 Session，以及決定「這台能不能動手」的三個狀態：**防毒／EDR**、**防火牆**、**權限**。防毒與防火牆是 Operator 自己標記的（Mythic 兩者都不回報），會依主機保存在 Operator 的 Preferences；權限則由 Session 即時推導，並依平台顯示 —— Linux／macOS 是 `ROOT`，Windows 是 `SYSTEM`／`ADMIN`。

兩個面板都是 docked 而非 modal：背後的 Topology 持續更新，除非按 `ESC` 或 **EXIT INTERFACE**，否則不會關閉。

<p align="center">
  <img src="docs/screenshots/topology3d-details.png" alt="QUICKHACK 面板、節點檔案與 Defence Matrix 疊在活場景上" width="100%">
</p>

#### Event Feed

即時事件串流與 Alert Counter。連動 Sidebar 的通知鈴鐺，並把新的 Callback、Alert、Custom Event、Feedback、Startup 事件即時呈現。

<p align="center">
  <img src="docs/screenshots/events.png" alt="Event Feed" width="100%">
</p>

#### Operations Manager

Operation 生命週期管理，含狀態追蹤（Active／Complete／Deleted）、Operator 指派，以及每個 Operation 專屬的 OPSEC Command Blocklist。

<p align="center">
  <img src="docs/screenshots/operations.png" alt="Operations Manager" width="100%">
</p>

#### OPSEC

Operation 層級的 OPSEC 控制 —— Command Blocklist、角色權限閘門，以及下 Task 當下的即時攔截。

<p align="center">
  <img src="docs/screenshots/opsec.png" alt="OPSEC" width="100%">
</p>

### 3 · Callbacks &amp; Tasking

#### Active Callbacks

ReactFlow Graph View，顯示 Minerva Core Node 與各 Active Agent 的連線關係，並用共享的 Custom Node 描述 Relay／Proxy 基礎設施。下方的可排序資料表支援批次操作、Sleep／Jitter 編輯、分組，以及 Last-Checkin Badge。

<p align="center">
  <img src="docs/screenshots/callbacks.png" alt="Active Callbacks" width="100%">
</p>

#### Console Selection

多 Callback Interactive Console 的分頁選擇器，列出所有曾開啟的分頁，讓 Operator 在不同 Callback 之間切換而不遺失情境。

<p align="center">
  <img src="docs/screenshots/console-selection.png" alt="Console Selection" width="100%">
</p>

#### Interactive Console

具結構化 Output Block 的指令 Tasking 介面 —— Mimikatz 解析、Process List、File Browser 疊加、內嵌 Tasking 表單、拖放上傳，以及即時串流的 Task Block。

<p align="center">
  <img src="docs/screenshots/console.png" alt="Interactive Console" width="100%">
</p>

#### Tasks

單一 Task 的深入檢視：完整 Host Tree、Parameter Inspector、結構化 Output Viewer，以及上一筆／下一筆 Task 導覽。

<p align="center">
  <img src="docs/screenshots/tasks.png" alt="Tasks" width="100%">
</p>

### 4 · Payloads

#### Payloads Overview

Payload 清單、多步驟 Create-Payload Wizard 與 Wrapper 流程的集散地。支援 Payload 設定的匯入／匯出，以及從既有 Payload 重新 Build。

<p align="center">
  <img src="docs/screenshots/payloads.png" alt="Payloads Overview" width="100%">
</p>

#### Create Payload Wizard

逐步 Build Pipeline：OS &rarr; Type &rarr; Commands &rarr; C2 &rarr; Build。每一步都保存狀態，Operator 可以往回調整而不遺失進度。

<p align="center">
  <img src="docs/screenshots/create-payload.png" alt="Create Payload" width="100%">
</p>

#### Payload Types

統一檢視所有已安裝的 Agent／Wrapper／Translator／Consuming Service／Custom Browser。工具列提供 **搜尋**、**排序（名稱／狀態／指令數）**、**僅顯示上線** 篩選與 **顯示已刪除** 開關。每張卡片包含 Agent SVG 圖示、容器狀態、Build Parameter Inspector、Command Browser、容器檔案編輯器，以及 Webhook／Logger 事件的一鍵測試。

<p align="center">
  <img src="docs/screenshots/payload-types.png" alt="Payload Types" width="100%">
</p>

### 5 · Infrastructure

#### C2 Profiles

C2 通訊 Profile 管理，列出所有已安裝的 Profile（discord、dns、github、http、https、tcp、websocket），含版本資訊、狀態指示、容器檔案列出／編輯與啟停控制。

<p align="center">
  <img src="docs/screenshots/c2profiles.png" alt="C2 Profiles" width="100%">
</p>

#### Tunnel Manager

Tunnel 管理，以視覺化流程圖呈現 Operator 端 Proxy、C2 Server Relay 與目標端 Endpoint，顯示 Tunnel 狀態、Port 對映與完整連線鏈。

<p align="center">
  <img src="docs/screenshots/tunnels.png" alt="Tunnel Manager" width="100%">
</p>

### 6 · Files, Credentials &amp; Intel

#### File Manager

集中式檔案管理，側欄依 Downloads、Uploads、Screenshots、Eventing Workflow Files 分類，並含目標機器的 File Browser Tree。

<p align="center">
  <img src="docs/screenshots/files.png" alt="File Manager" width="100%">
</p>

#### Credentials Vault

憑證儲存，支援多欄位搜尋（Account、Realm、Credential、Comment、Tag），追蹤已驗證與已收集的數量，並把每筆憑證連回其來源 Task。

<p align="center">
  <img src="docs/screenshots/credentials.png" alt="Credentials Vault" width="100%">
</p>

#### Artifacts

IoC／Artifact 檢視器，含 Task 連結與主機歸屬。

<p align="center">
  <img src="docs/screenshots/artifacts.png" alt="Artifacts" width="100%">
</p>

#### Search

跨實體全域搜尋，涵蓋 Task、File、Credential、Callback、Artifact，並提供進階篩選。每次查詢都限定在當前 Operation 範圍內。

<p align="center">
  <img src="docs/screenshots/search.png" alt="Global Search" width="100%">
</p>

### 7 · Automation &amp; Frameworks

#### Quick Hacks

一鍵紅隊工作流程庫（recon／persistence／dumping／lateral），把指令串接後對選取的 Callbacks 下發。工作流以 JSON 定義、Operator 可自行擴充，Topology 裡各節點的 **QUICKHACK** 面板也是由同一套函式庫驅動。

<p align="center">
  <img src="docs/screenshots/quickhacks.png" alt="Quick Hacks" width="100%">
</p>

#### Metasploit

原生 MSF-RPC Client。分頁涵蓋 **Dashboard**（Session／Job／Module）、**Launch Attack**（Module Browser + 參數表單）、**Operations**（即時 Session、Job、Route）、**Task History**（含完整輸出的永續執行紀錄）。

<p align="center">
  <img src="docs/screenshots/metasploit.png" alt="Metasploit" width="100%">
</p>

#### Eventing

Mythic Eventing 的視覺化工作流建構器 —— Event Group、Instance、Keyword Trigger、條件式步驟，以及符合條件事件的即時串流。

<p align="center">
  <img src="docs/screenshots/eventing.png" alt="Eventing" width="100%">
</p>

### 8 · Intel &amp; MITRE

#### MITRE ATT&amp;CK

完整 MITRE ATT&amp;CK 矩陣視覺化，涵蓋所有戰術分類共 637 個 Technique。可依 Tasks、Tasks/PT、Commands、Tags 篩選 —— 格子會亮起以顯示實際執行覆蓋率。

<p align="center">
  <img src="docs/screenshots/mitre.png" alt="MITRE ATT&CK" width="100%">
</p>

### 9 · Admin &amp; Customization

#### Users

Operator 管理：建立、編輯、停用、變更密碼、切換 Admin 角色。

<p align="center">
  <img src="docs/screenshots/users.png" alt="Users" width="100%">
</p>

#### Reporting

以 Operation 資料驅動的報告產生器，含分析、篩選與匯出選項。

<p align="center">
  <img src="docs/screenshots/reporting.png" alt="Reporting" width="100%">
</p>

#### Browser Scripts

可編輯的 Browser Script 函式庫，含虛擬化表格、可排序欄位、`tabs` 渲染，以及依 Payload Type 的作用域劃分。

<p align="center">
  <img src="docs/screenshots/browser-scripts.png" alt="Browser Scripts" width="100%">
</p>

#### Tags

跨所有實體的標籤化組織與篩選。

<p align="center">
  <img src="docs/screenshots/tags.png" alt="Tags" width="100%">
</p>

#### Settings

完整偏好設定面板，涵蓋 Operator Preferences、顯示開關、時間戳記格式、Task 互動模式、Browser Script 選項、音效／音樂庫、Theme Palette，以及 Sidebar 捷徑排序。

<p align="center">
  <img src="docs/screenshots/settings.png" alt="Settings" width="100%">
</p>

---

## 功能總覽

### Visualization

| 功能 | 說明 |
|------|------|
| **3D Topology** &nbsp;★ | Three.js 3D 網路地圖 —— Orbit Controls、CIDR Network Space 半透明體積（可隱藏、可保存）、物理排版、C2／P2P 分色邊、Tunnel 圖層、即時狀態列、節點右鍵選單、場景內 **QUICKHACK** 面板與 **節點 Dossier + DEFENCE MATRIX** |
| **Callback Graph** | ReactFlow 互動式 2D 圖，含 ELK 自動排版、Custom Node 建立、Edge 管理、PNG 匯出與 Graph Config 面板 |
| **Custom Nodes** | Operator 自訂的 Relay／Proxy 節點，存於 Hasura `agentstorage`，每 5 秒在所有連線 Operator 之間同步 |
| **MITRE ATT&amp;CK** | 完整 ATT&amp;CK 矩陣，含 Technique 對映、執行追蹤與 Task／Command／Tag 疊加 |
| **Tunnel Map** | Cyberpunk 風流程圖，呈現 Parent-Child Tunnel 關係、Port 對映與即時狀態 |

### Core Operations

| 功能 | 說明 |
|------|------|
| **Dashboard** | 含 T- / T-0 / T+ 任務時間軸的操作概覽，面板配置為不限層數的 Split Tree 並依 Operator 保存 |
| **Callbacks** | 即時 Callback 追蹤，含健康狀態（alive／dead／streaming）、批次操作、分組、Last-Checkin Badge 與 Sleep／Jitter 編輯 |
| **Console** | 多分頁互動式指令 Tasking，含語法高亮 Output Block、Split-View DB Output、指令歷史、autoScroll 開關、拖放上傳與串流 Task 結果 |
| **Tasks** | 專屬單一 Task 檢視，含完整 Host Tree、Parameter Inspector、Output Viewer 與逐筆導覽 |
| **Payloads** | 多步驟 Create-Payload Wizard（OS &rarr; Type &rarr; Commands &rarr; C2 &rarr; Build）、Wrapper 流程、Payload 匯入／匯出、從既有 Payload 重建，以及 Browser Script `tabs` 輸出的分頁上限保護 |
| **Files** | 下載／上傳追蹤、含縮圖牆的截圖檢視器、Keylog 搜尋、拖放式 Modal 上傳與 Artifact 組織 |
| **Credentials** | 憑證庫，含去重、Hash 管理、帳號關聯與多欄位搜尋 |
| **Search** | 跨 Task、File、Credential、Callback、Artifact 的全域搜尋 —— 限定在當前 Operation 範圍 |
| **Artifacts** | IoC／Artifact 檢視器，含 Task 連結 |
| **Tags** | 跨所有實體的標籤化組織與篩選 |

### Advanced

| 功能 | 說明 |
|------|------|
| **Battle Mode** | Combat／Recon／Normal 模式切換與戰術 UI 最佳化（Combat 動畫 2 倍速、Recon 淡化非關鍵資訊） |
| **Eventing** | Mythic Eventing 的視覺化工作流建構器 —— Event Group、Instance、Keyword Trigger、條件式步驟、符合條件事件的即時串流 |
| **Quick Hack** | 一鍵紅隊工作流程庫（recon／persistence／dumping／lateral），可對選取的 Callbacks 串接下發；同時驅動 Topology 各節點的攻擊面板 |
| **Metasploit** | 原生 MSF-RPC Client，含 Launch Dashboard、Session 清單、Job 控制、憑證保存與永續執行紀錄 |
| **Operations** | Operation 生命週期管理，含角色權限與各 Operation 專屬 OPSEC Command Blocklist |
| **Reporting** | 由 Operation 資料產生報告並提供分析 |
| **C2 Profiles** | Profile 設定、容器檔案列出／編輯與啟停控制 |
| **PayloadTypes** | 統一檢視所有已安裝的 Agent／Wrapper／Translator／Consuming Service／Custom Browser，含即時狀態、Build Parameter Inspector、Command Browser、容器檔案編輯器與 Webhook／Logger 事件一鍵測試 |
| **Browser Scripts** | 可編輯的 Browser Script 函式庫，含虛擬化表格、可排序欄位、`tabs` 渲染與依 PT 的作用域 |
| **Audio System** | 全域音樂播放器（IndexedDB 音樂庫）、每事件音效（Callback、Tunnel、Auth、Error）、可個別開關的 SFX |
| **Theme &amp; Palette** | Dark／Light Theme、可自訂 Accent 色、可自訂背景圖、JetBrains Mono／Inter 字型 |

---

## Application Map

整個 UI 掛載在 `/new/...` 底下（因此可與原生 `mythic_react` 並存）。路由：

| 路徑 | 頁面 | 用途 |
|------|------|------|
| `/new/login` | `Login` | JWT 認證 + Server Status／SSL 指示 |
| `/new/invite` | `Invite` | Operator 邀請連結註冊 |
| `/new/dashboard` | `Dashboard` | 操作概覽與活動串流 |
| `/new/topology` | `Topology3D` | **3D 網路地圖**（旗艦功能） |
| `/new/events` | `EventFeed` | 即時事件串流與 Alert Counter |
| `/new/callbacks` | `Callbacks` | Active Callback 表格 + Graph View |
| `/new/callbacks/:displayId` | `Callbacks` | 聚焦特定 Callback（深連結） |
| `/new/console` | `ConsoleSelection` | Console 分頁選擇器 |
| `/new/console/:id` | `Console` | 互動式 Tasking Terminal |
| `/new/task` &middot; `/new/task/:displayId` | `SingleTaskView` | 單一 Task 深入檢視 |
| `/new/payloads` | `Payloads` | Payload 清單 + 分頁（list／create／wrapper） |
| `/new/create-payload/*` | `CreatePayload` | 多步驟 Build Wizard |
| `/new/create-wrapper` | （轉址） | &rarr; `/payloads?tab=wrapper` |
| `/new/credentials` | `Credentials` | 憑證庫 |
| `/new/files` | `Files` | 檔案管理 + 截圖 |
| `/new/c2-profiles` | `C2Profiles` | C2 Profile 管理 |
| `/new/payload-types` | `PayloadTypes` | 所有已安裝 Agent／Service |
| `/new/tunnels` | `Tunnels` | SOCKS／RPORTFWD 拓撲 |
| `/new/quickhacks` | `QuickHacks` | 一鍵工作流程庫 |
| `/new/metasploit` | `Metasploit` | MSF-RPC Dashboard／Attack／History |
| `/new/eventing` | `Eventing` | 工作流／Event Group 建構器 |
| `/new/mitre` | `MitreAttack` | ATT&amp;CK 矩陣 |
| `/new/search` | `Search` | 全域搜尋 |
| `/new/artifacts` | `Artifacts` | Artifact 檢視器 |
| `/new/reporting` | `Reporting` | 報告產生器 |
| `/new/operations` | `Operations` | Operation 生命週期 + OPSEC Blocklist |
| `/new/users` | `Users` | Operator 管理 |
| `/new/browser-scripts` | `BrowserScripts` | 自訂 Browser Script |
| `/new/tags` | `Tags` | 標籤管理 |
| `/new/opsec` | `Opsec` | Operation OPSEC 控制 |
| `/new/settings` | `Settings` | 所有 Operator 偏好設定 |

> Sidebar 項目可由各 Operator 透過 **Settings &rarr; Sidebar Shortcuts** 重新排序或隱藏。預設清單中也包含 `/new/jupyter` 與 `/new/graphql` 這兩個外部連結（分別開啟 Mythic 的 Jupyter Notebook 與 Hasura Console）。

---

## Tech Stack

| 類別 | 技術 |
|------|------|
| **Frontend** | React 19、TypeScript 5.9+、React Router 7 |
| **Styling** | Tailwind CSS 3.4、Material-UI 7、Emotion、Framer Motion |
| **State** | Zustand 5（持久化 App Store）、Apollo Client 4（GraphQL + Cache + Reactive Vars） |
| **Real-time** | 透過 `graphql-ws` 的 WebSocket GraphQL Subscription |
| **3D** | Three.js 0.183、`@react-three/fiber`、`@react-three/drei` |
| **Graph** | `@xyflow/react` 12.6 + `elkjs` 0.11 階層排版 |
| **Charts** | MUI X Charts、MUI X Data Grid |
| **Editor** | React Ace（程式碼編輯器／Eventing 工作流語法高亮） |
| **Data &amp; Storage** | IndexedDB（`musicDB`、Custom Graph Node 快取）、`sql.js` 本地 SQLite、Hasura `agentstorage` 共享狀態 |
| **Animation** | Framer Motion（轉場、Modal）、CSS 動畫（掃描線、Glitch） |
| **Build** | React App Rewired 2.2、Webpack 5、PostCSS、`config-overrides.js` |
| **Deploy** | Docker、Nginx（SSL + 反向代理 + WS Upgrade） |
| **External** | 透過 HTTP JSON-RPC 的 MSF-RPC（Metasploit Framework） |

---

## Quick Start（Production）

### 前置需求

- [Docker](https://docs.docker.com/get-docker/) 與 Docker Compose
- 一個 Host 可連到的 [Mythic C2](https://github.com/its-a-feature/Mythic) Instance（預設 `https://host.docker.internal:7443`）
- Host 上開放 **443** port
- Mythic 的 `.env` 必須把 port 綁在 loopback 以外，Minerva 容器才能透過 `host.docker.internal` 連過去：`NGINX_BIND_LOCALHOST_ONLY="false"` 與 `MYTHIC_SERVER_DYNAMIC_PORTS_BIND_LOCALHOST_ONLY="false"`。`scripts/minerva_install.sh` 會自動設定。

### 一鍵安裝（`minerva_install.sh`）—— 建議路徑

隨附的安裝腳本是灌到 vanilla Mythic 上的官方支援路徑。它部署 Minerva 自己的 Stack，Mythic 的 UI 與容器完全不動：

```bash
# 從 /opt/Minerva 執行
./scripts/minerva_install.sh          # 完整安裝（步驟見下）
./scripts/minerva_install.sh up       # 只重建／啟動 minerva + minerva-dev
./scripts/minerva_install.sh down     # 停止 Minerva Stack
./scripts/minerva_install.sh verify   # 驗證安裝（.env keys、容器、HTTP 200）
./scripts/minerva_install.sh status   # 顯示 Minerva + Mythic 容器狀態與日誌
./scripts/minerva_install.sh fix      # 重新套用 .env 並重建／重啟 Stack
./scripts/minerva_install.sh clean    # 清除資料庫中的 Custom Graph Node
./scripts/minerva_install.sh uninstall  # 停止並移除 Minerva Stack（Mythic 不動）

# Metasploit：
./scripts/minerva_install.sh msf-start    # 啟動 MSF-RPC 容器
./scripts/minerva_install.sh msf-stop     # 停止 MSF-RPC 容器
./scripts/minerva_install.sh msf-status   # 狀態 + 日誌
./scripts/minerva_install.sh msf-verify   # Python 連線檢查
```

安裝流程：

1. 設定 Mythic 的 `.env` 以支援跨容器連通（冪等；即上述兩個 `*_BIND_LOCALHOST_ONLY`）。
2. 執行 `mythic_change.sh` 修補 Mythic 的 Go 原始碼並重建 `mythic_server`（見下節）。
3. 套用 Mythic Agent 端 patch（Apollo SOCKS/TCP、IPC 緩衝區）。
4. 設定 Hasura `agentstorage` 表，讓 Custom Graph Node 能在 Operator 之間同步。
5. 建置並啟動 `minerva` + `minerva-dev` 容器（Nginx 監聽 **443**）。

步驟 1–4 是唯一會碰到 Mythic 的部分，而且全部只動後端、全部冪等。Minerva 的 UI 從不進入 Mythic 的檔案樹或容器。若 Mythic 不在 `/opt/Mythic`，設定 `MYTHIC_DIR` 環境變數。

### 獨立容器

```bash
git clone https://github.com/aifred0729-TW/Minerva.git
cd Minerva

# 建置 App + Nginx 映像檔後啟動（自動產生自簽憑證）
docker compose build
docker compose up -d
```

> 首次啟動會在 `minerva-dev` 內編譯 React App —— 約 1～2 分鐘後 `https://<host>/` 才會提供服務。`minerva` Nginx 容器會在它起來後開始代理。

開啟 **https://&lt;your-host&gt;/** —— 會被導向 `/new/login`，用你的 Mythic 帳密登入。

指向遠端 Mythic：

```bash
MYTHIC_ADDRESS=https://10.0.0.5:7443 docker compose up -d
```

停止：

```bash
docker compose down
```

> 預設的 `docker-compose.yml` 只對外開放 Minerva（443）。`MYTHIC_ADDRESS` 會以樣板變數傳進 Nginx，用於 `/graphql`、`/auth`、`/refresh`、`/invite`、`/direct` 的 upstream。要換掉自動產生的自簽憑證，把你自己的 `minerva.crt`／`minerva.key` 放進 `nginx/ssl/` 即可。

---

## Development Mode（Hot Reload）

### 架構

Dev 模式使用兩個容器：

| 容器 | 角色 | 說明 |
|------|------|------|
| `minerva-dev` | React Dev Server | 在 port 3000 執行 `react-app-rewired start` 並啟用 HMR。原始碼以 volume 掛載，任何變更都會即時刷新瀏覽器。 |
| `minerva`     | Nginx SSL Proxy  | 以自簽 SSL 監聽 **443**。代理 `/new/` &rarr; Dev Server、`/ws` &rarr; HMR WebSocket，以及 `/graphql/`、`/auth`、`/refresh`、`/invite`、`/msf-rpc/`、`/direct/` &rarr; Mythic。 |

```
Browser :443 ── nginx (SSL) ── minerva-dev :3000   (React dev server + HMR)
                       ├──  Mythic :7443           (API / GraphQL / WebSocket)
                       └──  Metasploit :55553      (optional MSF-RPC)
```

### 快速開始

```bash
docker compose -f docker-compose.dev.yml up -d --build
docker logs -f minerva-dev   # 等待 "webpack compiled"
```

開啟 **https://&lt;your-host&gt;/** —— `src/` 或 `public/` 下的任何變更都會在 1 秒內 Hot Reload。

### 掛載的 Volume

| Host 路徑 | 容器路徑 | 用途 |
|-----------|----------|------|
| `./src/` | `/app/src/` | React 原始碼（Hot Reload） |
| `./public/` | `/app/public/` | 靜態資源 |
| `./tailwind.config.js` | `/app/tailwind.config.js` | Tailwind 主題 |
| `./postcss.config.js` | `/app/postcss.config.js` | PostCSS |
| `./config-overrides.js` | `/app/config-overrides.js` | Webpack 覆寫 |
| `./tsconfig.json` | `/app/tsconfig.json` | TypeScript 設定 |
| `./.env` | `/app/.env` | Build-time 環境變數 |

> `node_modules/` 與 `package.json` **不會**被掛載 —— 它們在映像檔裡。增刪 npm 套件後請用 `docker compose -f docker-compose.dev.yml up -d --build` 重建。

### 連到遠端 Mythic

```bash
MYTHIC_ADDRESS=https://10.0.0.5:7443 \
docker compose -f docker-compose.dev.yml up -d --build
```

### Dev 與 Production 切換

```bash
# Dev (HMR) → Production
docker compose -f docker-compose.dev.yml down
docker compose up -d --build

# Production → Dev
docker compose down
docker compose -f docker-compose.dev.yml up -d --build
```

---

## 桌面應用程式（Windows / macOS）

<p align="center">
  <img src="docs/screenshots/topology3d.png" alt="Minerva 以桌面 console 執行" width="100%">
</p>

Minerva 也發行為 **Windows** 與 **macOS** 的原生 console —— 同一份 React bundle 包進
Electron，`src/` 沒有分叉。

桌面應用裡沒有 nginx，而 console 的每一個後端呼叫都是打自己的 origin
（`window.location.origin + "/graphql/"`、`wss://" + window.location.host + "/graphql/"`、
`/direct/download/...`）。所以代理層搬進行程內：Electron 主行程跑一個 loopback gateway，
逐條鏡射 `nginx.conf.template` 的路由，視窗再從它載入 bundle。React 端分辨不出差異。

**Operator 在登入畫面出現之前就先指定要連到哪個 Mythic。** 容器部署裡這個位址是 compose
設定；桌面版則是同一個執行檔跟著人在不同任務之間跑，所以應用先開一個 Connect 視窗、跑完
連線預檢，才交棒：

```
啟動 ──▶ Connect 視窗 ──▶ 預檢 ──▶ gateway ──▶ console ──▶ Mythic 登入
```

```bash
# 1. 先在 repo 根目錄建置 bundle（只需一次）
npm install && npm run build

# 2. 打包外殼
cd desktop
npm install
npm run dist:win     # NSIS 安裝檔 + 免安裝版，x64 與 arm64
npm run dist:mac     # dmg + zip，arm64 與 x64（需要 macOS 主機）
```

安裝檔輸出在 `desktop/dist/`。`.github/workflows/desktop-build.yml` 會在推 tag 時同時建置
兩個平台並附到 GitHub Release —— 這是沒有 Mac 也能拿到 `.dmg` 的方法。

有兩點是刻意與容器部署不同的：

- **對外連線預設關閉。** Renderer 只能到 loopback gateway，其餘一律擋掉，這也擋住 bundle
  對 Google Fonts 的請求。C2 console 不該在任務進行中從 operator 的機器對第三方發出連線。
- **MSF-RPC 保留授權閘門。** `/msf-config` 與 `/msf-rpc/` 都要先通過對 Mythic `GET /me`
  的子請求驗證 —— 與 nginx 的 `auth_request` 是同一道控制，所以沒有有效的 operator token
  就碰不到 Metasploit。

完整說明（架構、含 HMR 的開發流程、簽章、設定檔位置、安全姿態）見
[`desktop/README.md`](desktop/README.md)。

---

## Metasploit Integration

<p align="center">
  <img src="docs/screenshots/metasploit.png" alt="Metasploit dashboard" width="100%">
</p>

Minerva 內建一個由 MSF-RPC daemon 容器驅動的一級 Metasploit 頁面。

### Stack

```
React (Metasploit page)
   └── /msf-rpc/  (nginx, proxy_pass)
         └── minerva_msf :55553  (msfrpcd --user msf --pass <generated> -S  (bound to 127.0.0.1))
```

### 啟動 MSF-RPC

```bash
# 方式 A：透過 minerva_install.sh
./scripts/minerva_install.sh msf-start
./scripts/minerva_install.sh msf-verify   # 用 msfrpc_verify.py 做 Python 連線檢查

# 方式 B：直接用 compose
docker compose -f docker-compose.metasploit.yml up -d
```

覆寫帳密／port：

```bash
MSFRPC_USER=msf MSFRPC_PASS=changeme MSFRPC_PORT=55553 \
docker compose -f docker-compose.metasploit.yml up -d
```

> `MSFRPC_PASS` 沒有預設值。`minerva_install.sh msf-start` 會產生一組並寫入 `.env.msf`，該檔已被 git 忽略 —— 憑證不會進版控。

### 頁面分頁

| 分頁 | 用途 |
|------|------|
| **Dashboard** | 連線狀態、主機統計、Session 數量、近期 Job |
| **Attack** | Module Browser、參數表單、指定 Target／Payload 發動、儲存憑證、Dry-run 預覽 |
| **Operations** | 進行中的 Session、Job 與 Route —— 可 Kill Session、停止 Job、hop／portfwd |
| **History** | 每次發動攻擊的永續執行紀錄（IndexedDB），含完整輸出 |

MSF-RPC Client 位於 `src/Minerva/pages/Metasploit/msfrpc.ts`。頁面每 15 秒輪詢 `getFullStatus`，各分頁 Lazy Load。MSF Route 的 SOCKS port 配置是共享且不可分割的，兩個 Operator 不會被配到同一個本機 port。

---

## Setup Script（`minerva_install.sh`）

安裝 Minerva、管理選配的 MSF-RPC 服務、重置狀態的統一進入點。

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

腳本是冪等的 —— 重複執行安全，已完成的步驟會自動跳過。**不變量：從全新 clone 執行 `minerva_install.sh`，就能把 Minerva 完整安裝到一套 vanilla Mythic 上。**

---

## Mythic 原始碼修補（`mythic_change.sh`）

Minerva 有些功能需要 Mythic 後端原本不提供的行為。這類變更**一律**以冪等、帶哨兵判斷的 patch 記錄在 `scripts/mythic_change.sh` 裡，絕不留成散落的手改；該腳本再由 `minerva_install.sh` 串接，因此全新 clone 就能在 vanilla Mythic 上重現完整修補集。

| # | 檔案 | 未修補的症狀 | 修補方式 |
|---|------|--------------|----------|
| **0** | Mythic `.env`（設定，非原始碼） | Minerva 的 nginx 容器無法透過 `host.docker.internal` 連到 Mythic 的 7443／C2 ports —— 全新安裝出現 connection refused | 強制 `NGINX_BIND_LOCALHOST_ONLY="false"` 與 `MYTHIC_SERVER_DYNAMIC_PORTS_BIND_LOCALHOST_ONLY="false"`；postgres／rabbitmq／hasura／jupyter 維持 loopback-only |
| **1** | `rabbitmq/utils.go` &middot; `GetFinalStringForDatabaseInstanceValueFromUserSuppliedValue` | 匯入或重建 Payload 時，若 Array 參數是 JSON 編碼字串會噴 `bad type for *_PARAMETER_TYPE_ARRAY: string` | 新增 `case string:`，驗證該值是合法 JSON Array 後回傳 |
| **2** | `rabbitmq/utils.go` &middot; `getSyncToDatabaseValueForDefaultValue` | Agent Sync 時，C2 Profile／Payload Type 送出 JSON 編碼的 Array 預設值會有同樣錯誤 | 同樣的 `case string:` 處理 |
| **3** | `webserver/controllers/hasura_claims.go` | Hasura 以 `missing session variable: x-hasura-operations` 拒絕請求 | 把已經算好卻沒寫回 claims map 的 `x-hasura-operations`／`x-hasura-admin-operations` 補上 |
| **4** | `webserver/controllers/operationeventlog_create_webhook.go` | `mythic_server` 編譯失敗 —— 未使用的 `strings` import | 移除該 import |
| **5** | `agentstorage` 表（Hasura／Postgres） | Custom Graph Node 的 upsert 失敗 —— `on_conflict` 需要具名 constraint，而非單純的 unique index | 將 unique INDEX 轉為具名 CONSTRAINT |
| **6** | `rabbitmq/util_agent_message_actions_update_info.go`<br>`rabbitmq/recv_mythic_rpc_callback_update.go` | Topology 裡的 **Set Primary IP** 在數秒後被下一次 Agent Check-in 覆蓋 —— `callback.ip` 被以網卡列舉順序重寫 | 比對已存與新進 IP 的**集合**；相同則完全不動，不同則保留倖存的 Operator 排序在前、新 IP 依序附加 |
| **7** | `rabbitmq/util_agent_message_actions_post_response.go` | 幽靈 P2P 連線：連線已死時 Apollo 的 `unlink` 不會發出 `EdgeNode remove`，`callbackgraphedge.end_timestamp` 就永遠是 NULL | 任何 `unlink*` 指令完成時，雙向關閉以該 Callback 為來源的所有 P2P Edge |
| **8** | `rabbitmq/util_agent_message.go` | 被隱藏的 P2P Callback 只要有中繼流量經過就會自己跳回 UI | P2P Callback 的隱藏會持續生效，只有明確的 **Show Callback** 才會恢復；直連 C2 的 Callback 行為不變 |
| **9** | `rabbitmq/utils_proxy_traffic.go`<br>`rabbitmq/util_agent_message_push_c2.go` | SOCKS／RPORTFWD 吞吐量崩潰，且 channel 塞滿時會靜默丟包 —— 破壞被隧道傳輸的 TCP 串流 | Proxy channel buffer 1000 &rarr; 16384（頂層 2000 &rarr; 16384）、三處靜默丟棄的 select 改為 try-then-block-10s 讓 backpressure 傳回 Agent POST、移除 read loop 的 20ms 節流 |
| **10** | `webserver/controllers/user_update_operator_password_webhook.go` | `operator.email` 是 UNIQUE —— 沒有 email 的帳號第二次改密碼時會在 `''` 上撞鍵，而且是在密碼已寫入之後才報錯 | 綁定 handler 早就算好的 `sql.NullString`，讓空白 email 存成 NULL |

需要時可單獨執行：

```bash
MYTHIC_DIR=/opt/Mythic ./scripts/mythic_change.sh
```

重複執行是安全的。Hasura metadata 那一側（agentstorage 追蹤與 `minerva_%` 資料列作用域）由姊妹腳本 `scripts/configure-hasura-agentstorage.sh` 負責，同樣由 `minerva_install.sh` 串接。

---

## Project Structure

```
Minerva/
├── docker-compose.yml              # Standalone stack（nginx + dev server）—— 官方部署方式
├── docker-compose.dev.yml          # 開發用（nginx + dev server，掛載原始碼）
├── docker-compose.metasploit.yml   # 選配的 MSF-RPC daemon
├── docker/
│   ├── Dockerfile.prod             # 建置靜態 React + Nginx
│   ├── Dockerfile.dev              # Node dev server + HMR
│   ├── Dockerfile.nginx            # Nginx（dev compose 使用）
│   └── Dockerfile                  # 舊的 Mythic 內建置方式
├── nginx/
│   ├── nginx.conf.template         # Prod 樣板（alias /new + proxy）
│   ├── nginx.dev.conf.template     # Dev 樣板（proxy 到 dev server + /ws）
│   └── docker-entrypoint.sh        # SSL 憑證產生 + envsubst
├── scripts/
│   ├── minerva_install.sh          # install / verify / fix / status / msf-*
│   ├── mythic_change.sh            # 每一項 Mythic 側修補的冪等紀錄
│   ├── MythicAgentPatch.sh         # Agent 側 patch（Apollo SOCKS/TCP、IPC 緩衝區）
│   ├── configure-hasura-agentstorage.sh   # 共享圖狀態所需的 Hasura metadata
│   ├── clear-custom-nodes.sh       # 清除資料庫中的 Custom Graph Node
│   ├── clear-nodes.sql             # clear-custom-nodes 使用的 SQL
│   ├── debug-custom-nodes.sh       # 從 Hasura 印出 Custom Node 狀態
│   ├── msfrpc_verify.py            # MSF-RPC 連線檢查
│   ├── take_screenshots.js         # README 截圖擷取（Puppeteer）
│   └── take_login_only.js          # 單張登入截圖
├── docs/
│   ├── DESIGN_LANGUAGE.md          # UI 規範正本 —— 動任何 UI 前先讀
│   ├── banner.jpg
│   └── screenshots/
├── public/                         # 靜態資源（favicon、音訊等）
├── tailwind.config.js              # 主題 token（signal/void/ghost/machine + accent）
├── postcss.config.js
├── config-overrides.js             # Webpack 覆寫
├── tsconfig.json
├── package.json
└── src/
    ├── index.js                    # React root + Apollo + WS link
    ├── cache.js                    # Apollo cache + reactive vars
    ├── themes/                     # MUI 主題橋接
    ├── components/                 # 舊有共用元件
    └── Minerva/
        ├── App.tsx                 # Router + 認證啟動（路由 code-split）
        ├── store.ts                # Zustand app store（sidebar、audio、console 分頁）
        ├── index.css               # Tailwind base + CSS 變數 + cyber-scrollbar
        │
        ├── context/
        │   ├── BattleModeContext.tsx
        │   └── ThemeContext.tsx
        │
        ├── pages/                  # 所有路由（Lazy Load）
        │   ├── Dashboard.tsx
        │   ├── Login.tsx · Invite.tsx
        │   ├── Topology3D/         # ★ 旗艦視圖
        │   │   ├── index.tsx           （場景、相機、排版、隱藏網段）
        │   │   ├── SceneObjects.tsx    （節點、邊、Subnet 體積、標籤）
        │   │   ├── TunnelLayer.tsx     （SOCKS／RPORTFWD 疊層）
        │   │   ├── DetailPanel.tsx     （節點右鍵選單）
        │   │   ├── QuickHack.tsx       （場景內攻擊面板）
        │   │   ├── NodeDossier.tsx     （VIEW DETAILS —— identity／platform／network／link）
        │   │   ├── defenseMatrix.tsx   （防毒·EDR／防火牆／權限）
        │   │   ├── defenseMarks.ts     （Operator 標記，依主機保存）
        │   │   ├── Topology3DModals.tsx
        │   │   └── topology.ts         （圖模型 + 擺位）
        │   ├── Callbacks/          （graph + table + dialogs + utils）
        │   ├── Console/            （terminal + context menu + parsers）
        │   ├── ConsoleSelection.tsx
        │   ├── SingleTaskView/     （host tree、task detail、list）
        │   ├── Payloads/
        │   ├── CreatePayload/      （多步驟 wizard）
        │   ├── CreateWrapper/
        │   ├── PayloadTypes/       （搜尋／排序／agent icon + build params + commands + files）
        │   ├── Files/              （filetable、screenshots、modals）
        │   ├── Credentials.tsx
        │   ├── C2Profiles.tsx
        │   ├── Tunnels/ · TunnelMap.tsx
        │   ├── QuickHacks.tsx
        │   ├── Metasploit/         （msfrpc、LaunchAttack、Operations、TaskBrowser、history）
        │   ├── Eventing/           （工作流建構器、trigger、instance）
        │   ├── EventFeed.tsx
        │   ├── Operations/         （生命週期 + OPSEC blocklist）
        │   ├── Opsec.tsx
        │   ├── MitreAttack.tsx
        │   ├── BrowserScripts.tsx
        │   ├── Search/
        │   ├── Artifacts.tsx
        │   ├── Reporting.tsx
        │   ├── Tags.tsx
        │   ├── Users.tsx
        │   └── Settings/           （Audio、Palette、SidebarShortcuts、rows）
        │
        ├── components/             # 可重用 UI
        │   ├── Layout.tsx           # 共用外殼（sidebar + outlet）
        │   ├── Sidebar.tsx
        │   ├── CallbackGraph/       # ReactFlow graph + nodes + edges + layout
        │   ├── FileBrowser/         # Callback／Server／虛擬檔案樹
        │   ├── OutputRenderer/      # core、panels、parsed、graph renderer
        │   ├── CyberModal.tsx · CyberAlert · CyberDropdown · CyberTable
        │   ├── GlobalAudioPlayer.tsx
        │   ├── BattleMode.tsx
        │   ├── EventNotifications.tsx
        │   ├── ErrorBoundary.tsx
        │   ├── OSIcons.tsx
        │   └── …
        │
        ├── lib/
        │   ├── api/                 # GraphQL query／mutation／subscription，依領域拆檔
        │   ├── auth.ts               # JWT helper、refresh 邏輯
        │   ├── state.ts              # Apollo reactive vars（meState、mePreferences）
        │   ├── snackbar.ts           # toast helper
        │   ├── soundEffects.ts       # 每事件 SFX
        │   ├── musicDB.ts            # IndexedDB 音樂庫
        │   ├── customGraphNodeService.ts  # 共享圖節點（Hasura agentstorage）
        │   ├── useQueryCompat.ts     # Apollo 4 相容層
        │   └── utils.ts
        │
        ├── hooks/                   # useCopyToClipboard、useDebounce、useFromNow、usePagination
        ├── types/                   # 各領域的 TS 介面
        └── constants/               # api endpoint、色彩
```

> 所有 UI 工作都遵循 [`docs/DESIGN_LANGUAGE.md`](docs/DESIGN_LANGUAGE.md) —— 規範 palette、對比規則、面板框線與轉場編排的 smooth 先進極簡 Cyberpunk 標準。

---

## Architecture

### Apollo Client + Reactive Vars

- 除了 Metasploit RPC 之外，**GraphQL** 是所有資料的唯一傳輸層。Query 與 Mutation 依領域分組放在 `lib/api/*.ts`。
- **Subscription** 透過 `graphql-ws` 走同一個 `wss://<host>/graphql/` endpoint。Callbacks、EventFeed、Payloads、PayloadTypes、Tunnels、Topology3D、Console 都靠 Subscription 即時更新。
- **Reactive Variables**（`meState`、`mePreferences`）把已認證的使用者狀態與偏好覆寫暴露給任何元件。

### Routing 與 Code-splitting

- 每個路由都在 `App.tsx` 以 `React.lazy` 匯入，初始 bundle 因此保持精簡；進到該路由才串流載入對應 chunk。Chunk 載入失敗會進入重試，而不是把路由卡死。
- 所有已認證路由共用同一個 `<Layout />`，因此 Sidebar、音樂播放器、事件通知與 Battle Mode 外殼在導覽期間永不重新掛載。

### State

- **Zustand store**（`store.ts`，持久化到 localStorage）保存 Sidebar 收合、Console 分頁、Alert 數量、音訊（音樂庫、音量、各 SFX 開關）與通知偏好。
- **Apollo cache** 保存 GraphQL 實體。
- **IndexedDB** 保存音樂二進位檔、MSF Task History 與本地 Custom Graph Node 快取。
- **Mythic Operator Preferences** 保存所有必須跟著 Operator 換機器的東西 —— Topology 的隱藏網段與 DEFENCE MATRIX 標記都存在這裡，不是 localStorage。

### 閒置行為

分頁不可見時輪詢與 Subscription 會停下來，開著的 Minerva 視窗不會在沒人看的時候把機器壓在滿載。Console 只開一條共用的 Subscription，而不是每個 Task 一條。

### 存活判定

UI 的 Callback 存活狀態由「最後 Check-in 對照 Agent Sleep 間隔」推導，**不是**讀 Mythic 的 `dead` 欄位 —— 那個欄位最多會延遲一分鐘，會讓 Topology 與 Callback 表把活著的節點顯示成 `DEAD`。

### 即時 Custom Graph Node

Custom Graph Node 儲存在 Hasura 的 `agentstorage` 表（Server 端），讓每個 Operator 看到同一份拓撲。`customGraphNodeService.ts` 負責序列化、5 秒輪詢同步、容忍衝突的合併，以及 `DEBUG_GRAPH` 記錄。安裝時由 `configure-hasura-agentstorage.sh` 建立必要的 Hasura 權限。

---

## Routing &amp; Sidebar

Sidebar（`components/Sidebar.tsx`）列出所有頁面。Operator 可透過 **Settings &rarr; Sidebar Shortcuts** 重新排序或隱藏項目。

預設 key 集合（由 `getMythicSetting('sideShortcuts')` 使用）：

```
dashboard · events · callbacks · console · task · payloads · credentials · files
c2-profiles · tunnels · quickhacks · users · search · topology · metasploit · settings
opsec · operations · artifacts · mitre · reporting · tags · browser-scripts · eventing
payload-types · jupyter · graphql
```

`jupyter` 與 `graphql` 是*外部*連結，會開啟 Mythic 的 Jupyter Notebook 與 Hasura Console。

---

## Nginx Proxy Layout

Nginx（443、自簽 SSL）是唯一入口，負責 SSL 終結並代理到 Mythic 或 Metasploit。

| Location | Upstream | 備註 |
|----------|----------|------|
| `/` | 轉址到 `/new/login` | |
| `/new/` | `minerva-dev:3000` | App + HMR WS Upgrade |
| `/ws` | `minerva-dev:3000/ws` | webpack HMR socket |
| `/graphql/` | `${MYTHIC_ADDRESS}/graphql/` | HTTP + WS Upgrade，86400 秒 read timeout |
| `/auth` | `${MYTHIC_ADDRESS}/auth` | 取得 JWT |
| `/invite` | `${MYTHIC_ADDRESS}/invite` | Operator 邀請註冊 |
| `/refresh` | `${MYTHIC_ADDRESS}/refresh` | JWT Refresh |
| `/direct/` | `${MYTHIC_ADDRESS}/direct/` | 檔案下載 |
| `/msf-rpc/` | `minerva_msf:55553` | MSF-RPC JSON-RPC（選配） |

Buffer 與 body 大小已針對大型 JWT（16k）與 50 MB 上傳調校。

---

## Theme System

<p align="center">
  <img src="docs/screenshots/settings.png" alt="Settings &amp; theme palette" width="100%">
</p>

Minerva 使用 CSS 自訂屬性，因此換主題不需重新編譯。基礎 palette 定義在 `index.css`：

```css
/* Dark theme (default) */
:root {
  --color-signal:  255 255 255  /* 文字與高亮        */
  --color-accent:   34 197  94  /* 綠色 accent       */
  --color-void:      0   0   0  /* 背景              */
  --color-ghost:   153 153 153  /* 邊框與次要元素    */
  --color-machine:  51  51  51  /* 卡片背景          */
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

字型：**JetBrains Mono**（等寬）與 **Inter**（無襯線）。Operator 也可透過 **Settings &rarr; Palette** 設定自訂背景圖與各元件的輸出配色。

---

## Battle Mode

<p align="center">
  <img src="docs/screenshots/callbacks.png" alt="Battle Mode on the Callbacks page" width="100%">
</p>

`context/BattleModeContext.tsx` 提供三種操作模式：

- **NORMAL** —— 預設；完整外觀與動畫預算。
- **RECON** —— 淡化非關鍵外觀元素，優先可讀性。
- **COMBAT** —— 戰術 UI：動畫 2 倍速、Accent 轉為警戒紅、環境音效音量提高。

由 Sidebar 的 combat／recon 圖示切換，模式狀態保存在 Zustand store。

---

## Audio System

兩層音訊：

1. **全域音樂播放器** —— Operator 自行上傳的曲目存於 IndexedDB（`musicDB`）。播放狀態透過 `useAppStore`（`musicPlaying`、`musicTrackId`）跨頁面導覽與整頁重新載入都能延續。
2. **音效** —— 針對新 Callback、Tunnel、Auth 警示、按鍵與錯誤的事件音效，可在 **Settings &rarr; Audio** 個別開關。

所有音訊都受全域的 `sfxEnabled`／`musicEnabled` 旗標約束。

---

## Custom Graph Nodes

<p align="center">
  <img src="docs/screenshots/callbacks.png" alt="Custom nodes in the Callbacks graph" width="100%">
</p>

Custom Node 用來描述 Mythic 原生不認識的 Relay／Proxy 基礎設施 —— 也就是上面 3D Topology 裡那些橘色節點。它們保存在 Hasura 的 `agentstorage` 表，讓所有 Operator 看到同一份視圖。

| 動作 | 方式 |
|------|------|
| 建立節點 | 在 **Callbacks &rarr; Graph View** 的空白處按右鍵 &rarr; *Create Custom Node* |
| 連接節點 | 在節點上按右鍵 &rarr; *Set Parent* |
| 編輯／刪除 | 在節點上按右鍵 &rarr; *Edit*／*Delete* |
| 全部重置 | `./scripts/clear-custom-nodes.sh` |

每個節點保存 Hostname、IP、OS、架構、C2 Profile 選擇、位置與顏色。位置跨 Session 保存，資料透過 5 秒輪詢在連線中的 Operator 之間同步。在 `CallbackGraph/index.tsx` 把 `DEBUG_GRAPH` 設為 `true` 可開啟詳細記錄。

---

## Authentication &amp; Sessions

- 透過 `/auth`、`/refresh` 的 JWT 認證（Access + Refresh Token）。
- JWT 有效期 4 小時，背景自動 Refresh。
- Token 更新時同步重新認證 WebSocket，GraphQL Subscription 不會中斷。
- Session 到期偵測 —— 剩 30 分鐘跳出提示，到期強制登出。
- 登出是真的把 Session 拆乾淨：清除 Token、關閉 Subscription、丟棄快取。
- `<Layout />` 內的所有路由都要求有效的 `meState`；未登入者一律導向 `/login`。

> Mythic 的 `/auth` 回應中沒有 `admin` 欄位，因此需要 Admin 權限的 UI 是從 `operator` 資料表推導，而不是從登入回應判斷。

---

## Environment Variables

| 變數 | 預設值 | 用途 |
|------|--------|------|
| `MYTHIC_ADDRESS` | `https://host.docker.internal:7443` | 所有 Mythic API 呼叫的 Nginx upstream |
| `MSFRPC_USER` | `msf` | MSF-RPC 使用者名稱（`docker-compose.metasploit.yml`） |
| `MSFRPC_PASS` | _（自動產生）_ | MSF-RPC 密碼 —— 必填、無預設；`minerva_install.sh msf-start` 會寫入 `.env.msf` |
| `MSFRPC_PORT` | `55553` | `minerva_msf` 對外的 port |
| `MYTHIC_DIR` | `/opt/Mythic` | 供 `minerva_install.sh` 與 `mythic_change.sh` 使用 |
| `CHOKIDAR_USEPOLLING` | `true` | 在 Docker 內強制檔案輪詢以支援 HMR |
| `WDS_SOCKET_PATH` | `ws` | Nginx 後方的 HMR socket 路徑 |
| `WDS_SOCKET_PORT` | `443` | Nginx 後方的 HMR socket port |

---

## Troubleshooting

| 問題 | 解法 |
|------|------|
| 全新安裝連不到 Mythic（connection refused） | Mythic 的 `.env` 還綁在 loopback。把兩個 `*_BIND_LOCALHOST_ONLY` 設為 `"false"` 並執行 `./mythic-cli start`，或直接跑 `./scripts/minerva_install.sh fix`。 |
| CSS 沒載入 | 確認 `tailwind.config.js` 與 `postcss.config.js` 有被掛載，並用 `--build` 重建。 |
| Hot Reload 沒作用 | 看 `docker logs minerva-dev`。Docker 內的 Dev Server 需要 `CHOKIDAR_USEPOLLING=true`。 |
| 編輯後出現 `MODULE_NOT_FOUND` | 檢查 `docker-compose.dev.yml` 的 volume 掛載。 |
| 新增的 npm 套件找不到 | 重建：`docker compose -f docker-compose.dev.yml up -d --build` |
| 瀏覽器 SSL 警告 | 正常 —— 自簽憑證。信任該憑證或直接略過警告。 |
| Payload build／import 出現 `bad type for *_PARAMETER_TYPE_ARRAY: string` | 執行 `./scripts/mythic_change.sh` 後重建 `mythic_server`。 |
| Topology 把活著的主機顯示成 `DEAD` | Mythic 的 `dead` 欄位有延遲。確認你跑的版本是用最後 Check-in 推導存活狀態 —— `./scripts/minerva_install.sh verify`。 |
| P2P 幽靈連線關不掉 | Patch 7 沒套用。重跑 `mythic_change.sh` 並重建 `mythic_server`。 |
| SOCKS／RPORTFWD 極慢或串流損毀 | Patch 9 沒套用。重跑 `mythic_change.sh` 並重建 `mythic_server`。 |
| 隱藏的 P2P Callback 一直跳回來 | Patch 8 沒套用。重跑 `mythic_change.sh` 並重建 `mythic_server`。 |
| Graph Node 不同步 | `./scripts/minerva_install.sh fix` —— 會驗證 Hasura `agentstorage` 表。 |
| Graph Node 資料損毀 | `./scripts/clear-custom-nodes.sh` 清空後重來。 |
| Metasploit 頁面顯示 offline | 執行 `./scripts/minerva_install.sh msf-status` 與 `msf-verify`，並確認 Settings 裡的 `MSFRPC_USER`／`PASS` 與 `msfrpcd` 實際使用的一致。 |
| Sidebar 少了項目 | **Settings &rarr; Sidebar Shortcuts** —— 舊的排序設定可能隱藏了新項目，重置為預設即可。 |
| JWT 過期提示一直跳 | 瀏覽器時鐘可能偏移；校正系統時間並清除 localStorage。 |

---

## License

本專案採雙授權：

- **開源授權** —— [AGPL-3.0](./LICENSE)
  你可以在 AGPL-3.0 下使用、修改與散布本軟體。任何衍生作品或使用本軟體的服務也必須以 AGPL-3.0 釋出。

- **商業授權** —— 供專有／閉源使用，不受 AGPL 義務約束。聯絡：**aifred0729tw@gmail.com**
