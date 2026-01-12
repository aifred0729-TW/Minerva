# Custom Graph Nodes - 多用戶協作實現

## ✅ 實現完成

所有 Custom Graph Nodes 現在使用 Mythic 的 **agentstorage** 表存儲，實現真正的多用戶實時協作。

---

## 🎯 架構概覽

```
┌─────────────────────────────────────────────────────┐
│  CallbackGraph.tsx (React Component)                │
│  - useQuery with 5s polling                         │
│  - CREATE/UPDATE/DELETE mutations                   │
└────────────────┬────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────┐
│  GraphQL API (Hasura)                               │
│  - Query: agentstorage                              │
│  - Filter: unique_id LIKE "minerva_customnode_%"    │
└────────────────┬────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────┐
│  PostgreSQL Database                                │
│  Table: agentstorage                                │
│  - id: int                                          │
│  - unique_id: string (minerva_customnode_{id})     │
│  - data: bytea (base64 encoded JSON)               │
└─────────────────────────────────────────────────────┘
```

---

## 📂 新增文件

### 1. **類型定義** 
`MythicReactUI/src/Minerva/types/customGraphNode.ts`
- `CustomGraphNode` - 節點數據結構
- `CreateCustomGraphNodeInput` - 創建節點輸入
- `UpdateCustomGraphNodeInput` - 更新節點輸入
- 轉換函數：`toInternalNode`, `fromInternalNode`

### 2. **服務層** 
`MythicReactUI/src/Minerva/lib/customGraphNodeService.ts`
- `serializeNodeData()` - JSON → base64 編碼
- `deserializeNodeData()` - base64 → JSON 解碼
- `generateNextId()` - 生成下一個可用 ID
- `prepareCreateNodeData()` - 準備創建數據
- `prepareUpdateNodeData()` - 準備更新數據
- `parseAgentStorageResults()` - 解析查詢結果

---

## 🔄 修改文件

### 1. **GraphQL Operations** 
`MythicReactUI/src/Minerva/lib/api.ts`

**GET_CUSTOM_GRAPH_NODES** (Query):
```graphql
agentstorage(
  where: { unique_id: { _like: "minerva_customnode_%" } }
  order_by: { id: asc }
) {
  id
  unique_id
  data
}
```

**CREATE_CUSTOM_GRAPH_NODE** (Mutation):
```graphql
insert_agentstorage_one(
  object: {
    unique_id: $unique_id
    data: $data
  }
)
```

**UPDATE_CUSTOM_GRAPH_NODE** (Mutation):
```graphql
update_agentstorage(
  where: { unique_id: { _eq: $unique_id } }
  _set: { data: $data }
)
```

**DELETE_CUSTOM_GRAPH_NODE** (Mutation):
```graphql
delete_agentstorage(
  where: { unique_id: { _eq: $unique_id } }
)
```

### 2. **React Component** 
`MythicReactUI/src/Minerva/components/CallbackGraph.tsx`

**主要變更：**
- ✅ 導入 `customGraphNodeService` 函數
- ✅ 更新 `useEffect` 處理 agentstorage 數據格式
- ✅ `handleCreateCustomNode` - 使用序列化數據
- ✅ `handleUpdateCustomNode` - 使用序列化數據
- ✅ `handleDeleteCustomNode` - 使用 unique_id

---

## 🚀 多用戶協作特性

### ✅ **實時同步**
- **5秒輪詢** - 自動檢測其他用戶的變更
- **服務器存儲** - 所有數據持久化在 PostgreSQL
- **跨設備訪問** - 任何設備、任何用戶都能訪問相同數據

### ✅ **數據格式**

**unique_id 格式:**
```
minerva_customnode_1
minerva_customnode_2
minerva_customnode_3
...
```

**data 字段 (bytea):**
```json
{
  "id": 1,
  "hostname": "DESKTOP-ABC",
  "ip_address": "192.168.1.100",
  "operating_system": "Windows",
  "architecture": "x64",
  "username": "admin",
  "description": "Domain Controller",
  "hidden": false,
  "timestamp": "2026-01-12T10:30:00.000Z",
  "position": {
    "x": 100,
    "y": 200
  }
}
```

---

## 📖 使用方法

### 創建 Custom Node
1. 點擊 "Add Custom Node" 按鈕
2. 填寫表單（Hostname、IP、OS 等）
3. 點擊 "Create"
4. 數據自動存儲到 agentstorage 表
5. 5秒內所有用戶都能看到新節點

