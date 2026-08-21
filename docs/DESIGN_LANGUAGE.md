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
> **三種尺度,情境而定:**
> - **Wizard / 設定畫面 (寬鬆尺度):** 標題 `text-2xl`、內文 `text-sm`、
>   tile padding `p-4`、generous 留白。範例:CreateMsfPayloadEmbed。
> - **資料面板 / Console 解析輸出 (緊湊尺度):** 實體標題 `text-sm` (14px)、
>   表格 row `text-[11px]`、chip label `text-[10px]`、卡片 padding
>   `px-3 py-2`、tone-coded inline 計數條。範例:NetSharesPanel /
>   NetDcListPanel。**這才是真正的 Minerva 先進極簡密度** — 每一像素都
>   要為 operator 的 triage 服務,不留白白養字。
> - **螢幕框 (Screen Frame 尺度):** 登入 / 開機 / 交接畫面。整個視窗是
>   一台儀器 — 四角固定 chrome (`text-[10px]`) + 一塊停靠的面板
>   (header strip / body / footer strip) + 活的 canvas 背板,面板內用
>   點導引檢查列與 7px 進度導軌敘事。範例:`pages/Login/`。詳見
>   Section 6、Section 7 (過場編排)。**只准用在未登入的畫面。**

---

## 1. 配色 (Tailwind tokens)

| Token | 用途 | 出現位置 |
|---|---|---|
| `bg-void` / `bg-black` | 主要背景 | 頁面底色、面板底色 |
| `bg-black/30~50` | 次要背景 | 卡片、清單背景 |
| `bg-machine` (或 `bg-machine/40`) | 提升層級的 chrome | Header、Footer、橫幅 |
| `text-signal` | **所有主要文字** | Labels、內文、資料 |
| `text-accent` | Active / live / 存活訊號 (亮綠 `74 222 128`) | 選取、RUNNING、連結 |
| `border-signal/15~20` | 靜止邊框 | 預設 tile、分隔線 |
| `border-signal/40~60` | Hover / focus 邊框 | Hover 狀態 |
| `border-signal` | 重要分隔 (少用) | Header 底線、Footer 頂線 |
| `border-accent` | Active 邊框 | 選中 tile、主要按鈕 |
| `bg-accent/[0.06]~/10` | Active 表面染色 | 選中態背景 |
| `text-red-500` | **僅限** 死亡 / 破壞性動作 | DEAD callback、刪除動作 |
| `text-amber-400` | **僅限** 必填但未填的提示 | 驗證提示 |

### 綠色鐵則 — 禁止墨綠 (不可妥協)

`accent` 是 **亮綠 `74 222 128` (green-400)**,不是 green-500。理由:這個
console 其他每一個語意色都站在 `-400` 亮度階 — `amber-400`、`red-400`、
`purple-400`,連登入 HUD 的 `#84D9FF` / `#FFC92E` 也是。accent 過去停在
green-500,比全體暗一階;而細的 mono 字在純黑上會被 antialiasing 拉暗,
量到的實際像素只有 `rgb(28,166,79)` — 那讀起來是墨綠,不是活著的訊號。

**單一來源:** `src/Minerva/index.css` 的 `--color-accent`,以及
`components/BattleMode.tsx` 的 `DARK_ACCENT`。BattleMode 在掛載時會把變數
寫回 `documentElement`,所以 **兩邊必須寫同一個值**,只改 CSS 沒有用。

**低透明度的色塊 = 該色的墨版。禁止。**
純黑底上,`bg-accent/10` 合成出來是 `rgb(7,22,13)`,`border-accent/40` 是
`rgb(30,89,51)` — 這兩個數字不是任何人挑的顏色,是 alpha 對色相做的事。
所以:

| 要表達 | 寫法 |
|---|---|
| chip / tile 的色調 | 邊框與文字 **滿強度** (`border-accent` + `text-accent`),底色用 **無彩** 的 `bg-signal/[0.05]` |
| 選中 / 開啟態 | 整塊反相 `bg-accent text-void`(滿強度亮綠 + 黑字) |
| 進度點、狀態點 | `bg-accent` 滿填,或完全不填只留框 — 不准 `bg-accent/60` |
| hover 染色 | 用無彩的 `hover:bg-signal/10`,不要 `hover:bg-accent/10` |

唯一允許的 accent alpha 是 **solid primary 按鈕的 hover**
(`bg-accent` → `hover:bg-accent/85`),因為它疊在自己的亮綠底上,不是疊在黑底。

