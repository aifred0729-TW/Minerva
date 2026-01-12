# ✅ Callback → Custom Node 連接已啟用

## 修復內容

### 問題
代碼阻止了 regular callback 連接到 custom node 作為 parent，顯示錯誤：
```
"Cannot link regular callback to custom node (custom nodes cannot be parents of callbacks)"
```

### 解決方案
移除限制，允許 **Regular Callback → Custom Node** 的連接。

---

## 🔧 修改細節

### 1. **移除錯誤限制** (handleSetParent)
**修改前**:
```javascript
if (isDestCustom) {
    snackActions.warning("Cannot link regular callback to custom node...");
    return; // ❌ 阻止連接
}
```

**修改後**:
```javascript
if (isDestCustom) {
    // 創建 custom edge 存儲連接
    const newEdge = {
        id: `custom-edge-callback-${setParentModal.display_id}-to-${selectedDestination.db_id}`,
        source: String(setParentModal.id),
        target: selectedDestination.id,
        c2profile: selectedProfile.name
    };
    setCustomEdges([...filteredEdges, newEdge]);
    snackActions.success(`Linked to Custom Node #${selectedDestination.db_id}`);
}
```

### 2. **支援斷開連接** (handleDisconnectParent)
添加檢查 custom edge 的邏輯：
```javascript
// Check if it's a custom edge (callback → custom node connection)
if (parentEdge.source && typeof parentEdge.source === 'string' && !parentEdge.id.startsWith('e')) {
    setCustomEdges(customEdges.filter(e => e.id !== parentEdge.id));
    snackActions.success(`Disconnected from Custom Node #${parentEdge.targetId}`);
    return;
}
```

---

## ⚠️ 重要提示

### 連接類型對比

| 連接類型 | 存儲方式 | 刷新後是否保留 |
|---------|---------|--------------|
| Custom Node → Callback | 資料庫 (agentstorage) | ✅ 是 |
| Custom Node → Custom Node | 資料庫 (agentstorage) | ✅ 是 |
| Callback → Callback | 資料庫 (callbackgraphedge) | ✅ 是 |
| **Callback → Custom Node** | **記憶體 (customEdges state)** | **❌ 否** |

### 為什麼 Callback → Custom Node 不持久化？

**技術限制**:
- `callbackgraphedge` 表只支援 callback 之間的連接
- Custom node 不在 callback 表中，沒有標準的 callback 結構
- 如果要持久化，需要修改資料庫架構或創建新表

**當前方案**:
- 連接存儲在前端 state (`customEdges`)
- 重新整理頁面後會消失
- 適合臨時規劃或視覺化用途

---

## 🧪 測試步驟

### 測試 1: 創建 Callback → Custom Node 連接
1. **在 Regular Callback 上右鍵**
2. **選擇 "Link to Parent"**
3. **選擇 Custom Node 作為目標**
4. **選擇 C2 Profile**
5. **點擊 LINK**

**預期結果**:
```javascript
[handleSetParent] isSourceCustom: false isDestCustom: true
[handleSetParent] Creating custom edge: callback → custom node
```
- ✅ 顯示 "Linked to Custom Node #1"
- ✅ 顯示提示 "Note: This connection is stored locally..."
- ✅ 出現連接線

### 測試 2: 斷開連接
1. **在已連接的 Callback 上右鍵**
2. **選擇 "Disconnect from Parent"**

**預期結果**:
- ✅ 連接線消失
- ✅ 顯示 "Disconnected from Custom Node #1"

### 測試 3: 驗證刷新行為
1. **創建 Callback → Custom Node 連接**
2. **刷新頁面** (F5)
3. **連接會消失** ⚠️ (預期行為)

---

## 📊 所有支援的連接類型

### ✅ 已支援且持久化
1. **Custom Node → Callback** (parent 存在 agentstorage)
2. **Custom Node → Custom Node** (parent 存在 agentstorage)
3. **Callback → Callback** (edge 存在 callbackgraphedge)

### ✅ 已支援但不持久化
4. **Callback → Custom Node** (edge 存在前端 state)

---

## 💡 如果需要持久化 Callback → Custom Node

需要以下改動（超出當前範圍）:

### 選項 1: 擴展 callbackgraphedge 表
```sql
ALTER TABLE callbackgraphedge 
ADD COLUMN destination_type VARCHAR(20) DEFAULT 'callback';
-- 允許 destination_id 指向 custom node
```

### 選項 2: 創建混合連接表
```sql
CREATE TABLE mixed_graph_edges (
    id SERIAL PRIMARY KEY,
    source_id INT,
    source_type VARCHAR(20), -- 'callback' or 'custom'
    destination_id INT,
    destination_type VARCHAR(20),
    c2profile VARCHAR(50),
    created_at TIMESTAMP DEFAULT NOW()
);
```

### 選項 3: 將所有邊存在 agentstorage
創建專門的 `minerva_graphedge_*` entries 存儲所有連接。

---

## 🎯 使用建議

### 適合使用場景
- ✅ Custom Node 代表外部系統（跳板機、代理等）
- ✅ 臨時規劃攻擊路徑
- ✅ 視覺化拓撲關係

### 注意事項
- ⚠️ Callback → Custom Node 連接不會在多用戶間同步
- ⚠️ 刷新頁面會丟失這些連接
- ⚠️ 建議使用 Custom Node → Callback 方向（可持久化）

如果您經常需要 Callback → Custom Node 連接並需要持久化，請考慮實施上述資料庫改動。
