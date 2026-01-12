# 快速測試指南

## 🚀 立即測試多用戶協作

### 前提條件
- Mythic 服務器正在運行
- PostgreSQL 和 Hasura 正常工作
- 至少 2 個瀏覽器或設備可用

---

## 📝 測試步驟

### 1️⃣ 準備環境

**終端 1 - 啟動 Mythic:**
```bash
cd /home/red/Mythic
./mythic-cli start
```

**瀏覽器 1 - 用戶 A:**
- 打開 `http://localhost:7443` (或您的 Mythic URL)
- 登錄為 Operator 1

**瀏覽器 2 - 用戶 B:**
- 打開隱私模式或另一個瀏覽器
- 打開相同 URL
- 登錄為 Operator 2 (或同一用戶也可以)

---

### 2️⃣ 測試創建節點

**用戶 A 操作:**
1. 導航到 Callback Graph 頁面
2. 點擊 "Add Custom Node" 按鈕
3. 填寫表單：
   - Hostname: `DC-01`
   - IP Address: `192.168.1.10`
   - OS: `Windows`
   - Architecture: `x64`
   - Username: `administrator`
   - Description: `Domain Controller`
4. 點擊 "Create"
5. ✅ 節點應該立即出現在圖表中

**用戶 B 觀察:**
1. 查看 Callback Graph
2. ⏱️ 等待最多 5 秒
3. ✅ `DC-01` 節點自動出現！

**預期結果:** 兩個用戶都能看到相同的節點

---

### 3️⃣ 測試更新節點

**用戶 B 操作:**
1. 右鍵點擊 `DC-01` 節點
2. 選擇 "Edit"
3. 修改：
   - Description: `Primary Domain Controller - Production`
4. 點擊 "Update"
5. ✅ 變更立即顯示

**用戶 A 觀察:**
1. 查看 `DC-01` 節點
2. ⏱️ 等待 5 秒
3. ✅ Description 自動更新！

**預期結果:** 變更在所有用戶間同步

---

### 4️⃣ 測試刪除節點

**用戶 A 操作:**
1. 右鍵點擊 `DC-01`
2. 選擇 "Delete"
3. 確認刪除
4. ✅ 節點消失

**用戶 B 觀察:**
1. ⏱️ 等待 5 秒
2. ✅ 節點自動消失！

**預期結果:** 刪除操作同步到所有用戶

---

### 5️⃣ 測試多節點創建

**用戶 A 和 B 同時操作:**

**用戶 A 創建:**
- Hostname: `WEB-01`, IP: `192.168.1.20`

**用戶 B 創建:**
- Hostname: `DB-01`, IP: `192.168.1.30`

**預期結果:** 
- 5-10 秒後，兩個用戶都能看到 `WEB-01` 和 `DB-01`
- 沒有數據衝突或丟失

---

## 🔍 調試檢查

### 檢查 GraphQL 請求

**瀏覽器開發者工具 (F12):**
1. 打開 Network 標籤
2. 過濾 "graphql"
3. 查看請求：

**創建節點:**
```graphql
mutation CreateCustomGraphNode {
  insert_agentstorage_one(object: {
    unique_id: "minerva_customnode_1"
    data: "eyJpZCI6MSw..." # base64
  })
}
```

**查詢節點:**
```graphql
query GetCustomGraphNodes {
  agentstorage(
    where: { unique_id: { _like: "minerva_customnode_%" } }
  ) {
    id
    unique_id
    data
  }
}
```

### 檢查數據庫

**PostgreSQL 查詢:**
```bash
# 進入 Mythic 容器
docker exec -it mythic_postgres bash

# 連接數據庫
psql -U mythic_user -d mythic_db

# 查詢 custom nodes
SELECT 
  id,
  unique_id,
  convert_from(data, 'UTF8') as json_data
FROM agentstorage
WHERE unique_id LIKE 'minerva_customnode_%';
```

**預期輸出:**
```
 id  |       unique_id        |                    json_data
-----+------------------------+--------------------------------------------------
  1  | minerva_customnode_1   | {"id":1,"hostname":"DC-01","ip_address":"192...
  2  | minerva_customnode_2   | {"id":2,"hostname":"WEB-01","ip_address":"19...
```

---

## ✅ 成功標準

所有這些應該正常工作：

- [x] 用戶 A 創建節點 → 用戶 B 在 5 秒內看到
- [x] 用戶 B 更新節點 → 用戶 A 在 5 秒內看到變更
- [x] 任一用戶刪除 → 所有用戶同步更新
- [x] 多個用戶同時創建 → 所有節點都顯示
- [x] 刷新頁面 → 數據持久化，節點仍存在
- [x] 跨設備訪問 → 數據一致

---

## ⚠️ 常見問題

### 問題: 節點不出現
**檢查:**
1. Hasura 是否運行？`docker ps | grep hasura`
2. GraphQL 請求是否成功？(Network 標籤)
3. 瀏覽器控制台有錯誤嗎？

### 問題: 數據不同步
**檢查:**
1. Polling 是否啟用？(應該每 5 秒自動查詢)
2. 兩個用戶是否連接到同一個 Mythic 實例？
3. 時間戳是否一致？

### 問題: 創建失敗
**檢查:**
1. 是否填寫了所有必填字段？
2. IP 格式是否正確？
3. 數據庫權限是否正確？

---

## 📊 性能測試

### 大量節點測試
1. 創建 10-20 個 custom nodes
2. 觀察頁面性能
3. 確認 polling 仍然流暢

### 併發測試
1. 3-5 個用戶同時操作
2. 創建、更新、刪除混合
3. 確認無數據丟失或衝突

---

## 🎉 測試完成

如果所有測試通過，恭喜！🎊

**Custom Graph Nodes 多用戶協作功能已完全實現！**

任何問題請查看：
- 瀏覽器控制台日誌
- Mythic 服務器日誌
- PostgreSQL 日誌
- `CUSTOM_NODES_IMPLEMENTATION.md` 完整文檔