同一條規則套用在 `amber-400` / `red-400` / `purple-400` 的 chip 尺度上
(見 `components/Instrument.tsx` 與 `pages/Payloads/components.tsx` 的
`CHIP_TONE`):色相走邊框與文字,底色永遠無彩。

---

### 登入畫面 HUD 色系 (明列例外)

登入畫面 (`pages/Login/` + `components/LoginBackdrop.tsx`) **不使用** 上表的
`accent` 綠,改用一組三色 HUD 色系。這是刻意的例外,不是疏漏。
(這個畫面的**結構**與**過場**語言見 Section 6 與 Section 7。)

| Token | 值 | 職責 |
|---|---|---|
| `hud-field` | `255 58 52` 亮紅 | 螢幕基底 — 像素層、格線、`+` 校準點陣、背光 |
| `hud-route` | `255 201 46` 亮黃 | 被聚焦的航路與其標籤、主要 CTA |
| `hud-trace` | `132 217 255` 淺藍 | HUD 儀器 — reticle、距離環、掃描線、副線、輸入框 focus |

單一來源定義在 `src/Minerva/index.css` 的 `--color-hud-*`,Tailwind token 與
canvas 背板 (`getComputedStyle`) 都從那裡取值,兩者不會漂移。

**這個例外的邊界:**
- **僅限登入畫面。** 其他任何畫面都不准用這三個 token。
- 上表 `text-red-500` 僅限死亡/破壞性、`text-amber-400` 僅限必填未填的規定
  **在登入畫面以外完全不變**。登入畫面的紅與黃是裝飾性圖像的色彩,不承載那些
  語意,所以不衝突。
- 登入畫面內若要表達真正的錯誤態 (例如 `ServerStatus` 的 OFFLINE、登入失敗
  橫幅),仍然用 `text-red-400` 語意色,不要用 `hud-field`。
- 調整亮度時要記得:紅與淺藍的相對亮度分別約為白色的 0.39 與 0.83,同樣的
  alpha 會比白色暗,不能直接沿用為白色調好的數值。

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
  **不要在一般 UI 用 clip-path 切角** — 切角只屬於 `LINK_TO_PARENT`
  面板 (Section 11) 與歡迎畫面的權限卡 (Section 6),其他地方一律不准。
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

### 主導覽軌 (Console Nav Rail — 全域左側軌)

跟上面的「Type Selector Sidebar」是兩件不同的東西:那個是頁面內的類別
切換器,這個是 **整個 console 的左緣** (`components/Sidebar.tsx`)。它是
Login 停靠面板 (Section 6) 轉成垂直的版本,也是 Dashboard 頂部 instrument
rail 的同一台機器 — header strip / body / footer strips,同一組 token。

```
┌─ [M] MINERVA              [«] ─┐  ← header strip · h-16 (對齊頁面 h-16 頁首)
│                                │
│   ▣ DASHBOARD                  │  ← inactive: 純 text-signal + font-medium
│   ███ CALLBACKS ██████████████ │  ← active: bg-signal text-void (整列反相)
│   ▣ CONSOLE                    │
│   …                            │
├────────────────────────────────┤
│  MODE                          │  ← LABEL 尺度
│  ┌────────┬────────┬────────┐  │
│  │ NORMAL │ RECON  │ COMBAT │  │  ← 單一互斥值 = 單一 segmented control
│  └────────┴────────┴────────┘  │
├────────────────────────────────┤
│  ◐ operator            [☀][⏻] │  ← footer strip
│    ● ONLINE                    │
└────────────────────────────────┘
```

**規則:**
- **寬度是契約:** 展開 `w-64` / 收合 `w-16`。全站有 30+ 處頁面用
  `ml-64` / `ml-16` 對齊,改寬度等於改全站版面。
- **外框:** `border-r border-signal/20 bg-void`。**不要** `border-ghost/30`、
  不要寫死的 rgba 光暈 (`signal` 是主題 token,寫死的 cyan 陰影跟不了淺色主題)。
- **Active = 整列反相** (`bg-signal text-void`),跟 Dashboard 的 perspective
  segmented control 同一個理由:「我在哪一頁」必須是軌上最大聲的事實,而且
  反相在灰階與各種色盲下都成立,色塊染色不成立。
- **Inactive 是純 `text-signal` + `font-medium`**,靠字重與反相拉出層級,
  **不准**用 `text-gray-400/500` 或 `text-signal/60` 讓 25 個目標看起來全是停用。
- **模式列:** `mode` 是單一互斥值 (`normal|recon|combat`),所以是一個
  segmented control,不是三顆各自為政的 toggle。NORMAL (常駐狀態) 用安靜的
  active (`bg-signal/10`),RECON / COMBAT 才整格反相成自己的語意色 —
  **反相格用 `text-black`,不是 `text-void`** (淺色主題的 void 近白,壓在
  amber 上會消失)。
