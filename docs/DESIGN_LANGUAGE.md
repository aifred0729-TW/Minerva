# Minerva 設計語言 —「先進極簡」(Advanced Minimalist)

本文件記錄 Minerva UI 的統一設計風格,用來確保每一個新畫面都跟既有元件視覺
一致。這個風格落在「精準命令列工具」與「沉穩現代 Web App」之間,核心感受是
**平滑、克制、技術感 — 而不是硬核 Cyberpunk HUD。**

---

## 快速提示 — 可直接貼進 prompt 的摘要

> 請以 **Minerva 先進極簡 (advanced-minimalist) 設計語言** 來設計:
> 黑白冷色調搭配亮紅、亮黃、亮藍;文字只用純白
> (禁止黑底淡白字);柔和 `rounded-md` 圓角;`signal/20~40` 細邊框、
> hover 時加亮;留白充裕、內容滿版面;mono 大寫字 + 寬字距用於 labels;
> 漸進式多階段 wizard,搭配必填欄位驗證與即時結果預覽;內部捲動容器
> 確保頁面 chrome 固定不動;複雜選擇器配側邊預覽面板;以圖示為主的
> 資訊卡片 (icon + 標題 + 數量 + 簡短描述)。**避免:** 硬核 HUD 裝飾
> (clip-path 切角、L 形角落 ticks、`[01]/[CODE]` 編號徽章、括號標記、
> hex 位址)、飽和色、淡白色 `text-signal/X` 灰字、整頁捲動、過大的
> 居中彈出視窗。
>
> **兩種尺度,情境而定:**
> - **Wizard / 設定畫面 (寬鬆尺度):** 標題 `text-2xl`、內文 `text-sm`、
>   tile padding `p-4`、generous 留白。範例:CreateMsfPayloadEmbed。
> - **資料面板 / Console 解析輸出 (緊湊尺度):** 實體標題 `text-sm` (14px)、
>   表格 row `text-[11px]`、chip label `text-[10px]`、卡片 padding
>   `px-3 py-2`、tone-coded inline 計數條。範例:NetSharesPanel /
>   NetDcListPanel。**這才是真正的 Minerva 先進極簡密度** — 每一像素都
>   要為 operator 的 triage 服務,不留白白養字。

---

## 1. 配色 (Tailwind tokens)

| Token | 用途 | 出現位置 |
|---|---|---|
| `bg-void` / `bg-black` | 主要背景 | 頁面底色、面板底色 |
| `bg-black/30~50` | 次要背景 | 卡片、清單背景 |
| `bg-machine` (或 `bg-machine/40`) | 提升層級的 chrome | Header、Footer、橫幅 |
| `text-signal` | **所有主要文字** | Labels、內文、資料 |
| `text-accent` | Active / live / 存活訊號 | 選取、RUNNING、連結 |
| `border-signal/15~20` | 靜止邊框 | 預設 tile、分隔線 |
| `border-signal/40~60` | Hover / focus 邊框 | Hover 狀態 |
| `border-signal` | 重要分隔 (少用) | Header 底線、Footer 頂線 |
| `border-accent` | Active 邊框 | 選中 tile、主要按鈕 |
| `bg-accent/[0.06]~/10` | Active 表面染色 | 選中態背景 |
| `text-red-500` | **僅限** 死亡 / 破壞性動作 | DEAD callback、刪除動作 |
| `text-amber-400` | **僅限** 必填但未填的提示 | 驗證提示 |

### 文字對比鐵則 (不可妥協)
**絕對禁止** 在深色背景上使用 `text-signal/30…/70`。每一個靜態文字元素都必須是
純 `text-signal` (白) 或語意色 (accent / red-400 / amber-400 / purple-400 等)。
淡白色在黑底上會讀成灰色,這是被禁止的。

非文字的裝飾性元素 (分隔線、hover bg 染色、狀態小點) **可以** 使用透明度 —
那不算「文字配底色」。例如:`hover:bg-signal/5`、`bg-accent/10`、
`bg-signal/[0.03]` 用在表面是 OK 的;`text-signal/50` 用在文字上不行。

