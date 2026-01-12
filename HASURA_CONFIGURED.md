# ✅ Hasura 配置完成 - 測試指南

## 🎉 成功！agentstorage 權限已配置

剛剛執行的配置腳本已經成功為 `agentstorage` 表添加了所有必要的權限。

---

## 📋 已完成的操作

1. ✅ 備份了原始 `tables.yaml`
2. ✅ 為 agentstorage 添加 **INSERT** 權限
3. ✅ 為 agentstorage 添加 **SELECT** 權限  
4. ✅ 為 agentstorage 添加 **UPDATE** 權限
5. ✅ 為 agentstorage 添加 **DELETE** 權限
6. ✅ 重啟了 Hasura 容器以應用更改

---

## 🚀 立即測試

### 步驟 1: 刷新瀏覽器
```
按 Ctrl+Shift+R (硬刷新) 清除緩存
```

### 步驟 2: 創建測試節點

1. 打開 Callback Graph 頁面
2. 點擊 "Add Custom Node"
3. 填寫：
   - **Hostname**: `TEST-NODE`
   - **IP Address**: `10.0.0.1`
   - **OS**: `Windows`
   - **Architecture**: `x64`
   - **User**: `testuser`
   - **Description**: `Test custom node`
4. 點擊 **CREATE**

### 預期結果：
✅ **成功消息**: "Custom node 'TEST-NODE' created"  
✅ **節點出現** 在圖表中  
❌ **不再顯示**: "field 'insert_agentstorage_one' not found"

---

## 🔍 驗證 GraphQL

打開瀏覽器開發者工具 (F12) → Network 標籤

### 創建節點時應該看到：

**Request (mutation):**
```graphql
mutation CreateCustomGraphNode($unique_id: String!, $data: bytea!) {
  insert_agentstorage_one(object: {unique_id: $unique_id, data: $data}) {
    id
    unique_id
  }
}
```

**Response (成功):**
```json
{
  "data": {
    "insert_agentstorage_one": {
      "id": 1,
      "unique_id": "minerva_customnode_1"
    }
  }
}
```

---

## 🔧 如果仍有問題

### 問題 1: 仍然顯示 "field not found"

**解決方案 A - 再次重啟 Hasura:**
```bash
sudo docker restart mythic_graphql
# 等待 10 秒
```

**解決方案 B - 檢查 Hasura 日誌:**
```bash
sudo docker logs mythic_graphql --tail 50
```

**解決方案 C - 手動重載 metadata:**
1. 打開 Hasura Console: `http://localhost:8080` (或您的 Hasura URL)
2. 點擊右上角 "Settings"
3. 點擊 "Reload metadata"

### 問題 2: 權限錯誤

**檢查您的用戶角色:**
```bash
# 在瀏覽器控制台執行
console.log(localStorage.getItem('user'))
```

確保角色是以下之一：
- `operator`
- `operation_admin`
- `mythic_admin`
- `developer`

### 問題 3: bytea 類型錯誤

這可能是數據編碼問題。檢查控制台是否有 base64 相關錯誤。

---

## 📊 數據庫驗證

### 查看創建的節點:

```bash
# 進入 PostgreSQL 容器
sudo docker exec -it mythic_postgres psql -U mythic_user -d mythic_db

# 查詢 custom nodes
SELECT 
  id,
  unique_id,
  length(data) as data_size,
  convert_from(data, 'UTF8') as json_content
FROM agentstorage
WHERE unique_id LIKE 'minerva_customnode_%';
```

**預期輸出示例:**
```
 id  |       unique_id        | data_size |         json_content
-----+------------------------+-----------+---------------------------
  1  | minerva_customnode_1   |    256    | {"id":1,"hostname":"...
```

---

## 🎯 多用戶測試

### 測試實時同步:

1. **瀏覽器 A (用戶 1):**
   - 創建節點 "SERVER-A"
   - 觀察成功消息

2. **瀏覽器 B (用戶 2):**
   - 打開相同頁面
   - 等待 5 秒
   - ✅ 應該看到 "SERVER-A" 出現

3. **瀏覽器 B:**
   - 編輯 "SERVER-A" 的 description
   - 保存

4. **瀏覽器 A:**
   - 等待 5 秒
   - ✅ 應該看到更新後的 description

---

## 📝 配置詳情

### 添加的權限:

**INSERT (創建):**
- Roles: operator, operation_admin, mythic_admin, developer
- Columns: unique_id, data

**SELECT (查詢):**
- Roles: spectator, operator, operation_admin, mythic_admin, developer
- Columns: id, unique_id, data

**UPDATE (更新):**
- Roles: operator, operation_admin, mythic_admin, developer
- Columns: data

**DELETE (刪除):**
- Roles: operator, operation_admin, mythic_admin, developer

### 備份文件位置:
```
/home/red/Mythic/hasura-docker/metadata/tables.yaml.backup.20260112_211051
```

如需恢復:
```bash
cp /home/red/Mythic/hasura-docker/metadata/tables.yaml.backup.* \
   /home/red/Mythic/hasura-docker/metadata/tables.yaml
sudo docker restart mythic_graphql
```

---

## ✅ 成功標準

所有這些應該正常工作：

- [x] 創建 custom node - 不再報錯
- [x] 查詢 custom nodes - 顯示所有節點
- [x] 更新 custom node - 成功更新
- [x] 刪除 custom node - 成功刪除
- [x] 多用戶看到相同數據
- [x] 5 秒內同步變更

---

## 🆘 緊急回滾

如果配置導致任何問題：

```bash
# 1. 停止 Mythic
cd /home/red/Mythic
./mythic-cli stop

# 2. 恢復備份
cp /home/red/Mythic/hasura-docker/metadata/tables.yaml.backup.* \
   /home/red/Mythic/hasura-docker/metadata/tables.yaml

# 3. 重啟 Mythic
./mythic-cli start
```

---

## 🎉 全部完成！

現在您的 Custom Graph Nodes 應該完全可以工作了，包括：
- ✅ 多用戶協作
- ✅ 實時同步
- ✅ 服務器端存儲
- ✅ 完整 CRUD 操作

**祝測試順利！** 🚀

如有任何問題，請查看 Hasura 日誌或聯繫開發者。