- **無障礙 (收合軌是純圖示,這幾條是硬性的):**
  - 每個收合狀態的控制項都要 `aria-label`;`title` 不算 accessible name。
  - 目前路由用 `aria-current="page"` 標記,不能只靠顏色。
  - focus ring 一律 `focus-visible:ring-2 ring-inset ring-signal` —
    軌是 `overflow-hidden`,外擴的 ring 會被裁掉。
  - 收合軌的命中區 44×44 (`h-11 w-11`),展開列 `min-h-[44px]`;
    次要方形圖示鈕維持 32px (`h-8 w-8`,跟 Dashboard rail 的圖示鈕同尺寸)。
- **狀態要誠實:** footer 的 ONLINE/OFFLINE 綁 `navigator.onLine`,
  不准寫死。狀態一律用 `StatusWord` (字 + 點),不是裸的彩色點。

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

## 6. 螢幕框 (Screen Frame) — 登入 / 開機 / 交接畫面

第三種尺度,只用在 **operator 還沒進入 console 之前** 的畫面:開機序列、
登入表單、握手、歡迎畫面 (`src/Minerva/pages/Login/`)。

前兩種尺度是「一頁 App 畫面」;這一種是 **一台儀器**。整個視窗就是機器的
面板:四個角是永遠不動的儀表 chrome,中間停一塊做事的面板,底下是一片
活著的玻璃。它之所以獨立成一節,是因為它的密度 (`text-[10px]` 起跳)、
它的敘事責任 (每一步都要說自己在做什麼),以及它被允許的裝飾,都跟登入後
的任何畫面不同。

### 何時使用

- ✅ 未登入畫面:開機、登入、握手、歡迎、登出動畫。
- ❌ 其他一律不用。登入後的畫面回去用 wizard / 資料面板尺度。
  螢幕框的四角 chrome、點導引、hex dump 外溢到 console 就變成
  Section 10 明文禁止的硬核 HUD。

### 螢幕邊緣 chrome (四角)

畫面四角是固定儀表,**永遠不隨內容改變位置**,只有數值會跳。桌機才顯示
(`hidden md:block`),小螢幕把狀態收進面板內。

```
MINERVA C2  OPERATOR CONSOLE                    NODE mythic.local   ● ONLINE
                                                                              ← top-6 / left-6 · right-6

                              ┌─────────────────┐
                              │   停靠的面板     │
                              └─────────────────┘

⊕ PORT 7443   🔒 HTTPS                            17:04:22   BUILD 2.1.2
                                                                              ← bottom-6 / left-6 · right-6
```

- 容器: `pointer-events-none absolute inset-0 hidden md:block`
- 每一格: `text-[10px] font-bold tracking-[0.2em]~[0.3em]`,數值 `tabular-nums`
- 圖示 10~14px `strokeWidth={2}`;主機名一律 `truncate max-w-[22ch]`
- 群組間距 `gap-5`~`gap-6`,圖示與文字 `gap-2`~`gap-2.5`
- **同一組 chrome 必須在所有 view 之間逐字相同。** 登入表單與握手畫面共用
  同一份四角,才會讀成「同一台機器換了畫面」而不是「兩張不同的圖」。

### 停靠面板 (Docked Panel)

面板 **靠右停** (`lg:justify-end px-6 lg:pr-[8vw]`),把背板左側的動作區讓
出來;窄螢幕才置中。三段式結構,三段都是必需的:

```
┌─ ⊙ SECURE TERMINAL ──────────────────── SL-8 01 ─┐  ← header strip
│                                                   │
│  IDENTIFY                                         │  ← text-2xl font-bold tracking-[0.15em]
│  OPERATOR AUTHENTICATION REQUIRED                 │  ← text-[11px] tracking-[0.15em] opacity-70
│                                                   │
│  OPERATOR ID                                      │  ← text-[10px] font-bold tracking-[0.25em]
│  > ______________________________                 │
│                                                   │
│  [ INITIALIZE SESSION              › ]            │
│                                                   │
├───────────────────────────────────────────────────┤  ← footer strip
│  AUTHORIZED OPERATORS ONLY                TLS 1.3 │
└───────────────────────────────────────────────────┘
```

| 部位 | className |
|---|---|
| 外框 | `w-full max-w-[420px] border border-signal/20 bg-void/80 backdrop-blur-sm rounded-md` |
| Header strip | `flex items-center justify-between gap-3 px-5 py-2.5 border-b border-signal/15` |
| Body | `p-5 sm:p-6` |
| Footer strip | `flex items-center justify-between gap-3 px-5 py-2.5 border-t border-signal/15` |