**唯一例外 (資料面板 inline label-value pair):**
在「label + value」緊湊配對裡,label 端可以用 `opacity-70`,**前提是** 同一行
的 value 端必須是 `font-bold` 純 `text-signal` 或語意色的主視覺。例如:
```jsx
<span className="text-signal opacity-70">domain</span>
<span className="font-bold text-signal">{value}</span>
```
這個寫法 operator 已驗證過,因為視覺主角是 bold value,opacity label 只
是 inline 引導不會被誤讀為主內容。**只准用在 inline pair**,不准單獨拿
opacity-70 標一段獨立文字。

---

## 2. 文字排版

- **字體家族**: 技術 labels、資料、計數、徽章一律 `font-mono`。
  內文敘述可用 sans,但 UI 大部分元素是 mono。
- **大小寫**: section labels 和徽章用 `uppercase`。
- **字距**: 寬字距是 signature:
  - Section labels: `tracking-[0.25em]` 到 `tracking-[0.3em]`
  - Tile 標題: `tracking-[0.18em]` 到 `tracking-[0.2em]`
  - Chip labels: `tracking-[0.15em]`
- **字重**: `font-bold` 只用在 labels/標題,內文不要用。
- **字級** (按情境分兩種尺度):

  **(A) Wizard / 設定畫面尺度 (寬鬆)** — wizard step、modal、payload builder
  - 頁面 step 標題: `text-2xl font-bold tracking-[0.15em]`
  - Section label: `text-sm font-bold tracking-[0.3em]`
  - Tile 標題: `text-base font-bold tracking-[0.2em]`
  - 內文 / 描述: `text-xs` (12px) 或 `text-[11px]`
  - 膠囊 / 徽章: `text-[10px] tracking-[0.2em]`

  **(B) 資料面板 / Console 解析輸出尺度 (緊湊)** — 每筆資料密度高、operator
  快速 triage,字要小但仍可讀:
  - 實體 / 卡片標題 (host / DC name / module): `text-sm font-bold` (14px)
  - Section label / 列頭 (LABEL): `text-[10px] tracking-wider uppercase`
  - 表格 row 內文: `text-[11px]`
  - inline label-value 對 / OS 行: `text-[11px]`,label 端 `opacity-70`,
    value 端 `font-bold` (這是 chip 框外少數允許的 opacity)
  - 計數 / chip label: `text-[10px] font-bold tracking-wider uppercase`
  - 圖示對齊文字大小: 一律 10~14px,以 `strokeWidth={2}` 維持精緻感

  **共通:** 表格式數字永遠 `tabular-nums`。重要計數仍可 `padStart(2, '0')`
  zero-pad,但資料面板的小型計數 (`{count} readable`) 可直接整數即可。

### 數字顯示
重要計數用 zero-pad:`count.toString().padStart(3, '0')`。
資訊性的數字用一般整數即可。永遠 `tabular-nums`。

---

## 3. 形狀與層次

- **圓角**: 預設 `rounded-md` (6px)。部分 chrome 可保持直角。
  **不要在一般 UI 用 clip-path 切角** — 切角是 `LINK_TO_PARENT`
  面板的專屬 signature,只有那一個地方能用。
- **邊框**: 1px (`border`)。避免 `border-2`。
- **陰影 / 光暈**: 輕柔。
  - Active tile 光暈: `shadow-[0_0_14px_rgba(34,197,94,0.20)]`
  - Result 橫幅: `shadow-[0_0_18px_rgba(34,197,94,0.18)]`
  - 不要用厚重的 `shadow-2xl` 或 `inset 0 0 16px` 內凹光環。
- **一般 tile 上不要放 L 形角落 ticks、不要放掃描線疊層、不要放
  括號裝飾 (`[ … ]`)**。這些是 LINK_TO_PARENT HUD 風格的專屬元素。

---

## 4. 版面配置

### 頁面 chrome 必須固定不動
- 頁首、tab bar、step indicator、footer nav **永遠** 可見。
- 內部清單在自己的容器內捲動:`max-h-[55vh] overflow-y-auto
  cyber-scrollbar pr-2` (依密度選 `[50vh]` / `[60vh]`)。
- 用視窗相對的 `vh` 高度,**不要** 固定 `px`,版面才能回應視窗大小。
- **永遠不要** 讓一個 step 的內容把整個 wizard 撐到滾動。每個 step
  自己處理內部捲動區。

### 內容滿版面
- Wizard 步驟 **不要用 `max-w-5xl mx-auto`** 限制寬度。父容器的
  `p-6` padding 已經提供足夠的留白。