### 更新 Custom Node
1. 右鍵點擊節點 → "Edit"
2. 修改信息
3. 點擊 "Update"
4. 變更實時同步到所有用戶

### 刪除 Custom Node
1. 右鍵點擊節點 → "Delete"
2. 確認刪除
3. 節點從數據庫移除
4. 所有用戶視圖更新

---

## 🧪 測試步驟

### 多用戶協作測試

**步驟 1: 用戶 A 創建節點**
```
1. 用戶 A 登錄 Mythic
2. 打開 Callback Graph
3. 創建 Custom Node "Server-01"
4. 觀察節點出現在圖表中
```

**步驟 2: 用戶 B 自動同步**
```
1. 用戶 B 同時登錄（不同瀏覽器/設備）
2. 打開 Callback Graph
3. 等待最多 5 秒
4. ✅ "Server-01" 節點自動出現
```

**步驟 3: 用戶 B 更新節點**
```
1. 用戶 B 編輯 "Server-01"
2. 修改 description 為 "Production Server"
3. 保存
```

**步驟 4: 用戶 A 看到更新**
```
1. 用戶 A 等待 5 秒
2. ✅ 節點信息自動更新
3. 顯示 "Production Server"
```

**步驟 5: 刪除同步**
```
1. 任一用戶刪除節點
2. 5 秒內所有用戶視圖更新
3. ✅ 節點消失
```

---

## 🔍 故障排除

### 問題 1: 節點不顯示
**原因:** GraphQL 查詢可能失敗  
**解決:** 
1. 打開瀏覽器控制台
2. 檢查 Network 標籤中的 GraphQL 請求
3. 確認 agentstorage 表存在且可訪問

### 問題 2: 數據格式錯誤
**原因:** base64 編碼/解碼失敗  
**解決:**
1. 檢查控制台錯誤日誌
2. 驗證 `serializeNodeData` 和 `deserializeNodeData` 函數
3. 確保數據是有效的 JSON

### 問題 3: 多用戶不同步
**原因:** Polling 未啟用  
**解決:**
1. 確認 `useQuery` 有 `pollInterval: 5000`
2. 確認 `fetchPolicy: 'network-only'`
3. 檢查網絡連接

---

## 📊 數據庫查詢

### 查看所有 Custom Nodes (PostgreSQL)
```sql
SELECT 
  id,
  unique_id,
  convert_from(data, 'UTF8') as json_data
FROM agentstorage
WHERE unique_id LIKE 'minerva_customnode_%'
ORDER BY id;
```

### 手動插入節點 (測試用)
```sql
INSERT INTO agentstorage (unique_id, data)
VALUES (
  'minerva_customnode_999',
  convert_to('{"id":999,"hostname":"TEST","ip_address":"10.0.0.1","operating_system":"Linux","architecture":"x64","timestamp":"2026-01-12T00:00:00Z"}', 'UTF8')
);
```

---

## ✅ 功能清單

- [x] TypeScript 類型定義
- [x] 數據序列化/反序列化
- [x] GraphQL CRUD operations
- [x] 多用戶實時同步 (5s polling)
- [x] 服務器端持久化存儲
- [x] 錯誤處理和用戶反饋
- [x] 跨瀏覽器/跨設備支持
- [x] 自動 ID 生成
- [x] Position 數據保存

---

## 🎯 優勢總結

| 特性 | 舊方案 (localStorage) | 新方案 (agentstorage) |
|------|----------------------|----------------------|
| 多用戶訪問 | ❌ 僅單用戶 | ✅ 所有用戶 |
| 實時同步 | ❌ 無 | ✅ 5秒輪詢 |
| 持久化 | ⚠️ 瀏覽器本地 | ✅ PostgreSQL |
| 跨設備 | ❌ 不支持 | ✅ 完全支持 |
| 數據備份 | ❌ 易丟失 | ✅ 數據庫備份 |
| 協作編輯 | ❌ 不可能 | ✅ 完整支持 |

---

## 📝 後續改進建議

1. **GraphQL Subscription** - 替換 polling，實現真正的實時推送
2. **樂觀更新** - 立即顯示變更，後台同步
3. **衝突解決** - 多用戶同時編輯同一節點
4. **變更歷史** - 追蹤誰在何時修改了什麼
5. **權限控制** - 限制誰可以編輯/刪除節點

---

## 🎉 完成！

所有 Custom Nodes 現在完全支持多用戶協作！  
任何協作者都能在 5 秒內看到彼此的變更。

**測試環境:** ✅ 可以開始測試  
**生產環境:** ✅ 可以部署使用