- Header 左端: 11~13px 圖示 (`hud-trace` 或狀態色) + `text-[10px] font-bold
  tracking-[0.25em]`;右端一個短徽章。左端說「這是什麼」,右端說「現在如何」。
- 同一條流程裡不同 view 的面板 **停在同一個位置**,寬度可以差一點
  (420 → 460),但不能換邊、不能換對齊 — 換了就會跳。
- `backdrop-blur-sm` 是這個面板的 signature:它必須看得見底下的玻璃在動。
  **因此它的任何祖先都不准留下 resting `filter`** (連 `blur(0px)` 都會讓它
  變成 backdrop root,背板就沒東西可取樣了) — 見 Section 7。

### 輸入列

```jsx
<div className="relative">
    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 …">{'>'}</span>
    <input className="w-full min-h-[44px] rounded-md border border-signal/20 bg-black/40
        pl-9 pr-3 py-2.5 text-sm tracking-[0.1em] text-signal transition-colors
        placeholder:text-signal/40 hover:border-signal/40
        focus:border-hud-trace focus:outline-none focus-visible:ring-1 focus-visible:ring-hud-trace" />
</div>
```
- 觸控目標 `min-h-[44px]`,按鈕 `min-h-[48px]` — 螢幕框再小的字,命中區也不縮。
- Focus 一律走 `hud-trace` (淺藍),那是這個畫面的「儀器」色。
- 前導記號:文字欄用 `>` 字符,密語欄用 `Lock` 圖示,兩者都 `left-3` 對齊。

### 主要 CTA

- 靜止: `border-hud-route bg-hud-route/[0.08] text-hud-route`
- Hover: `bg-hud-route text-void` + `shadow-[0_0_18px_rgba(255,201,46,0.25)]` (一層,就一層)
- 送出中: `border-signal/20 bg-transparent text-signal opacity-60 cursor-not-allowed`,
  文字換成進行式 (`AUTHENTICATING`) + 旋轉圖示
- 版型: `text-[11px] font-bold tracking-[0.25em] transition-all duration-200`

### 點導引檢查列 (Dotted-leader checklist)

多步驟工作的標準敘事單位。**label 靠左、狀態靠右、中間用點填滿** — 這是
螢幕框的招牌句型,不要換成 bullet 或 chip。

```
SERVER_CONNECTION .................................... OK
TLS_HANDSHAKE ........................................ OK
VERIFYING_CREDENTIALS ............................. CHECKING
ESTABLISHING_SESSION ............................... PENDING
```

```jsx
<span className="text-signal whitespace-nowrap">{label}</span>
<span aria-hidden="true" className="flex-1 min-w-0 overflow-hidden text-signal opacity-25 tracking-[0.3em]">......</span>
<span className="shrink-0 font-bold tracking-[0.15em] {tone}">{status}</span>
```

| 狀態 | Tone |
|---|---|
| `OK` | `text-hud-trace` |
| `CHECKING` | `text-hud-route` |
| `FAIL` | `text-red-400` (語意紅,**不是** `hud-field`) |
| `PENDING` | `text-signal opacity-40` |

- 整份清單 `aria-live="polite"`,逐項進場 `delay: i * 0.06`。
- 點導引本身是裝飾,一定要 `aria-hidden`。

### 進度導軌 (Progress rail)

7px 高、外框內縮 2px 的雙層條。**外框先畫,填充在裡面跑** — 不要用單層
`bg` 條,雙層是這個畫面的形狀 signature。

```jsx
<div className="border border-signal/40 p-[2px] rounded-sm">
    <div className="relative h-[7px] overflow-hidden">
        <motion.div className="absolute inset-y-0 left-0 bg-hud-trace"
            animate={{ width: pct }} transition={{ duration: 0.8, ease: [0, 0, 0.2, 1] }} />
    </div>
</div>
```
- 緩動一律純減速 `[0, 0, 0.2, 1]`:導軌是**抵達**每一階段,不是等速跑完。
- 失敗 / 終止時整條換成 `bg-red-400`,同時 header 徽章、footer 狀態行一起換。

### 「第幾步」是強制的

進度只說「忙碌中」是不合格的。導軌旁必須有一個 `STEP n / m` 讀數
(`text-[10px] font-bold tracking-[0.2em] tabular-nums`),而且 **同一個畫面的
標題、徽章、導軌、狀態行必須由同一份衍生狀態算出來**:

```jsx
const linkTitle  = terminating ? 'TERMINATING SESSION' : stage === 'FAILED' ? 'LINK REJECTED' : …;
const linkBadge  = terminating ? 'CLOSING'  : stage === 'FAILED' ? 'DENIED' : …;
const linkTone   = stage === 'FAILED' || terminating ? 'text-red-400' : 'text-hud-trace';
```
各自寫一次 `if` 的話,四個地方遲早會互相矛盾 — operator 會看到
「LINK ESTABLISHED / DENIED」這種畫面。

### 開機畫面 = 分幕,不是 spinner

開機序列 (`BootSequence.tsx`) 是有**幕**的:每一幕換掉畫面上的資訊種類,而
不只是把數字加大。

| 幕 | 畫面 | 狀態文字 |
|---|---|---|
| `link` | 注意標記 + 打字進來的標題 + 滾動的記憶體位址 micro log | `LOADING n%` |
| `loaded` | 標記退場、品牌標籤接位、點流 | `LOADED` |
| `compute` | 子系統清單面板從狀態框上緣展開,逐項 CHECKING → READY | `COMPUTING n%` |
| `dissolve` | 邊框轉虛線、內容逐群淡出 | (空) |

- 上半段固定高度 (`h-[248px]`),**狀態框永遠不位移**。幕在換,框不動。
- 這裡的裝飾 (hex 位址、`0x` dump、5~7px 微字) 是刻意的機器質感,
  **只有開機畫面能用**。
- 開機畫面是 **未上主題的黑白畫面** (`bg-black text-white`):它在 console
  的配色系統起來之前就存在。這是它唯一被容許脫離 palette 的理由。

### 反相揭開 (歡迎畫面)

`WelcomeScreen.tsx` 的高對比轉換,做法是刻意的,照抄不要改:

- **同一份 layout 渲染兩次疊起來**,深色一份在下、淺色一份在上,
  上面那份用 `clip-path: inset(0 100% 0 0)` → `inset(0 0% 0 0)` 從左揭開。
- **不要 cross-fade 兩個不同的層** — 那會讓整塊面板在中途閃掉。用同一份
  layout 疊放,揭開的邊掃過誰,誰就從此高對比,沒有任何東西消失過。
- 揭開前先跑一道 **右往左** 的掃掠 (26% 寬的漸層,0.3s linear),再左往右
  揭開。方向相反是重點,同向會看起來像同一個東西跑了兩次。
- 兩份 copy 的狀態必須來自同一個 parent state,不能各自持有 —— 差一幀就穿幫。
- 這個畫面 **刻意沒有進度條**:工作在它出現之前就做完了,擺一條進度會
  讓它讀成「又在載入」。

### 螢幕框的明列例外

登入畫面鬆綁了 Section 10 的幾條禁令。跟 Section 1 的色彩例外一樣,
這是刻意的,**邊界一樣嚴**:

| 一般禁令 | 螢幕框的鬆綁 | 邊界 |
|---|---|---|
| 掃描線疊層 | 允許 (`repeating-linear-gradient`,alpha ≤ 0.02) | 只在全螢幕背板/歡迎畫面,不在面板內 |
| hex 代碼 / `0x` dump / 微字 (5~7px) | 允許 | **只有開機畫面** |
| 反相區塊 (`bg-signal text-void`) | 允許 | 只在歡迎畫面的 header/footer 條 |
| clip-path 切角 | 允許 | 只在歡迎畫面的權限卡 |
| 文字用 opacity | 四角 chrome 的次要標籤與點導引可用 `opacity-25~70` | 面板內的**資料**仍須純 `text-signal`;`hud-*` 三色不受此鬆綁保護 |

以上任何一條外溢到登入後的畫面,都算違規。

---

## 7. 過場編排 (Transition Choreography)

**鐵則:畫面之間永遠不准有硬切。** 每一次 view 交替都必須有一段兩者同時
存在的時間。這一節是 operator 驗收過的那條登入鏈的規則化 —
開機 → 登入 → 握手 → 歡迎 → console。

### 五條規則

**1. 重疊,不是接力。**
`AnimatePresence mode="wait"` 在定義上禁止重疊 — 舊的必須完全消失,新的才
准開始。全螢幕的幕 (開機序列這種) 因此 **不能** 待在 `mode="wait"` 的 view
switch 裡,要自己一個 `AnimatePresence`,靠 `z-50` 壓在上面淡出,底下的新
畫面同時淡入。