- 網格欄數會自適應:`grid-cols-1 md:grid-cols-3` (或 `lg:grid-cols-4`)。
- 複雜選擇器搭配預覽面板時,用 `grid lg:grid-cols-3 gap-4`,
  清單佔 `lg:col-span-2`,預覽面板佔 `lg:col-span-1`。

### 間距
- 垂直節奏: `space-y-3` (緊湊)、`space-y-4` (預設)、
  `space-y-6` / `space-y-8` (主要區塊之間)。
- Padding: tiles 用 `p-4`、sub-frame 用 `p-3`~`p-4`、清單列用
  `px-4 py-3`。

---

## 5. 元件模式

### Step intro (每個 wizard step 的頂部)

```
STEP 03 / 05                             ← text-[11px] tracking-[0.3em] text-signal/80
MODULE                                   ← text-2xl font-bold tracking-[0.15em] text-signal
Pick a specific payload module. 47 …     ← text-sm text-signal/90 (附註:亮 bg 上 "/90" 可以,深 bg 上請用純 text-signal)
```

### Section header (step 內部)

```
LABEL ─────────── hint text                              [✓ SET]  or  [● REQUIRED]
```
- 底線: `pb-1.5 border-b border-signal/15` (required 但未填時改用
  `border-amber-400/40`)。
- 右側狀態: 已填 `[✓ SET]` (accent 綠) / 未填 `[● REQUIRED]` (amber)。

### Card 式可選 tile (例如 STAGING、KIND、CONNECTION)

```
┌───────────────────────────────────┐
│  ┌─────┐               COUNT      │  ← icon 在柔和的子框 (rounded-md, bg-signal/5 或 bg-accent/15)
│  │ ▣   │                47        │
│  └─────┘               MODULES    │  ← text-[9px] tracking-[0.25em] text-signal/70
│                                   │
│  STAGED                           │  ← text-base font-bold tracking-[0.2em]
│                                   │
│  Smaller dropper, fetches stage   │  ← text-xs text-signal/85 (亮 bg 上可接受;compact 時加 line-clamp-2)
│  from listener at runtime.        │
└───────────────────────────────────┘
```
Active 狀態: `border-accent bg-accent/[0.06]` + 輕微光暈 + 右上角小脈動點
(`h-1.5 w-1.5 rounded-full bg-accent animate-pulse`)。
Hover: `border-signal/50 bg-black/50`。

### Chip (緊湊型選擇器 — ARCH / PROTOCOL)

```
[ x64  ·  32 ]
```
- `inline-flex items-center gap-2 px-3 py-2 rounded-md border font-mono text-sm tracking-[0.15em]`
- 靜止: `border-signal/20`
- Active: `border-accent bg-accent/10 text-accent font-bold`

### Result 橫幅 (filter step 底部的即時預覽)

```
●  MATCHES  47  modules will be available on the next step
```
- 上方分隔線 (`border-t border-signal/15 pt-3`)
- 脈動 accent 點
- Label `text-sm tracking-[0.25em] text-signal/80`
- 計數 `text-2xl font-bold tabular-nums leading-none`
- 結尾描述 `text-xs text-signal/85`

### Filter breadcrumb (多步驟篩選後的回顧)

```
FILTERS:  [Windows]  [STAGED]  [METERPRETER]  [REVERSE]  [TCP]  [X64]
```
- Label `text-xs tracking-[0.25em] text-signal/80`
- 膠囊: `border px-2 py-1 rounded` — KIND/CONNECTION 用 accent 膠囊,
  OS/PROTOCOL/ARCH 用 signal 膠囊。

### Type Selector Sidebar (左側類別切換)

當頁面要在多種「種類」之間切換 (像 Metasploit 的 exploit / auxiliary / post /
evasion) — 用左側的「反相切換」垂直 sidebar。每種類別配自己的高彩度色,
active 時 **整塊反相** (色彩變背景、黑字壓在上面),inactive 時只是彩色文字。

```
┌─ MODULE TYPE ────┐
│                  │
│ ▣ EXPLOITS       │  ← inactive: text-red-400, border-transparent
│   1862           │
│                  │
│ ▣▣ AUXILIARY ▣▣  │  ← active: bg-yellow-500 text-black font-bold (整塊反相)
│ ▣▣ 1247       ▣▣ │
│                  │
│ ▣ POST           │  ← inactive: text-purple-400
│   422            │
│                  │
│ ▣ EVASION        │  ← inactive: text-orange-400
│   12             │
│                  │
└──────────────────┘
```

