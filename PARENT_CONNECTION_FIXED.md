# ✅ Custom Node Parent 連接問題已修復！

## 修復內容

### 1. **添加 Parent 關係欄位**
在 CustomGraphNode 和 CustomGraphNodeInternal 添加：
- `parent_id`: 父節點的 ID（可以是 callback display_id 或 custom node id）
- `parent_type`: 父節點類型（'callback' 或 'custom'）
- `c2profile`: 連接使用的 C2 profile
- `display_id`: Custom Node 的顯示 ID（與 db_id 相同，用於相容性）

### 2. **修正 "Linked to Custom Node #undefined"**
**問題**: Custom Node 沒有 `display_id` 屬性
**修復**: 
- 添加 `display_id: node.id` 到 CustomGraphNodeInternal
- 使用 `selectedDestination.display_id || selectedDestination.db_id`

### 3. **連接保存到資料庫**
**修復前**: 連接只存在內存中（customEdges state）→ 刷新後消失 ❌
**修復後**: 連接保存到 agentstorage 的 parent 欄位 → 刷新後仍然存在 ✅

**流程**:
```
用戶點擊 "Link to Parent"
  ↓
選擇目標節點和 C2 Profile
  ↓
handleSetParent() 執行
  ↓
更新 Custom Node 的 parent_id, parent_type, c2profile
  ↓
調用 UPDATE_CUSTOM_GRAPH_NODE mutation
  ↓
PostgreSQL agentstorage 更新
  ↓
重新查詢資料（refetchCustomNodes）
  ↓
useEffect 從資料庫讀取並生成 edges
```

### 4. **從資料庫恢復連接**
修改 useEffect，從 parent 關係生成 edges：
```javascript
const newEdges = nodes
    .filter(node => node.parent_id !== undefined)
    .map(node => ({
        id: `custom-edge-${node.db_id}`,
        source: node.id,
        target: node.parent_type === 'custom' 
            ? `custom-${node.parent_id}` 
            : node.parent_id,
        c2profile: node.c2profile
    }));
setCustomEdges(newEdges);
```

### 5. **更新斷開連接功能**
修改 `handleDisconnectParent` 處理 Custom Node：
- 更新資料庫，設置 parent_id/parent_type/c2profile 為 undefined
- 重新查詢資料
- edges 自動從 customEdges 中移除

---

## 🧪 測試步驟

### 測試 1: 創建連接
1. **刷新瀏覽器** (`Ctrl + Shift + R`)
2. **開啟 Console** (`F12`)
3. **在 Custom Node 上右鍵** → 選擇 "Link to Parent"
4. **選擇父節點** (可以是 Callback 或另一個 Custom Node)
5. **選擇 C2 Profile** (如 http)
6. **點擊 LINK**

**預期結果**:
- ✅ 顯示 "Linked to Custom Node #1" 或 "Linked to Callback #8" (顯示正確的 ID)
- ✅ 圖形中出現連接線
- ✅ Console 顯示: `[handleSetParent] Updating custom node parent connection...`

### 測試 2: 連接持久化
1. **創建一個連接** (按測試 1)
2. **刷新頁面** (`F5`)
3. **等待頁面加載完成**

**預期結果**:
- ✅ 連接仍然存在
- ✅ Console 顯示: `[CallbackGraph] Generated edges from parent relationships: [...]`

### 測試 3: 斷開連接
1. **在已連接的 Custom Node 上右鍵**
2. **選擇 "Disconnect from Parent"**

**預期結果**:
- ✅ 連接線消失
- ✅ 顯示 "Disconnected from parent"
- ✅ Console 顯示: `[handleDisconnectParent] Removing parent from custom node: ...`

### 測試 4: 多用戶同步
1. **開啟兩個瀏覽器視窗**
2. **在視窗 A 創建連接**
3. **等待 5 秒** (polling interval)
4. **檢查視窗 B**

**預期結果**:
- ✅ 視窗 B 自動顯示新連接

---

## 🔍 Console 日誌檢查

### 創建連接時應該看到:
```javascript
[handleSetParent] Updating custom node parent connection...
[handleSetParent] Source: custom-1 db_id: 1
[handleSetParent] Destination: custom-2 display_id: 2
[handleSetParent] Updating with parent_id: 2
[CallbackGraph] Generated edges from parent relationships: [{...}]
```

### 加載頁面時應該看到:
```javascript
[CallbackGraph] Found agentstorage data: [{...}]
[parseAgentStorageResults] Processing 1 items
[deserializeNodeData] Parsed from hex->base64->JSON format
[CallbackGraph] Mapped internal nodes: [{...}]
[CallbackGraph] Generated edges from parent relationships: [{...}]
```

### 斷開連接時應該看到:
```javascript
[handleDisconnectParent] Removing parent from custom node: 1
```

---

## 📊 資料庫驗證

檢查 agentstorage 中的 parent 資訊：
```bash
cd /home/red/Mythic && sudo docker exec mythic_graphql sh -c 'curl -X POST -H "Content-Type: application/json" -H "x-hasura-admin-secret: $HASURA_GRAPHQL_ADMIN_SECRET" --data "{\"query\":\"query { agentstorage(where: {unique_id: {_like: \\\"minerva_customnode_%\\\"}}) { id unique_id data } }\"}" http://localhost:8080/v1/graphql' | python3 -m json.tool
```

解碼 data 欄位應該包含：
```json
{
  "id": 1,
  "parent_id": 2,
  "parent_type": "custom",
  "c2profile": "http",
  ...
}
```

---

## ⚠️ 已知限制

1. **Regular Callback → Custom Node**: 
   - 不支持將 regular callback 連接到 custom node 作為父節點
   - 因為 regular callback 的連接存在 callbackgraphedge 表，該表不支持 custom nodes
   - 會顯示警告: "Cannot link regular callback to custom node"

2. **Custom Node → Regular Callback**: ✅ 支持
3. **Custom Node → Custom Node**: ✅ 支持

---

## 🐛 如果還有問題

### 問題: 仍顯示 "undefined"
- 檢查 Console 是否有 `display_id` 相關錯誤
- 確認 node 物件包含 `display_id` 或 `db_id`

### 問題: 連接不持久化
- 檢查 Console 中 `[handleSetParent]` 的日誌
- 確認 `affected_rows > 0`
- 運行資料庫驗證命令檢查 data 內容

### 問題: 刷新後連接消失
- 檢查 Console 中 `[CallbackGraph] Generated edges from parent relationships`
- 確認 edges 陣列不是空的
- 檢查 parent_id 和 parent_type 是否正確解析
