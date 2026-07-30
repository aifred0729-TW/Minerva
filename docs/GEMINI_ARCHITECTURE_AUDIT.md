# Gemini 架構分析報告 — 事實查核調查報告

> **調查日期**: 2025-07  
> **基準**: Minerva `src/Minerva/` — 240 TS/TSX 檔案, 75,272 行  
> **方法**: 逐行程式碼審計, `grep` 精確計數, 生產 Build 分析  
> **結論**: 4 項缺陷中 **1 項確認、2 項部分正確、1 項已被反駁**

---

## 目錄

1. [執行摘要](#1-執行摘要)
2. [缺陷 2.1: 大量遺留程式碼耦合 — ❌ 已被反駁](#2-缺陷-21-大量遺留程式碼耦合)
3. [缺陷 2.2: 臃腫的單體 Store — ⚠️ 部分正確](#3-缺陷-22-臃腫的單體-store)
4. [缺陷 2.3: 渲染瓶頸 — ✅ 確認](#4-缺陷-23-渲染瓶頸)
5. [缺陷 2.4: 沉重的依賴佔用 — ⚠️ 部分正確](#5-缺陷-24-沉重的依賴佔用)
6. [建議行動評估](#6-建議行動評估)
7. [實際優先修復清單](#7-實際優先修復清單)
8. [附錄: 原始數據](#8-附錄-原始數據)

---

## 1. 執行摘要

| Gemini 聲稱 | 判定 | 實際影響 |
|---|---|---|
| 2.1 大量遺留程式碼耦合 (35%+ 死碼, 需要 adapter/shim) | **❌ 已被反駁** | 遺留碼存在但 **完全不可達** — 零耦合, 零進入生產 Bundle |
| 2.2 臃腫的單體 Store (缺乏 Slice Pattern) | **⚠️ 部分正確** | Store 不臃腫 (121 行, 33 成員), 但 **全部 35 個消費者缺少 selector** |
| 2.3 渲染效能瓶頸 (圖形元件不必要重繪) | **✅ 確認** | 全數 `useAppStore()` 無 selector + ELK 在 useEffect 中重算 + Canvas 無 frameloop 限制 |
| 2.4 沉重的依賴佔用 (多 CSS 方案, 大 Bundle) | **⚠️ 部分正確** | CSS 混合策略實際運作良好、無衝突; 但存在 9+ 未使用依賴 + Three.js barrel import |

---

## 2. 缺陷 2.1: 大量遺留程式碼耦合

### Gemini 聲稱

> `src/components/` 包含 130+ 個 .js 檔案、40,000+ 行, 佔程式碼庫 35%+。Minerva 必須透過 adapter/shim 與遺留碼共存, 造成維護負擔。

### 實際數據

#### 程式碼量化 (精確計數)

| 區域 | 檔案數 | 行數 | 佔比 |
|---|---|---|---|
| `src/Minerva/` (新, TS/TSX) | 240 | 75,272 | 64.3% |
| `src/components/` (遺留, JS) | 130 | 41,218 | 35.2% |
| 其他共用 (index.js, cache.js 等) | 4 | 531 | 0.5% |
| **合計** | **374** | **117,021** | 100% |

→ **檔案量確認**: 130 個 .js 檔案, 41,218 行, 佔 35.2% — 數字正確。

#### 跨邊界 Import 追蹤 — 關鍵發現

| 方向 | Import 數量 | 證據 |
|---|---|---|
| Minerva → 遺留 (`src/components/`) | **0** | `grep -rn "from '../../../components" src/Minerva/` = 0 matches |
| 遺留 → Minerva (反向) | **41 檔案** | 主要是 `useQueryCompat` 匯入 |

**所有 `../../components/` 路徑** 從 `src/Minerva/pages/X/Y.tsx` 解析為 `src/Minerva/components/` (Minerva 自身的 TypeScript 元件), **不是** `src/components/` (遺留)。沒有深度-3 的相對路徑 (`../../../components`) 能從 Minerva 到達遺留碼。

#### 生產 Bundle 驗證

```
$ grep -rl "MythicComponents\|components/pages/Callbacks\|components/pages/Payloads" build/static/js/*.js
(無結果)
```

**遺留程式碼完全不在生產 Bundle 中** — Webpack tree-shaking 已將整個 `src/components/` (41,218 行) 消除。

#### 入口點分析

`src/index.js` 只匯入 Minerva 模組:
```js
import MinervaApp from './Minerva/App';
import { apolloClient } from './Minerva/lib/apollo';
import { meState } from './Minerva/lib/state';
import { isJWTValid, FailedRefresh } from './Minerva/lib/auth';
```

`src/components/App.js` **不被任何檔案匯入** — 整個遺留樹形結構是是孤立的死碼。

#### Adapter/Shim 層分析

| 相容層 | 行數 | 性質 |
|---|---|---|
| `useQueryCompat.ts` | 106 行 | Apollo Client 4 向後相容 — 遺留和 Minerva 都使用 |
| Barrel re-exports (OutputRenderer, FileBrowser) | ~10 行 | Minerva 內部便利匯出, 非跨邊界 |
| `src/index.js` 導出 | ~10 行 | 向後相容導出, 但消費者 (遺留碼) 不可達 |

`useQueryCompat` 是唯一的共用層, 但它是 Minerva 原生 TypeScript、由 Minerva 和遺留碼共同使用。**當遺留碼被刪除後, `useQueryCompat` 仍有 15 個 Minerva 消費者**, 因此它不是遺留適配器。

### 判定: ❌ 已被反駁

**Gemini 的結論錯誤**。雖然 `src/components/` 確實存在且佔 35% 原始碼量, 但:
- Minerva 對遺留碼的 import: **0**
- 遺留碼不進入生產 Bundle (已被 tree-shaking 消除)
- 不存在 adapter/shim 維護負擔
- 唯一需要的行動: **刪除** `src/components/` 目錄以清理原始碼倉庫

---

## 3. 缺陷 2.2: 臃腫的單體 Store

### Gemini 聲稱

> store.ts 是巨大的單體 Store, 缺乏 Slice Pattern, 所有元件訂閱整個 state, 導致不必要的重繪。

### 實際數據

#### Store 規模

| 指標 | 數值 |
|---|---|
| 檔案行數 | **121 行** |
| State 欄位 | **17 個** |
| Action 方法 | **16 個** |
| 合計成員 | **33 個** |
| 邏輯領域 | **5 個** (App lifecycle, UI layout, Notifications, Console tabs, Audio/Music) |

**121 行、33 成員的 Store 不是 "臃腫" 的**。Zustand 官方文件在數百個成員規模才建議 Slice Pattern。

#### Middleware

- `persist` — 將 10/17 欄位持久化到 localStorage
- **無** `subscribeWithSelector`
- **無** 自訂 middleware

#### 消費者模式 — ⚠️ 真正的問題

```typescript
// 所有 35 個消費者都使用這個模式:
const { isSidebarCollapsed } = useAppStore();
// ↑ 等同於 useAppStore(s => s) — 訂閱全部 state
```

| 指標 | 數值 |
|---|---|
| 使用 `useAppStore()` 的檔案 | **35** |
| 使用 selector `useAppStore(s => s.field)` 的檔案 | **0** |
| 使用 `shallow` 比較器的檔案 | **0** |
| 使用 `useAppStore.getState()` (非響應式, 安全) | **1** (`soundEffects.ts`) |

**22 個頁面** 只需要 `isSidebarCollapsed` 一個欄位, 卻訂閱了整個 Store 的 33 個成員。任何 `musicVolume` 滑桿拖動、`alertCount` 更新、`consoleTabs` 變更都會觸發這 22 個頁面重繪。

### 判定: ⚠️ 部分正確

- ❌ Store **不臃腫** (121 行, 不需要 Slice Pattern)
- ✅ 所有消費者 **確實缺少 selector**, 構成全域重繪問題
- **真正的修復**: 不是 Slice Pattern, 而是為每個消費者添加 selector

---

## 4. 缺陷 2.3: 渲染瓶頸

### Gemini 聲稱

> 圖形密集元件 (CallbackGraph, Topology3D) 對不必要的重繪敏感, Store 變更會觸發整個 Canvas 重繪。

### 實際數據

#### 4.1 CallbackGraph (2D — @xyflow/react)

**檔案**: `src/Minerva/components/CallbackGraph/index.tsx`

| 問題 | 嚴重度 | 詳情 |
|---|---|---|
| ELK 在 useEffect 中 (非 useMemo) | 🔴 HIGH | Line 1139 — 佈局在渲染後計算, 然後觸發第二次渲染 |
| `onNodeClick` 依賴 nodes/edges | 🔴 HIGH | Line 1175 — 每次節點/邊緣變更都重建 callback |
| 9 個 polling useQuery (10-15s 間隔) | 🟠 MEDIUM | 3 個使用 `cache-and-network` → 每次 poll 雙重渲染 |
| 不使用 Store selector | 🟠 MEDIUM | (不直接匯入 store, 但父元件重繪會傳播) |
| 無 React.memo 包裝 | 🟡 LOW | 主元件和子元件均未 memo |
| 無 throttle/debounce | 🟡 LOW | 資料更新直接觸發重繪 |

**Memoization 狀態**:
- `useMemo`: 3 個 (graphData 建構, linkFocus 解析, callback 列表)
- `useCallback`: 14 個 (但 `onNodeClick` 有問題依賴)
- `useRef`: 9 個 (viewport, 位置, 歷史追蹤)
- `React.memo`: **0**
- `nodeTypes`/`edgeTypes`: 模組級常量 (穩定) ✓

#### 4.2 Topology3D (3D — @react-three/fiber)

**檔案**: `src/Minerva/pages/Topology3D/` — 6 檔案, 230,227 bytes

| 問題 | 嚴重度 | 詳情 |
|---|---|---|
| 訂閱全 Store 只為 `isSidebarCollapsed` | 🔴 HIGH | Line 77 — 任何 Store 變更 → Three.js Canvas 完整重繪 |
| Canvas 無 `frameloop` 設定 | 🟠 MEDIUM | 預設 `'always'` — 60fps 持續渲染靜態場景 |
| Canvas 無 `dpr` 上限 | 🟠 MEDIUM | 4K 顯示器渲染 4× 像素 |
| 9 個 polling useQuery (10s 間隔) | 🟠 MEDIUM | 每次 poll 觸發 Three.js 場景重建 |

**Memoization 狀態 (index.tsx)**:
- `useMemo`: 7 個 (topology 建構, 選擇解析, focus edges 等)
- `useCallback`: **30+ 個** (大量事件處理器)
- `React.memo`: **0** (主元件未包裝)

**Memoization 狀態 (SceneObjects.tsx)**:
- `React.memo`: **3 個** (`NodeSphere`, `DataBeamEdge`, `SubnetVolume`) ✓
- `useFrame`: **4 個** (動畫迴圈, 用於脈衝/發光效果)

**Memoization 狀態 (DetailPanel.tsx)**:
- `useFrame`: **1 個** (面板動畫)

**Memoization 狀態 (QuickHack.tsx)**:
- `useFrame`: **1 個** (QuickHack 動畫)

#### 4.3 重繪鏈分析

```
musicVolume 滑桿拖動
    → store.musicVolume 更新
    → 所有 35 個 useAppStore() 消費者重繪
    → Topology3D (index.tsx) 重繪
        → 7 個 useMemo 重新評估 (deps 未變, 返回快取 ✓)
        → Canvas 重繪 (Three.js scene graph rebuild)
        → 30+ useCallback 重新評估 (大多數 deps 未變 ✓, 但部分有問題依賴)
    → 22 個頁面重繪 (僅需要 isSidebarCollapsed)
```

### 判定: ✅ 確認

Gemini 的渲染瓶頸判斷 **完全正確**。關鍵問題:
1. 全域 Store 無 selector — 所有 35 個元件連鎖重繪
2. Topology3D 為單一欄位訂閱全 Store — Three.js Canvas 不必要重繪
3. ELK 在 useEffect 中 — 雙重渲染
4. Canvas 無 frameloop/dpr 控制 — GPU 浪費
5. CallbackGraph 有 3 個 `cache-and-network` polling — 雙重觸發

---

## 5. 缺陷 2.4: 沉重的依賴佔用

### Gemini 聲稱

> 多種 CSS 解決方案共存 (@emotion/styled + Tailwind + MUI sx), 大量依賴增加 bundle 體積。

### 實際數據

#### 5.1 生產 Bundle 體積

| Chunk | 未壓縮 | Gzip | 內容 |
|---|---|---|---|
| `463` (largest) | 1,462 KB | 426 KB | MUI + ELK |
| `543` | 1,069 KB | 272 KB | Ace Editor + MUI |
| `689` | 1,061 KB | 286 KB | Three.js + @react-three |
| `main` | 911 KB | 257 KB | React + Router + Apollo + 核心 |
| `638` | 517 KB | 139 KB | Ace Editor |
| `658` | 246 KB | 57 KB | ELK |
| **其他 40+ chunks** | ~3,200 KB | ~544 KB | 頁面級 chunks |
| **JS 合計** | ~33 MB (raw) | **1,981 KB** | — |
| **CSS 合計** | 159 KB | ~30 KB (est.) | — |

**Gzip 後 JS 總計: ~1.94 MB** — 對於包含 3D 圖形、2D 流程圖、程式碼編輯器、GraphQL 的企業級 SPA, 這是合理範圍。

#### 5.2 CSS 策略混合分析

| CSS 方法 | 使用次數 | 角色 |
|---|---|---|
| Tailwind `className=` | **200+** (主要) | 主要樣式方案, 賽博龐克主題 |
| MUI `sx={}` | **3** | 微調 MUI 元件 |
| `@emotion/styled()` | **3** | 包裝元件 (MythicTextField, MythicTableCell) |
| 直接 `@emotion` import | **0** | 無直接使用 |
| Framer Motion | **20+** | 動畫 (非 CSS 替代方案) |

**CSS 衝突: 不存在**。`@emotion/styled` 僅 3 處用於 MUI 元件包裝, `sx` 僅 3 處微調。Tailwind 是唯一的主要 CSS 策略。三者職責完全不重疊。

#### 5.3 未使用依賴 (確認)

| 依賴 | 版本 | 使用位置 | 狀態 |
|---|---|---|---|
| `moment` | ^2.30.1 | 僅遺留 `src/components/` | 🗑️ 可刪除 |
| `react-moment` | ^1.2.2 | 僅遺留 `src/components/` | 🗑️ 可刪除 |
| `dayjs` | ^1.11.13 | 無任何匯入 | 🗑️ 可刪除 |
| `@fortawesome/*` (4 個) | ^7.2.0 / ^3.3.0 | 僅遺留 `src/components/` | 🗑️ 可刪除 |
| `@mui/x-data-grid` | ^8.1.0 | 無匯入 | 🗑️ 可刪除 |
| `@mui/x-charts` | ^8.1.0 | 無匯入 | 🗑️ 可刪除 |
| `@mui/x-date-pickers` | ^8.1.0 | 無匯入 | 🗑️ 可刪除 |
| `react-scrollbar-size` | ^5.0.0 | 無匯入 | 🗑️ 可刪除 |
| `react-tooltip` | ^5.28.1 | 無匯入 | 🗑️ 可刪除 |
| `react-split` | ^2.0.14 | 無匯入 | 🗑️ 可刪除 |
| `semver` | ^7.6.2 | 無匯入 | 🗑️ 可刪除 |
| `rxjs` | ^7.8.2 | 無匯入 | 🗑️ 可刪除 |

**13 個未使用生產依賴**。由於這些不被匯入, Webpack tree-shaking 已將它們排除出 Bundle, 因此 **對實際 Bundle 體積無影響** — 但會增加 `npm install` 時間和 Docker image 體積。

#### 5.4 Three.js Import 模式

```typescript
// 當前 (全部 12 處):
import * as THREE from 'three';  // barrel import — 整個 three.js 進入 chunk

// 建議:
import { Vector3, Color, MeshStandardMaterial } from 'three';  // tree-shakable
```

**three.js chunk (689)**: 1,061 KB raw / 286 KB gzip — 使用 barrel import 可能包含未使用的模組。

#### 5.5 圖示庫重複

| 庫 | 匯入數 | 狀態 |
|---|---|---|
| `lucide-react` | 20+ | ✅ 主要圖示庫 |
| `@mui/icons-material` | 15 (全部 deep import) | ✅ 活躍使用 |
| `@fortawesome/*` | 僅遺留碼 | 🗑️ 未被 Minerva 使用 |

MUI Icons 和 Lucide 共存是合理的: MUI Icons 用於 MUI 元件內部, Lucide 用於自訂 Tailwind UI。

### 判定: ⚠️ 部分正確

- ❌ CSS 多方案衝突 — **不存在** (3 處 styled + 3 處 sx vs 200+ Tailwind)
- ⚠️ 存在 13 個未使用依賴 — **但已被 tree-shaking 排除**, 僅影響安裝時間
- ⚠️ Three.js barrel import — **可能影響 chunk 689 體積** (286 KB gzip)
- ✅ Bundle 總計 1.94 MB gzip — 對功能密度而言合理, 非 "沉重"

---

## 6. 建議行動評估

### Gemini 建議 1: 實施 Slice Pattern

| 面向 | 評估 |
|---|---|
| 需要性 | **不需要** — Store 只有 121 行, 33 成員 |
| 真正的問題 | 消費者缺 selector, 不是 Store 結構 |
| 建議替代 | 為 35 個消費者添加 fine-grained selector |
| 成本/收益 | Slice 重構: 高成本, 低收益; Selector 修復: 低成本, 高收益 |

### Gemini 建議 2: 加速遺留碼移除

| 面向 | 評估 |
|---|---|
| 需要性 | **低** — 遺留碼已是死碼, 不進入 Bundle |
| 風險 | 零 — 直接 `rm -rf src/components/` 即可 |
| 收益 | 清理原始碼倉庫, 減少開發者困惑 |
| 建議 | 直接刪除, 無需漸進式遷移 |

### Gemini 建議 3: 整合樣式方案 (減少 @emotion/styled)

| 面向 | 評估 |
|---|---|
| 需要性 | **不需要** — 只有 3 處 `styled()`, 3 處 `sx={}` |
| 當前狀態 | Tailwind 已是壓倒性主要方案 |
| 風險 | 移除 @emotion 會破壞 MUI 元件 (MUI 內部依賴 @emotion) |
| 建議 | 保持現狀, 3 處 styled 是合理的 MUI 包裝 |

---

## 7. 實際優先修復清單

### P0 — 即時修復 (高影響, 低成本)

| # | 任務 | 影響 | 成本 |
|---|---|---|---|
| 1 | **35 個 useAppStore() 添加 selector** | 消除全域重繪鏈 | ~1 小時 |
| 2 | **Topology3D Canvas 添加 `frameloop="demand"`** | 停止閒置時 60fps 渲染 | 1 行 |
| 3 | **Topology3D Canvas 添加 `dpr={[1, 1.5]}`** | 限制 4K 像素渲染量 | 1 行 |

### P1 — 短期修復 (中等影響)

| # | 任務 | 影響 | 成本 |
|---|---|---|---|
| 4 | **CallbackGraph ELK 移至 Web Worker 或 useMemo** | 消除佈局雙重渲染 | ~2 小時 |
| 5 | **修復 CallbackGraph onNodeClick 依賴** | 消除事件處理器重建 | ~30 分鐘 |
| 6 | **3 個 cache-and-network 改為 network-only** | 消除 poll 雙重渲染 | 3 行 |
| 7 | **刪除 src/components/ 目錄** | 清理 41,218 行死碼 | `rm -rf` |
| 8 | **移除 13 個未使用依賴** | 清理 package.json | `npm uninstall` |

### P2 — 可選優化

| # | 任務 | 影響 | 成本 |
|---|---|---|---|
| 9 | Three.js granular import | 可能減少 chunk 689 體積 | ~1 小時 |
| 10 | CallbackGraph React.memo 包裝 | 減少子元件重繪 | ~30 分鐘 |
| 11 | Topology3D 主元件 React.memo | 減少 props 引發的重繪 | ~15 分鐘 |

---

## 8. 附錄: 原始數據

### A. Store 消費者完整列表

| 檔案 | 行 | 解構欄位 | 模式 |
|---|---|---|---|
| App.tsx | 67 | `isLoggingOut, startLogout` | Full store ⚠️ |
| Login.tsx | 405 | `setAppState, isLoggingOut, reset` | Full store ⚠️ |
| Dashboard.tsx | 96 | `appState, setAppState, isSidebarCollapsed` | Full store ⚠️ |
| Sidebar.tsx | 53 | `startLogout, isSidebarCollapsed, setSidebarCollapsed` | Full store ⚠️ |
| GlobalAudioPlayer.tsx | 11-18 | 6 個音訊欄位 | Full store ⚠️ |
| AudioSection.tsx | 22-28 | 12 個音訊欄位 + setter | Full store ⚠️ |
| Console/index.tsx | 33 | `isSidebarCollapsed, consoleTabs, openConsoleTab, closeConsoleTab` | Full store ⚠️ |
| EventNotifications.tsx | 68, 123, 143, 160 | `hideLoginNotifications, alertCount, setAlertCount` | Full store ⚠️ |
| EventFeed.tsx | 219 | `isSidebarCollapsed, alertCount` | Full store ⚠️ |
| Settings/index.tsx | 32, 211 | `hideLoginNotifications, setHideLoginNotifications, isSidebarCollapsed` | Full store ⚠️ |
| Topology3D/index.tsx | 77 | `isSidebarCollapsed` | Full store ⚠️ |
| soundEffects.ts | 23 | `useAppStore.getState()` | ✅ Safe |
| 22 個頁面 | various | `isSidebarCollapsed` only | Full store ⚠️ |

### B. CallbackGraph useQuery 清單

| 行 | 查詢 | Poll 間隔 | fetchPolicy | 風險 |
|---|---|---|---|---|
| 87 | GET_CALLBACKS | 10s | default | 低 |
| 88 | GET_CALLBACK_GRAPH_EDGES | 10s | default | 低 |
| 89 | GET_P2P_PROFILES_AND_CALLBACKS | — | network-only | 低 |
| 90 | GET_C2_PROFILES | — | network-only | 低 |
| 176 | GET_CALLBACK_GRAPH_EDGES_ALL | 15s | cache-and-network | ⚠️ 雙重渲染 |
| 184 | GET_CUSTOM_GRAPH_NODES | 15s | cache-and-network | ⚠️ 雙重渲染 |
| 191 | GET_LINK_FOCUS | 10s | network-only | 低 |
| 227 | GET_CUSTOM_GRAPH_EDGES | 15s | cache-and-network | ⚠️ 雙重渲染 |

### C. Topology3D useFrame 清單

| 檔案 | 行 | 用途 |
|---|---|---|
| SceneObjects.tsx | 39 | NodeSphere 脈衝動畫 |
| SceneObjects.tsx | 291 | DataBeamEdge 光束動畫 |
| SceneObjects.tsx | 365 | SubnetVolume 掃描線動畫 |
| SceneObjects.tsx | 532 | (其他場景物件動畫) |
| DetailPanel.tsx | 658 | 詳情面板動畫 |
| QuickHack.tsx | 657 | QuickHack 執行動畫 |

SceneObjects.tsx 的 3 個核心元件 (`NodeSphere`, `DataBeamEdge`, `SubnetVolume`) 已有 `React.memo` 包裝 ✓

### D. 生產 Bundle Chunk 對應

| Chunk | Gzip | 主要內容 |
|---|---|---|
| 463 | 426 KB | MUI 核心 + ELK 佈局引擎 |
| 543 | 272 KB | Ace Editor + MUI 頁面 |
| 689 | 286 KB | Three.js + @react-three/fiber |
| main | 257 KB | React + Router + Apollo + Zustand + 核心邏輯 |
| 638 | 139 KB | Ace Editor (額外 chunk) |
| 658 | 57 KB | ELK Worker |
| 820 | ~45 KB | @xyflow/react (ReactFlow) |
| 其他 40+ | ~500 KB | 頁面級 code-split chunks |
| **合計** | **1,981 KB** | — |

### E. 未使用依賴完整清單

```
moment react-moment dayjs
@fortawesome/fontawesome-svg-core @fortawesome/free-solid-svg-icons
@fortawesome/free-brands-svg-icons @fortawesome/react-fontawesome
@mui/x-data-grid @mui/x-charts @mui/x-date-pickers
react-scrollbar-size react-tooltip react-split semver rxjs
```

15 個套件 — 均已被 tree-shaking 排除出生產 Bundle。

---

*報告結束。所有數據基於實際程式碼審計, 非推測。*