**Sidebar 容器:**
- `w-48 shrink-0 border-r border-ghost/20 flex flex-col`
- 頂部小標籤: `text-[9px] font-mono text-zinc-300 uppercase tracking-[0.2em] px-4 py-3`

**每個 tab button:**
- Layout: `w-full flex items-center gap-3 px-3 py-3 text-left border border-transparent`
- Active: `bg-{color}-500 text-black font-bold` — 整個 button 都被填滿
- Inactive: `bg-transparent text-{color}-400 hover:border-{color}-400/70`
- 內部: icon (18px) + 一個垂直堆疊 (`label` text-[11px] font-bold tracking-wider + `count` text-[9px] tabular-nums)
- 過渡: `transition-all duration-200`

**標準色彩配置** (依語意,不要隨便換):
| 類別 | Inactive 色 | Active 背景 |
|---|---|---|
| Exploit / 攻擊性 | `text-red-400` | `bg-red-500` |
| Auxiliary / 偵察 | `text-yellow-400` | `bg-yellow-500` |
| Post / 後滲透 | `text-purple-400` | `bg-purple-500` |
| Evasion / 規避 | `text-orange-400` | `bg-orange-500` |
| Recon / 資訊收集 | `text-cyan-400` | `bg-cyan-500` |
| Brute / 暴力 | `text-pink-400` | `bg-pink-500` |

**何時使用這個 pattern:**
- 頁面分成 4~6 個並列「類別」,每類資料量大,使用者會頻繁切換
- 每類有自己的語意色 (像 exploit 紅、auxiliary 黃),色彩本身傳達意義
- 切換後右側內容會大幅變化 (不只是 filter)

**反例 (不要這樣用):**
- 只有 2~3 個選項 → 用 chip 或 tile 即可
- 純粹當 filter (右側內容形態不變) → 用 SmoothChip
- 沒有語意色差別 → 用統一的 signal/accent 配色

**右側內容** 跟隨 sidebar 的色彩取一點點 hint (例如標題文字用對應色),
但主體仍遵守平滑極簡規範 — 不要讓右側也變得很「彩色」,色彩只在 sidebar
與「目前類別」標籤上出現。

### 側邊預覽面板 (MODULE step 的右欄)

```
┌──────────────────────┐
│ ┌──┐  SELECTED       │
│ │WIN│  windows/...   │
│ └──┘                 │
│ ─────────────────── │
│ PROFILE              │
│ [STAGED] [METER…]    │
│                      │
│ TRANSPORT            │
│ [REVERSE] [TCP] [X64]│
│ ─────────────────── │
│ CLASSIFIER           │
│ Platform  windows    │
│ Stage     meterpreter│
│ …                    │
│ ─────────────────── │
│ ▸ Next: configure…   │
└──────────────────────┘
```
- 堆疊順序: header (icon + label + path) → 徽章列 → classifier 表 → 下一步提示。
- 空狀態: 虛線邊框 + 佔位 icon + 「Pick a module to see classification…」。

### 動作按鈕 (Footer NEXT / BACK / CREATE)

- Ghost: `border border-signal/40 px-4 py-1.5 text-xs tracking-[0.25em]
  font-bold text-signal hover:bg-signal/10 rounded`
- Primary: `border border-accent bg-accent text-void px-5 py-1.5
  font-bold` (footer 的 NEXT 不加 rounded — 對齊既有風格)
- Disabled: `border-ghost/30 text-signal/70 cursor-not-allowed opacity-50`
  搭配按鈕左側一個 amber 色的 `[● Pick: X + Y]` 提示。

### 資料面板 (Data Panel — Console 解析輸出 / 列表型資料)

這是 **真正的 Minerva 先進極簡風** 用在 Console 解析輸出、Operations 列表、
Topology 細節面板等高密度資料情境的標準寫法。先呈現摘要 (tone-coded
inline strip),再呈現分類 chip + dense row,operator 一眼即可 triage。