```jsx
<AnimatePresence mode="wait">{/* view switch:表單 ↔ 握手 */}</AnimatePresence>

<AnimatePresence>{/* 全螢幕的幕,自己一層,才能跟上面交叉 */}
    {viewMode === 'INTRO' && <IntroSequence key="intro" … />}
</AnimatePresence>
```

**2. 幕是「散開」,不是「關掉」。**
全螢幕覆蓋物離場要分層,由輕到重:內容先浮起模糊 (0.3s) → 邊緣 chrome
(0.24s) → 底色最後 (0.52s)。整塊一起 `opacity: 0` 會讀成關電源。

**3. 交接前先暖機。**
會被看到的東西,要在**還看不到的時候**就先掛起來:
- 重的 canvas 背板在幕開始散開時就掛載 (約 1 秒暖機),不要等交接那一刻。
- code-split 的目的地 route,在動畫開始時就 `import()` 預熱 — 否則交接
  完馬上閃一個 Suspense fallback,前面鋪的所有陳都白費。

**4. 換 route 要有 curtain。**
`navigate()` 會在同一個 commit 卸載整個來源 route,**它自己 render 的任何
東西都不可能蓋住這次交換**,`exit` 動畫一幀都拿不到。要跨 route 的過場,
覆蓋物必須掛在 `<Routes>` 外面 (`SessionCurtain.tsx`),由 store 的短暫旗標
驅動,並且:
- 先 hold 一段 (260ms) 讓目的地掛載繪製完,再拉開 (540ms);
- 旗標必須是 transient (排除在 `persist` 的 `partialize` 外),重整不能留下
  一塊關著的簾幕;
- `pointer-events-none` — 動畫萬一沒收尾,它也不准吃掉 operator 的點擊。

**5. 用畫面上已經有的東西收尾。**
歡迎畫面用它自己的上下兩條 bar 當快門關上,curtain 再從那道接縫拉開。
關門與開門是同一個動作,中間藏著一次換頁 — 而不是兩張畫面在接縫處相遇。
不要為了轉場憑空生出一個新元素。

### 緩動 tokens

| 用途 | cubic-bezier | 感覺 |
|---|---|---|
| 面板落定 | `[0.22, 0.68, 0, 1]` | 快進、長尾收束 (面板、輸入區進場) |
| 內容抽離 / 拉開 | `[0.22, 1, 0.36, 1]` | 強減速 (curtain 拉開、大字進場) |
| 機構開合 | `[0.76, 0, 0.24, 1]` | 兩端急、中段快 (快門、面板展開、反相揭開) |
| 導軌抵達 | `[0, 0, 0.2, 1]` | 純減速 — 「到站」而不是等速跑 |
| 幕的交叉淡出 | `[0.4, 0, 0.2, 1]` | 對稱,不搶戲 |
| 離場加速 | `[0.4, 0, 1, 1]` | 純加速 — 東西被抽走 |
| 實體釋放 | `spring stiffness 420 damping 14` | **只用在實體隱喻** (鎖扣彈開),不要拿來做一般 UI |

### 時長

| 層級 | 時長 |
|---|---|
| 全螢幕幕的清除 | 500~540ms |
| 面板進場 / 離場 | 550ms (delay 220ms) / 250~350ms |
| 快門關 / 開 | 200ms / 540ms |
| 反相揭開 wipe | 380ms |
| 進度導軌移動 | 800ms |
| 清單逐項 stagger | 60ms |
| inline 元素 (錯誤橫幅、chip、串流列) | 180~250ms |

**規矩:離場永遠比進場短** (東西離開要果斷,抵達可以從容)。全螢幕級
≥ 500ms、面板級 300~550ms、inline 級 ≤ 250ms。所有時長集中定義在
`pages/Login/timings.ts`,不要散在 JSX 裡。

### 效能與正確性守則

這幾條都是踩過才寫下來的,每一條都對應一個真的會壞的畫面:

- **動 transform,不動 layout。** 用 `scaleY` 不用 `height`、用 `x` 不用
  `left`、用 `scale`+`opacity` 不用 `letterSpacing` — 後者每一幀都 relayout。
- **進場不要留 resting `filter`。** `animate` 裡寫 `filter: 'blur(0px)'` 會在
  元素上留下 inline filter,它就變成 backdrop root,子孫的 `backdrop-blur`
  從此取樣不到背板。blur 只准出現在 `exit` (反正要走了)。
- **元件定義在 module scope,不要寫在 render body 裡。** 在 render 裡宣告的
  component 每次 render 都是新的 type,React 會整棵 unmount/remount,所有
  進場動畫在每次 state 改變時重跑 —— 那正是畫面看起來在抖的原因。
