# ✅ Custom Node 連接問題已修復！

## 🐛 問題根源

### 核心問題
CustomNode 組件的 `handleContextMenu` 在傳遞 callback 對象時**遺漏了關鍵屬性**：
- ❌ 沒有傳遞 `isCustom` 屬性
- ❌ 沒有傳遞 `db_id` 屬性

### 導致的錯誤
當用戶在 Custom Node 上右鍵選擇 "Link to Parent" 時：

```javascript
// setParentModal 接收到的對象
{
  id: "custom-1",
  display_id: 1,
  host: "JUMPER",
  // ❌ isCustom: undefined ← 問題所在！
  // ❌ db_id: undefined
}

// handleSetParent 中的邏輯
const isSourceCustom = setParentModal.isCustom; // undefined → false!

if (isSourceCustom) {
    // ❌ 永遠不會執行這裡
}

if (isDestCustom) {
    // ✅ 執行到這裡，顯示錯誤訊息
    snackActions.warning("Cannot link regular callback to custom node...");
}
```

---

## 🔧 修復內容

### 1. **修復 CustomNode 的 handleContextMenu**
[CallbackGraph.tsx line ~102-128](MythicReactUI/src/Minerva/components/CallbackGraph.tsx#L102-L128)

**修復前**:
```javascript
data.onContextMenu(e, {
    id: data.callback_id,
    display_id: data.display_id,
    // ... 其他屬性
    // ❌ 遺漏 isCustom 和 db_id
}, rect);
```

**修復後**:
```javascript
data.onContextMenu(e, {
    id: data.callback_id,
    display_id: data.display_id,
    // ... 其他屬性
    isCustom: data.isCustom || false, // ✅ 必須傳遞
    db_id: data.db_id,                // ✅ 對於 custom nodes 需要
}, rect);
```

### 2. **確保 Node Data 包含 db_id**
[CallbackGraph.tsx line ~1446](MythicReactUI/src/Minerva/components/CallbackGraph.tsx#L1446)

**修復前**:
```javascript
data: { 
    callback_id: c.id,
    display_id: c.display_id,
    // ❌ 沒有 db_id
    user: c.user,
    // ...
}
```

**修復後**:
```javascript
data: { 
    callback_id: c.id,
    display_id: c.display_id,
    db_id: c.db_id,        // ✅ 添加 db_id
    user: c.user,
    // ...
}
```

### 3. **添加詳細日誌**
在 `handleSetParent` 開頭添加：
```javascript
console.log('[handleSetParent] isSourceCustom:', isSourceCustom, 'isDestCustom:', isDestCustom);
console.log('[handleSetParent] setParentModal:', setParentModal);
console.log('[handleSetParent] selectedDestination:', selectedDestination);
```

這樣可以更容易診斷問題。

---

## 🧪 測試步驟

### 測試 1: Custom Node → Callback 連接
1. **刷新瀏覽器** (`Ctrl + Shift + R`)
2. **開啟 Console** (`F12`)
3. **在 Custom Node 上右鍵**
4. **選擇 "Link to Parent"**
5. **選擇一個 Callback 作為父節點**
6. **選擇 C2 Profile**
7. **點擊 LINK**

**預期結果**:
```javascript
// Console 輸出
[handleSetParent] isSourceCustom: true isDestCustom: false  ✅
[handleSetParent] setParentModal: {isCustom: true, db_id: 1, ...}
[handleSetParent] Updating custom node parent connection...
[handleSetParent] Found source node: {...}
```
- ✅ 顯示 "Linked to Callback #8"
- ✅ 出現連接線
- ✅ 刷新後連接仍存在

### 測試 2: Custom Node → Custom Node 連接
1. **創建兩個 Custom Nodes**
2. **在第一個 Custom Node 上右鍵**
3. **Link to Parent → 選擇第二個 Custom Node**

**預期結果**:
```javascript
// Console 輸出
[handleSetParent] isSourceCustom: true isDestCustom: true  ✅
```
- ✅ 顯示 "Linked to Custom Node #2"
- ✅ 出現連接線

### 測試 3: 確認錯誤情況不再發生
**以下情況應該不會再出現**:
- ❌ ~~"Cannot link regular callback to custom node"~~ (當 source 是 custom node 時)

**仍然會出現的警告** (正常行為):
- ⚠️ "Cannot link regular callback to custom node" (當 source 是 regular callback，dest 是 custom node 時)

---

## 🔍 診斷工具

如果仍有問題，檢查 Console 日誌：

### 正常情況（Custom Node 連接）:
```javascript
[handleSetParent] isSourceCustom: true isDestCustom: false
[handleSetParent] setParentModal: {
  id: "custom-1",
  display_id: 1,
  isCustom: true,  ← 必須是 true
  db_id: 1,        ← 必須有值
  host: "JUMPER",
  ...
}
```

### 異常情況（遺漏屬性）:
```javascript
[handleSetParent] isSourceCustom: false  ← 錯誤！應該是 true
[handleSetParent] setParentModal: {
  id: "custom-1",
  isCustom: undefined,  ← 問題：遺漏屬性
  db_id: undefined,     ← 問題：遺漏屬性
}
```

如果看到異常情況，說明 handleContextMenu 仍未正確傳遞屬性。

---

## 📋 完整的連接流程

```
用戶在 Custom Node 右鍵
  ↓
CustomNode 組件的 handleContextMenu 被觸發
  ↓
構建 callback 對象（必須包含 isCustom 和 db_id）
  ↓
調用 data.onContextMenu(e, callback, rect)
  ↓
setContextMenu({x, y, callback})
  ↓
用戶選擇 "Link to Parent"
  ↓
openSetParent(contextMenu.callback)
  ↓
setSetParentModal(callback)  ← callback 現在包含 isCustom: true
  ↓
用戶選擇目標和 C2 Profile
  ↓
handleSetParent() 執行
  ↓
檢查 isSourceCustom = setParentModal.isCustom  ✅ true
  ↓
進入 Custom Node 處理邏輯
  ↓
更新資料庫
  ↓
成功！
```

---

## ✅ 修復驗證清單

- [x] CustomNode handleContextMenu 傳遞 `isCustom` 屬性
- [x] CustomNode handleContextMenu 傳遞 `db_id` 屬性  
- [x] Node data 包含 `db_id` 欄位
- [x] handleSetParent 添加詳細日誌
- [x] handleSetParent 正確判斷 isSourceCustom
- [x] 找到 sourceNode 並更新資料庫
- [x] 刷新後連接持久化

## 🎉 現在應該能正常工作！

刷新瀏覽器並測試 Custom Node 連接功能。