**外殼 — `OutputPanel` wrapper** (沿用,維持與其他 parsed renderer 視覺
連續性):
```
┌─ ⇄ NET SHARES · IT-DEV ─────────── [04] ─┐
│  👁 03 readable  🔒 02 admin  ⇄ 04 total │  ← summary strip
│  ─────────────────────────────────────  │
│  SHARE     HOST     TYPE      ACCESS …  │  ← column header
│  🔒 ADMIN$ IT-DEV   ADMIN·Res 👁 READ   │  ← row (text-[11px])
│  🔒 C$     IT-DEV   ADMIN·Res 👁 READ   │
│  💽 Docs   IT-DEV   DISK·Disk 👁 READ   │
│  🌐 IPC$   IT-DEV   IPC·Res   ⊘ NONE    │
└──────────────────────────────────────────┘
```

**Summary strip (inline 計數條)**
- 容器: `flex items-center gap-3 px-2 py-1 font-mono text-[11px] uppercase tracking-wider text-signal`
- 每筆: `flex items-center gap-1.5` + tone-coded **整段** 著色 (icon + 數字 + label 同色),**不要** 套 chip 邊框 (那是 wizard 尺度的寫法)。
- Tone 對應 (依語意,不要隨便換):
  - 危險 / 高價值目標 → `text-red-400`
  - 一般可讀 / 正常項 → `text-accent`
  - 重要警示 (GC / SYSTEM) → `text-amber-400`
  - 範圍類 (forest / 命名空間) → `text-purple-400`
  - 總計 / 中性 → `text-signal`
- 圖示: 10~11px,inline 對齊。

**列頭 (Table column header)**
```
text-[10px] tracking-wider uppercase text-signal
border-b border-signal/15
grid 自訂欄寬: gridTemplateColumns: 'minmax(0,13rem) minmax(0,9rem) 9rem 5.5rem minmax(0,1fr)'
```

**Row**
- `grid gap-x-3 px-2 py-1.5 items-center font-mono text-[11px]`
- Hover: `hover:bg-signal/[0.04]` (極淡)
- Row 分隔線: `border-t border-signal/10` (比 wizard 的 /15 更淡 — 高密度
  下 row divider 不該搶戲)
- 首行不加上邊線 (`i > 0 && 'border-t border-signal/10'`)

**Category chip — 緊湊尺度** (取代 wizard 的 SmoothChip)
```
font-mono text-[10px] font-bold tracking-wider uppercase
rounded-sm border px-1.5 py-0.5 w-fit
```
Tone 對應 (依語意,沿用 type-selector sidebar 同一張表):
| 語意 | className |
|---|---|
| 攻擊性 / 危險 (ADMIN 共用、Exploit) | `border-red-500/40    bg-red-500/10    text-red-400` |
| 偵察 / 一般可讀 (DISK 共用、Recon) | `border-accent/40     bg-accent/10     text-accent` |
| 後滲透 / 範圍 (IPC 共用、Post)     | `border-purple-500/40 bg-purple-500/10 text-purple-400` |
| 警示 / 高價值 (GC、Required)       | `border-amber-400/40  bg-amber-400/10  text-amber-400` |
| 規避 (Evasion)                     | `border-orange-500/40 bg-orange-500/10 text-orange-400` |
| 中性 (Other)                       | `border-signal/30     bg-signal/[0.04] text-signal` |

Chip 可串接附加文字 (`ADMIN · Reserved · IPC`)、必要時 `truncate`。
Chip 內可放 8~10px 的 lucide icon (`strokeWidth={2}`)。

**Inline label-value 對 — 卡片內欄位**
卡片內不使用 wizard 的 2-col `FieldRow` grid,而是 inline flex pair:
```jsx
<span className="flex items-center gap-1.5">
    <span className="text-signal opacity-70">domain</span>
    <span className="font-bold text-signal">{value}</span>
</span>
```
- Label 端 `opacity-70` 是資料面板 **特准的例外** (不算「黑底淡白字」,因為
  pair 內 value 端是純白 bold 主視覺,label 只是輔助)。
- Pair 之間用 `<span className="text-signal opacity-40">·</span>` 分隔。
- 整行 `text-[11px] font-mono`,top margin `mt-1.5`。