- **一個 prop 一個表達式。** 把第二個物件展開進 `animate` 會靜默蓋掉第一個,
  順便吃掉進場動畫。條件要寫成三元式,不是兩個 `animate`。
- **多秒的 `await` 鏈要有 `aliveRef`。** 握手與登出是多秒序列,元件卸載後
  它們還會跑完,鏈尾的 `reset()` 會把接手畫面的 store 清掉。每一段 sleep
  之後都要檢查自己還活著。
- **背板只淡入淡出,絕不重掛。** 換 view 時重新掛載背板會讓它的場景時鐘
  歸零、動作切在半途。要淡出就包一層只做 opacity 的 wrapper,裡面的元件
  從頭到尾同一個 instance。

### 無障礙

- 進行中的面板: `role="status"` + `aria-busy`,狀態清單 `aria-live="polite"`。
- 純裝飾的動態物 (點導引、背板、掃描線、封包流) 一律 `aria-hidden="true"`。
- 錯誤橫幅 `role="alert"`,輸入框以 `aria-invalid` + `aria-describedby` 指向它。

---

## 8. 互動模式

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

## 9. 圖示系統

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

## 10. 反模式 — 禁止使用

這些是我試過、operator 拒絕的風格。除非使用者明確要求,否則任何新
Minerva 畫面都不要採用。

1. **黑底淡白字** (`text-signal/30…/70` 用在深色背景) — 禁用。
   *例外:* 資料面板 inline label-value pair 的 label 端可 `opacity-70`
   (詳見 Section 1 的文字對比鐵則);螢幕框的四角 chrome 次要標籤與點導引
   (詳見 Section 6 的明列例外表)。
2. **硬核 HUD 裝飾:** clip-path 切角 tile、每個 tile 上的 L 形角落 ticks、
   `[01]` 編號徽章、`[STG-001]` / `// 0x0042` 技術代碼徽章、icon
   子框上的內部 micro corner ticks、`[ … ]` 括號式 section labels、
   掃描線疊層。
   *例外:* 螢幕框畫面 (Section 6,
   `hex dump` 與掃描線各有自己的邊界) 與 Help broadcast overlay
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
    *例外:* 過場的離場動畫可以帶一段 blur (Section 7),但只准在 `exit`,
    不准留在靜止狀態。
11. **`border-2` 粗邊框** — 1px (`border`) 是規矩。
12. **任何地方用預設的 `text-gray-X`** — 用 Minerva palette。
    *唯一例外:* 開機序列 (`BootSequence.tsx`) 是未上主題的黑白畫面,
    它在 palette 起來之前就存在 (Section 6)。**不要**拿這條當藉口
    在其他畫面用 `text-gray-X`。
13. **畫面之間硬切** — 任何 view / route 交替都必須有重疊的過場,
    詳見 Section 7。`AnimatePresence mode="wait"` 裡塞全螢幕的幕、
    `navigate()` 之後才想蓋東西,都是這條的典型犯法方式。

---

## 11. 浮動面板 (Floating Panels) — 右鍵選單 / LINK_TO_PARENT / QuickHack

所有浮在畫面上的面板 — 3D 右鍵選單、LINK_TO_PARENT、QuickHack 選單 —
共用同一套語彙,定義在 `components/CyberPanel.tsx`:

- **外殼**: `rounded-md border border-signal/20 bg-void/80 backdrop-blur-sm`
  (Section 6 停靠面板的 popover 尺度) — header strip / body / footer strip。
- **列**: 靜止就是控制項 — `rounded-sm` + 1px 邊框 + 極淡填色;hover 提亮
  邊框、focus 畫出同色 ring。純文字列不是按鈕。
- **右緣**: 有狀態才放 chip (`ON` / `LOCKED` / `ALIVE` / `ARMED`);純動作
  列平常留空,hover 時滑出 `›`。動詞 chip (`EDIT` / `TASK` / `RUN`) 禁用 —
  跟左邊標籤重複。
- **色調**: `default` 白 / `active` accent / `danger` red-400 / `muted`。
  `hud-*` 三色仍然只准用在登入畫面 (Section 1)。
- **Cyberpunk 配額只有兩樣,而且都是動態的**: 面板落定時掃過 header 的一道
  光束、hover/focus 時左緣落下的 2px 瞄準條。靜止狀態不加任何額外裝飾。
- **鍵盤**: ↑↓/Home/End 巡覽、Esc / Tab 關閉、面板開啟時自己接焦點。
- 不可逆的動作 (刪除自訂節點) 要 **兩段式**: 第一下武裝、第二下才執行,
  4 秒或失焦自動解除。