**緊湊卡片 (Stacked entity card — 例如 DC list)**
```
rounded-sm border border-signal/15  (or border-amber-400/30 等 tone-coded)
bg-black/40 px-3 py-2
hover:bg-signal/[0.04]
space-y-1.5 between sections inside (header → crumb → chips → footer)
```
- 卡片標題: `text-sm font-bold` (14px) + tone-coded icon
- 重要徽章 (GLOBAL CATALOG / SYSTEM 等) 放在 header 右側,**chip 尺度** (上表)
- 內部 section 間用 `mt-1` 或 `mt-1.5`,**不要** 用 wizard 的 `space-y-3/4`
- 卡片之間用 `space-y-1.5` (列表型) 而非 wizard 的 `space-y-4`

**何時使用緊湊尺度 vs 寬鬆尺度**
- **緊湊 (這節):** Console parsed output、Operations 列表、Callbacks 表、
  3D Topology 細節面板、QuickHack overlay。每筆資料是 operator 要 triage
  的事實,不是要慢慢讀的文案。
- **寬鬆 (Section 5 前面):** Wizard step、modal、payload builder、設定畫面。
  資訊量低、每筆有教學意義 (描述 + 預覽),可以呼吸。

---

## 6. 互動模式

- **必填選項強制推進。** Wizard step 中的每個頂層 facet 都必須選擇
  才能 NEXT。未填的 section 標 amber `[● REQUIRED]`,已填標
  白色 `[✓ SET]`。
- **每個 step 都有即時預覽:** 顯示「47 modules match」式的計數,
  使用者切換 facet 時即時更新。
- **漸進式揭露。** 複雜選擇器拆成 3~5 個 wizard step;每個 step 問
  一兩個相關問題。不要把所有 filter 塞在同一頁。
- **Hover affordance:** 邊框加亮 (`signal/20 → signal/50`)、
  bg 變化 (`black/30 → black/50`),不要做 scale 跳動。
- **Active 狀態:** 右上角小型 `accent` 脈動點 + accent 邊框 +
  accent bg 染色。不要疊好幾層光暈喧賓奪主。
- **內部捲動,不是頁面捲動:** 任何可能溢出的清單都自己有
  `max-h-[55vh] overflow-y-auto`。頁面 chrome 永遠不動。

---

## 7. 圖示系統

- 工具 / 動作 / 意圖用 **Lucide icons** (`lucide-react`):
  Cpu、Terminal、Zap、Server、Package、Layers、ArrowLeftRight、Network、
  Radar、Play、Search、Settings、Rocket、Check、X、ChevronRight…
- 平台用 **Mythic 既有的 OS icons** — `WinIcon`、`TuxIcon`、
  `AppleIcon`、`AndroidIcon`、`ChromeIcon`,定義在
  `pages/Callbacks/utils.tsx`。CallbackGraph 和 Callbacks 頁面
  已經在用 — 在新元件裡重用以保持視覺連續性。
- Lucide icons 在 tile 中 `strokeWidth={1.6}`~`2` (比預設稍細,更精緻)。
- 尺寸: tile 圖示 22~28px、內聯圖示 14~18px、徽章圖示 11~13px。

---

## 8. 反模式 — 禁止使用

這些是我試過、operator 拒絕的風格。除非使用者明確要求,否則任何新
Minerva 畫面都不要採用。

1. **黑底淡白字** (`text-signal/30…/70` 用在深色背景) — 禁用。
   *唯一例外:* 資料面板 inline label-value pair 的 label 端可 `opacity-70`,
   詳見 Section 1 的文字對比鐵則。
2. **硬核 HUD 裝飾:** clip-path 切角 tile、每個 tile 上的 L 形角落 ticks、
   `[01]` 編號徽章、`[STG-001]` / `// 0x0042` 技術代碼徽章、icon
   子框上的內部 micro corner ticks、`[ … ]` 括號式 section labels、
   掃描線疊層。
   *例外:* LINK_TO_PARENT 面板 (Section 9) 與 Help broadcast overlay
   (`HelpPanel.tsx`) 允許有限度使用。
3. **過度飽和色:** cyan-500、fuchsia-500、rose-500、sky-400 等 -500 級色。
   *資料面板 chip 允許* `red-400` / `accent` / `purple-400` / `amber-400` /
   `orange-400` / `pink-400` 等 -400 級語意色 (依 Section 5「資料面板」表),
   但只用於分類 chip / 高價值警示,不用於大塊面積。
4. **頁面層級捲動** — 只用內部捲動容器。
5. **`max-w-5xl mx-auto` 內容寬度限制** 用在 wizard step 上 — 用滿版。
6. **inline 場景用居中彈出 modal** — 內嵌的 anchored panel 優先
   (參考 `LINK_TO_PARENT` 模式)。
7. **所有 filter 塞在同一頁的牆面** — 拆成 wizard step。
8. **單行 tile 撐不滿頁面顯得空蕩** (wizard 尺度) — 合併相關選擇到同一頁,
   **或** 用描述 + 預覽填滿頁面。
9. **資料面板用 wizard 的寬鬆尺度** — Console 解析輸出、列表型資料,
   `text-base` 標題 + `p-4` tile + `space-y-4` 卡片間距會浪費版面、稀釋
   triage 速度。一律用 Section 5「資料面板」緊湊尺度。
10. **沉重的陰影 / blur 堆疊** — 一層柔光暈足矣。
11. **`border-2` 粗邊框** — 1px (`border`) 是規矩。
12. **任何地方用預設的 `text-gray-X`** — 用 Minerva palette。

---

## 9. 唯一例外 — LINK_TO_PARENT 面板

CallbackGraph + Topology3D 裡釘在 node 右側的 `LINK_TO_PARENT` 面板
**刻意** 使用較「大聲」的 HUD 風格:
- 右下切角 clip-path (`PANEL_CHAMFER`)
- 朝向 node 那側的 L 形角落 ticks
- ARMED 式脈動徽章
- 反相 ID 區塊 (`bg-signal text-void`)

這是 **唯一** 容許使用這些裝飾的地方。其他所有 UI 都遵守上面的平滑極簡規則。

---

## 10. 程式碼參考實作

### Wizard / 寬鬆尺度
- **PROFILE / TRANSPORT step (寬鬆尺度正典):**
  `src/Minerva/pages/Payloads/CreateMsfPayloadEmbed.tsx` — `SmoothSection`、
  `SmoothTile`、`SmoothChip`、`StepIntro`、`ResultLine`、`ModulePreviewPane`。

### 資料面板 / 緊湊尺度 (Minerva 先進極簡正典)
- **解析輸出表 — `net_shares`:**
  `src/Minerva/components/OutputRenderer/parsed.tsx` 中的 `NetSharesPanel`。
  示範:`SHARE_TIER_META` 語意色表、緊湊 grid row (`py-1.5 text-[11px]`)、
  category chip + 串接 type 字串、READ/NONE access chip、inline summary strip。
- **解析輸出卡片 — `net_dclist`:**
  同檔的 `NetDcListPanel`。示範:stacked entity card (`rounded-sm border
  px-3 py-2`)、tone-coded 卡片標題 (`text-sm`)、inline label-value 對
  (`opacity-70` label + `font-bold` value)、IP chip 列、OS footer 行、
  GC 高價值警示 (amber tone)。
- **Operations 列表:**
  `src/Minerva/pages/Metasploit/Operations.tsx` 中的 `Running Jobs` 區段
  + `KindChip` + `ParamChip` (exploit/auxiliary/post/evasion 語意色)。

### HUD 例外
- **LINK_TO_PARENT 面板 (大聲 HUD 例外):**
  `src/Minerva/components/CallbackGraph/GraphModals.tsx` 與共用的
  `src/Minerva/components/LinkPanel/linkPanelParts.tsx`。
- **Help Broadcast overlay (有限度 HUD,僅限 Help 彈窗):**
  `src/Minerva/pages/Console/HelpPanel.tsx` — 掃描線 streak deploy +
  corner ticks。**不要** 推廣到其他 modal。

### 共通
- **OS icons (Mythic 原生):** `src/Minerva/pages/Callbacks/utils.tsx`。
- **既有 payload 清單:** `src/Minerva/pages/Payloads/PayloadsListView.tsx`。

### 不確定時的決策樹
- 設計的東西是 **wizard / 設定畫面 / 教學流程** → 看 `CreateMsfPayloadEmbed`,
  跟 SmoothTile / SmoothChip / SmoothSection 三件套。
- 設計的東西是 **資料面板 / 列表 / Console 解析輸出 / triage view** →
  看 `NetSharesPanel` + `NetDcListPanel`,跟 summary strip + category chip
  + inline label-value 三件套。**這才是真正的 Minerva 先進極簡密度。**