**已廢止:** 舊版 LINK_TO_PARENT 的「大聲 HUD」例外 (clip-path 切角、L 形
角落 ticks、反相 ID 區塊、疊層光暈) 已經全部移除。登入後的 UI 現在沒有任何
畫面可以用那組裝飾;唯一保留有限度 HUD 的是 Help broadcast overlay
(`pages/Console/HelpPanel.tsx`)。

## 12. 程式碼參考實作

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

### 螢幕框 / 過場 (Section 6 + 7 的正典)
- **停靠面板、四角 chrome、點導引檢查列、進度導軌、衍生狀態:**
  `src/Minerva/pages/Login/index.tsx` — 登入表單 view 與握手 view 共用
  同一份四角 chrome 與同一個停靠位置;`linkTitle` / `linkBadge` /
  `linkTone` / `linkPercent` 是「同一份衍生狀態」的寫法示範。
- **分幕開機序列 + 分層離場:** `src/Minerva/pages/Login/BootSequence.tsx` —
  `link` → `loaded` → `compute` → `dissolve` 四幕、固定高度的上半段、
  `onDissolve` 提前暖機背板、根層 veil 與內容/chrome 各自的 `exit`。
- **反相揭開 + 實體隱喻:** `src/Minerva/pages/Login/WelcomeScreen.tsx` —
  疊兩份同 layout 用 clip-path 揭開、右往左掃掠、`PermissionLock` 的
  LOCKED → BREACHING → RELEASED、module-scope 的 `WelcomePanel`
  (為什麼不能寫在 render body 裡,檔案裡有註解)。
- **跨 route 的 curtain:** `src/Minerva/components/SessionCurtain.tsx`
  (掛在 `App.tsx` 的 `<Routes>` 外面) + `store.ts` 的 `sessionOpening`
  transient 旗標。
- **活的 canvas 背板 (含效能契約):** `src/Minerva/components/LoginBackdrop.tsx`。
- **所有時長的單一來源:** `src/Minerva/pages/Login/timings.ts`。

### 浮動面板 (Section 11 的正典)
- **面板套件:** `src/Minerva/components/CyberPanel.tsx` — `PanelShell` /
  `PanelGroup` / `PanelRow` / `PanelChip` / `PanelPrimary` / `PanelSegment` /
  `useAnchoredPanel`。
- **消費端:** `pages/Topology3D/DetailPanel.tsx` (右鍵選單)、
  `components/LinkPanel/linkPanelParts.tsx` + `CallbackGraph/GraphModals.tsx`
  + `pages/Topology3D/Topology3DModals.tsx` (LINK_TO_PARENT)、
  `pages/Topology3D/QuickHack.tsx` (QuickHack 選單)。
- **Help Broadcast overlay (有限度 HUD,僅限 Help 彈窗):**
  `src/Minerva/pages/Console/HelpPanel.tsx` — 掃描線 streak deploy +
  corner ticks。**不要** 推廣到其他 modal。

### Console chrome
- **主導覽軌 (全域左側軌):** `src/Minerva/components/Sidebar.tsx` —
  header strip / nav / mode strip / operator strip、反相 active 列、
  收合軌的 44px 命中區與 `aria-label` / `aria-current` 寫法。
- **頂部 instrument rail + 面板套件:** `src/Minerva/pages/Dashboard.tsx`
  的 sticky `<header>` 與 `src/Minerva/components/Instrument.tsx`
  (`InstrumentPanel` / `StatusWord` / `Rail` / `Readout` / `TYPE` / `LABEL`)。

### 共通
- **OS icons (Mythic 原生):** `src/Minerva/pages/Callbacks/utils.tsx`。
- **既有 payload 清單:** `src/Minerva/pages/Payloads/PayloadsListView.tsx`。

### 不確定時的決策樹
- 設計的東西是 **wizard / 設定畫面 / 教學流程** → 看 `CreateMsfPayloadEmbed`,
  跟 SmoothTile / SmoothChip / SmoothSection 三件套。
- 設計的東西是 **資料面板 / 列表 / Console 解析輸出 / triage view** →
  看 `NetSharesPanel` + `NetDcListPanel`,跟 summary strip + category chip
  + inline label-value 三件套。**這才是真正的 Minerva 先進極簡密度。**
- 設計的東西是 **未登入畫面 (開機 / 登入 / 交接)** → 看 `pages/Login/`,
  跟四角 chrome + 停靠面板 + 點導引檢查列三件套 (Section 6)。
- 在做 **任何畫面之間的切換** (view switch、全螢幕覆蓋、換 route) →
  先讀 Section 7。硬切是 Section 10 的反模式第 13 條。
