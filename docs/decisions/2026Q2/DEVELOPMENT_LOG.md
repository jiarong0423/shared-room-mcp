# Menu Project Development Log

## 2026-05-18

### 已完成

- 建立 Zeabur 可部署的 Node.js/Express 專案。
- 使用官方 Google GenAI SDK `@google/genai` 進行 Gemini 圖片菜單解析。
- 只讀執行環境變數，不自動讀取本機 `.env`。
- 支援 `GEMINI_API_KEY`、`GOOGLE_API_KEY`、`GOOGLE_GENERATIVE_AI_API_KEY`、`GOOGLE_GEMINI_API_KEY`、`GEMINI_KEY` 環境變數名稱。
- `/healthz` 只顯示 Gemini key 使用的變數名，不顯示 secret value。
- 實作房間模型，確保同一房間的菜單圖片只解析一次。
- 實作 Socket.IO 多人同步點餐，每位成員獨立記錄自己的數量。
- 修正同一瀏覽器重複加入房間時的在線連線計數。
- 修正成員統計，離線且沒有點餐、沒有確認的成員不再顯示或計入人數。
- 新增訂單確認流程：個人可確認或取消確認，確認後鎖住自己的數量。
- 新增防呆：未命名不能點餐、空單不能確認、確認後不能改數量。
- 修正舊房間連結啟動流程：Socket 不會在 API boot 前加入已失效房間，若房間不存在會自動建立新房間。
- 上傳流程改成三段式：選擇圖片只預覽，按 `確定上傳` 才送 AI 解析，按 `取消上傳` 清掉待上傳圖片。
- 新增品項圖片顯示：Gemini 回傳 normalized `imageBox`，前端用壓縮後菜單圖切出適中小圖，圖下顯示名稱與價格。
- 新增 Gemini 503 高流量防呆：解析失敗時會重試，並依序切換備援模型。
- Gemini 解析失敗會回傳可讀錯誤，不再直接把原始 API JSON 錯誤丟到前端。
- 前端提供直式品項列：圖片、名稱、價格、我的數量、全體數量、小計、全體總金額。
- 新增菜單模式：AI 自動判斷一般菜單、飲料單或混合菜單；發起者可切換自動、一般菜單、飲料單。
- 新增飲料店專用功能：只有飲料模式或飲料品項會在數量大於 0 時展開甜度與冰塊選項。
- 新增發起者結算：只有房間發起者可結算，結算後鎖定數量、確認狀態、甜度冰塊與菜單模式。
- 新增總單輸出：可複製或列印品項彙總、個人明細、甜度冰塊與總金額。
- 2026-05-18 已使用 Zeabur CLI 從本地直推部署到舊 demo service。
- 2026-05-18 22:23 已重新部署含飲料單切換、發起者結算與總單列印版本；deployment `6a0b205fbbc71468fc746a44` 狀態為 `RUNNING`。
- 2026-05-18 22:32 將主模型改為 `gemini-2.5-flash-lite`，備援模型改為 `gemini-2.5-flash,gemini-flash-latest`，降低菜單解析成本與等待時間。
- 2026-05-18 22:40 新增圖片預處理管線：上傳後先轉成壓縮 JPEG、限制最大尺寸，再送 Gemini；前端切圖也使用同一張壓縮圖，避免原圖與 AI 座標不一致。
- 2026-05-18 22:40 將 `imageBox` 改為必填，若 AI 未給可用座標，後端會用品項順序建立保底切圖框，不再顯示整批無切圖。
- 2026-05-18 22:58 將 AI 定位改為 `cellBox`、`anchorBox`、`imageBox`、`edgeAngle`、`hasImage`：優先依邊界判定品項，同一邊界內的組合餐合併成同一品項，純文字飲料價目表不顯示裁切圖。
- 2026-05-18 22:58 新增低解析度品項縮圖端點，前端不再用整張菜單大圖直接裁切，提升載入速度並避免版面被大圖拖慢。
- 2026-05-18 22:58 新增 CSV 與 AI 定位 JSON 下載，輸出包含訂單統計、品項定位框、是否有商品圖與邊緣角度。
- 2026-05-18 23:06 優化前端視覺與欄位比例：品項列改為固定縮圖、固定右側數量欄、較清楚的名稱價格層級，手機版維持穩定欄位寬度。
- 2026-05-18 23:11 套用日系文青風前端：紙感底色、灰調抹茶綠主色、焙茶色金額、虛線列表分隔，右側統計新增餐點統計與每人明細頁籤。
- 2026-05-18 23:24 取消品項裁切縮圖顯示，改為點餐頁頂端顯示後端壓縮後完整菜單圖，支援拖移、滾輪縮放與雙指縮放。
- 2026-05-18 23:24 上傳改為最多兩張菜單圖片；AI 解析時輸出 `sourceImageIndex`，前端依菜單圖片建立點餐分頁，一張菜單對應一個品項頁。
- 2026-05-18 23:24 將右側輸出按鈕由 AI 定位 JSON 改為下載 PDF，實作上開啟列印流程讓使用者另存 PDF；CSV 保留。
- 2026-05-18 23:38 為降低卡頓，Gemini schema 瘦身為 `name`、`price`、`supportsDrinkOptions`、`sourceImageIndex`，不再要求座標框、商品圖判定或角度。
- 2026-05-18 23:38 主菜單圖區塊新增收合/展開與下載壓縮圖功能；房間內保留壓縮後菜單圖供檢視與下載。
- 2026-05-18 23:50 解析改為速度優先：預設關閉 Gemini 備援模型、重試次數降為 1、解析 timeout 25 秒、圖片壓縮改為 960px / JPEG 68，避免使用者長時間等待。
- 2026-05-19 移除 CSV 下載按鈕與前端 CSV 產生邏輯，總單輸出保留複製、列印與 PDF。
- 2026-05-19 新增「建立新房間」按鈕，用後端隨機 room id 產生新連結；清空房間仍保留原連結。
- 2026-05-19 依使用者回饋將上傳改回單張菜單圖片，移除前端菜單分頁；後端只接受 `menuImage` 一張圖。
- 2026-05-19 前端不再顯示 Gemini warnings，避免大小杯價格假設文字以英文塞滿提示區；prompt 改為要求大小杯直接拆成不同品項。
- 2026-05-19 新增 `scripts/stress-menu-parser.mjs` 壓測腳本，逐張上傳菜單圖到目標服務，記錄成功率、耗時、品項數、大小杯/加料/雜訊欄位等自動檢查結果到 `logs/runtime`。
- 2026-05-19 壓測確認 Gemini free tier 會回 `429 quota exceeded`，大量截圖不適合直接連打線上 API；後續測試應先做本地分類與抽樣，再分批解析。
- 2026-05-19 定義菜單解析模糊規則並寫入 prompt：糖量/熱量/容量/代碼不可當價格；飲料尺寸必須拆成 `品名 + 尺寸`；加料與升級選項先不輸出為主品項；優惠券與套餐以邊界合併為單一品項。
- 2026-05-19 將大小杯、尺寸、加料、加價升級改為隱藏 `optionGroups` 結構；只有 AI 明確讀到選項時前端才顯示下拉，沒有選項的品項完全不顯示下拉，選項加價會納入後端總金額計算。
- 2026-05-19 新增 OpenAI 備援解析 provider：預設 `AI_PROVIDER_ORDER=gemini,openai`，Gemini 成功時不呼叫 OpenAI；只有 Gemini 429、5xx、timeout 等可備援錯誤才切換 `OPENAI_MODEL=gpt-5.4-mini`。
- 2026-05-19 `/healthz` 新增 provider 狀態欄位：`providerOrder`、`activeProviderCandidates`、`hasOpenAiKey`、`openAiModel`，只顯示 key 變數名與布林值，不顯示 secret value。
- Zeabur 公開網址：舊 demo URL 已移除；新 live URL 等專案名稱確定後再部署。
- 解析結果與訂單狀態只保存在服務記憶體，不寫入資料庫，避免污染既有資料策略與分類資料。

## 2026-05-20

### 已完成

- 將菜單解析 schema 新增 `addonSection`，要求 Gemini/OpenAI 將全域「加料/配料」區獨立輸出，避免把加料誤塞成主品項。
- 將 `optionGroups` 新增 `selectionType`：尺寸與一般規格維持 `single`，加料固定 `multiple`。
- 後端會把全域 `addonSection` 掛到所有飲料品項，並支援同一品項同時選多個加料、合併計算加價。
- 前端加料 UI 由下拉選單改為 checkbox；大小杯與一般規格仍使用下拉選單。
- 訂單輸出會把多個加料合併顯示，例如 `加料:珍珠+椰果`。
- 預設圖片解析壓縮調整為 `IMAGE_MAX_DIMENSION=1400`、`IMAGE_JPEG_QUALITY=80`，降低加料區小字被壓縮吃掉的機率。
- 壓測腳本新增 `addon_not_multiple` 與 `addon_contains_no_add` 檢查，避免多選加料退化回單選。
- 2026-05-20 已使用 Zeabur CLI 部署到舊 demo service；deployment id 不再保留於公開提交紀錄。
- 2026-05-20 已更新 Zeabur runtime 圖片解析參數，公開 `/healthz` 已確認 provider 環境旗標與圖片解析參數生效，未記錄任何 key value。
- 2026-05-20 補強英文飲料尺寸解析：Prompt 明確指定 `S/M/L/XL/Small/Medium/Regular/Large/Extra Large` 為尺寸欄，後端新增英文尺寸保底合併，避免模型把同一飲料的英文大小杯拆成多個主品項。
- 2026-05-20 英文尺寸修正版已部署到舊 Zeabur demo service，公開 `/healthz` 正常。
- 2026-05-20 針對 MACU 類型菜單補強 `L / 瓶` 尺寸解析：Prompt 明確定義 `L` 為大杯欄、`瓶` 為瓶裝欄；同列兩價格需輸出為同一品項的 `size` optionGroup，`price` 使用 L 欄價格，瓶欄以 `priceDelta` 表示。後端保底合併新增獨立 `瓶` 尺寸標記，避免 Gemini 將瓶裝拆成同名多價品項後無法合併。
- 2026-05-20 已使用 Zeabur CLI 將 `L / bottle` 修正版部署到舊 demo service。公開 `/healthz` 已確認 provider 環境旗標與圖片解析參數生效，未記錄任何 key value。

### 剩餘漏洞

- 尚未用真實 Gemini key 對端到端菜單圖片重新壓測；本機若無環境金鑰只能做語法與本機介面驗證。
- 尚未對先前指定的本機測試圖片做線上 Gemini 端到端重跑；部署後若需測試，請使用明確提供的測試圖片路徑或公開 fixture。
- 加料區仍依賴 Gemini 視覺辨識，若圖片極小、反光或設計沒有價格錨點，仍需要人工校正功能。

### 專案既有剩餘漏洞

- ~~Zeabur 重啟會清空房間；正式版需要 Redis 或 PostgreSQL。~~ 2026-09-01 已用 JSON persistence 加 volume 路徑解決 MVP 重啟保存；正式水平擴展仍建議 Redis 或 PostgreSQL。
- 目前任何房間成員都可清空房間；正式版需要主揪權限或一次性管理碼。
- OCR 與邊界判定準確度取決於圖片清晰度；正式版需要加入人工校正欄位與保存校正紀錄。
- 尚未加入匯出 Excel 或歷史訂單查詢。
- 本機未讀取 `.env`，因此沒有系統環境 key 時無法驗證 Gemini 圖片解析；部署到 Zeabur 並設定 `GEMINI_API_KEY` 後再做端到端圖片測試。
- Zeabur health check 會顯示 `hasGeminiKey`、`geminiKeyName`、`hasOpenAiKey` 與 `openAiKeyName`，用來確認 runtime 是否讀到 key。

### 資料治理狀態

- 無 DB、JSON、JSONL、CSV、TSV、雲端推送或 shared data 正式寫入。
- 無金鑰寫入 repository；僅提供 `env.sample` 變數名稱。

## 2026-09-01

### 已完成

- 將專案重新收斂為英文預設的開源 WebMCP tool-layer template：主軸是 pre-payment social coordination，不主張代付款、代下單或要求部署者提供公開可變更 API。
- 新增 JSON room persistence，Zeabur 可掛 volume 並設定 `ROOM_STORE_PATH=/data/rooms.json`，避免 MVP room state 因服務重啟直接遺失。
- 新增 `create_action_proposal` WebMCP proposal-only tool。Agent 可建立 bounded JSON draft，暫存於 `room.agentProposals[]`，狀態固定為 `pending_host_confirmation`。
- 新增 Host Draft Review UI。只有房間發起者可將 Agent 草稿標記為 `accepted_by_host` 或 `rejected_by_host`；採納草稿不會自動改 orders、claims、formulas、task routing、settlement、payment、Google Sheets、booking 或外部服務。
- `webMcpToolSurfaceVersion` 升級為 `group-room-webmcp-tools.v2`，並在 README、submission packet、task gap audit 中同步標記 proposal-only tool。
- Submission packet public repository URL 已改為 pending，等最終 GitHub repository name 確認後再填。
- 已 commit 並 push：`fd26055 Add proposal-only WebMCP draft tool`。

### 驗證證據

- `npm run check` 通過。
- `npm run audit:tasks` 通過，7/7 checks ready，open gaps 2，partial gaps 2。
- `public/index.html` inline script syntax check 通過。
- `git diff --check` 通過。
- 本地 HTTP smoke 通過：`POST /api/rooms` 回 201，`POST /api/rooms/:roomId/agent-proposals` 回 201，讀回 `proposalCount=1`、`firstProposalStatus=pending_host_confirmation`、`allowedEffect=draft_only`、`moneyTotalUnchanged=true`。
- 重啟 smoke 通過：同一個 `ROOM_STORE_PATH` 重啟後載入 `loadedCount=1`，同一 room 讀回 `proposalCount=1`、`agentProposalContract=group-room-agent-proposal-contract.v1`、`webMcpVersion=group-room-webmcp-tools.v2`。
- secret scan 當時只命中文件 placeholder，沒有真實 API key。

## 2026-09-01 Public Submission Security Hardening

- Moved `ai-security-rules` local tool repo into the Developer workspace and used it as the AI security gate reference.
- Replaced the old dot-env sample with `env.sample` so the public export gate does not classify a dot-env file as export-blocking secret material.
- Added public security evidence files under `docs/security/` and a root `SECURITY.md`.
- Added explicit same-origin Socket.IO default with optional `CORS_ORIGIN`.
- Added owner-only gate for `create_action_proposal`, proposal review, room reset, and proposal deletion flows.
- Tightened upload parser limits for files, fields, field names, field sizes, and multipart parts.
- Updated dependency lockfile; `npm audit --audit-level=moderate --omit=dev` passed with `0` vulnerabilities.
- Current-file secret scan passed with no findings; Git-history secret scan passed with no secret patterns or secret filenames.
- `ai-security-rules export-gate` passed with `0` blocking findings after adding the public export manifest.
- `ai-security-rules history-scan` flagged historical dot-env sample filenames by policy. No actual secret pattern was found by the workspace Git-history secret scanner. Git history rewrite/force-push remains a separate manual approval item.
- Resolved mutable-artifact risk: generated audit JSON is kept local but removed from tracked public export; public evidence stays in Markdown.
- Official WebMCP Challenge submission alignment checked on 2026-09-01: source/license/WebMCP markers/English docs/public repo URL are ready; live URL and YouTube demo URL remain pending.
- Final project identity locked on 2026-09-01: `Shared Room MCP`, repository slug `shared-room-mcp`.
- `git status --short` 最後為乾淨。

### 剩餘風險

- Zeabur live URL 尚未在本階段重新部署與實機驗證；本次只完成本地 smoke 與 GitHub push。
- YouTube demo URL 仍是 TODO，需要錄製三分鐘內英文語音 demo 後填入。
- JSON persistence 是單一服務實例 MVP 解法，不適合水平擴展或高併發；正式版仍建議 Redis 或 PostgreSQL。
- P1 公式如服務費、時薪制、KTV 低消、折扣階梯仍維持 `manual_input_required`，demo 不應讓 Agent 宣稱已完整自動計算。

### 下一個 resume point

- 部署 Zeabur 最新 commit `fd26055`，確認 live `/healthz`、WebMCP 右側工具列表、`create_action_proposal` 草稿 UI、JSON persistence volume，最後更新 YouTube demo URL。

## 2026-09-01 WebMCP Codex Loop Scenario Validation

- Added `semantic_repair_draft` as a proposal-only draft type for Codex field/label repair suggestions. Drafts remain `pending_host_confirmation` and do not apply repairs, settle money, submit bookings, write payment data, or sync external systems.
- Added member-scoped browser identity support through `?member=<name>` so host and participant tabs can be tested in the same browser without sharing the same participant identity.
- Tightened local OCR number handling so quantity-like numbers such as cups, people, tickets, hours, boxes, and packs are not selected as item prices when a later price exists on the same line.
- Tightened English and Chinese scenario taxonomy for service fees, parking, shipping gaps, salon/service drafts, ticket activities, sports venues, rentals, and snacks.
- Added a 12-scenario matrix under `docs/ai-generated/2026Q3/shared_room_demo_scenario_matrix_20260901.md`: 6 Chinese scenarios and 6 English scenarios, all with unique IDs and unique titles.

### 驗證證據

- `npm run check` passed.
- Final local stress matrix passed on a clean local instance: `BASE_URL=http://127.0.0.1:3146 REPEAT=20 TIMEOUT_MS=20000 node /private/tmp/shared-room-unique-stress.mjs`.
- Total runs: 240. Passed: 240. Failed: 0.
- Unique scenario IDs: 12. Unique scenario titles: 12. Duplicate IDs: 0.
- Language split: 6 Chinese scenarios and 6 English scenarios.
- Every scenario routed to the expected task type in 20/20 runs.
- Every generated Codex repair draft stayed as `semantic_repair_draft` with status `pending_host_confirmation`.
- Remaining expected warning: `drink_without_size_or_addon_options` appeared only for the Chinese office drink fixture because the fixture intentionally omits sweetness, ice, and size options. The app correctly keeps that as a human-review warning instead of inventing options.

### 剩餘風險

- The 12 scenario matrix currently validates unique text/task flows. The available image assets are 4 reusable visual families with 3 variants each, not 12 fully distinct photographed receipts/forms.
- Long stress runs with hundreds of uploaded image rooms make JSON persistence slower because every room stores processed image data. This is acceptable for MVP/demo volume but should move to Redis/PostgreSQL/object storage before high-concurrency production use.

## 2026-09-01 Additional Mutual-Exclusion Scenario Stress

- Added a second 12-scenario matrix with new cases that do not reuse the original scenario names or source text: breakfast pickup, BBQ group buy, yoga signup, board game room, meeting room, camping rental, pastry box, farmers market bulk order, pottery workshop, airport shuttle, volleyball court, and pet grooming draft.
- Ran a mutual-exclusion matrix against the original 12 scenarios and the second 12 scenarios. Result: candidate duplicate IDs 0, candidate duplicate titles 0, candidate duplicate OCR texts 0, combined duplicate IDs 0, combined duplicate titles 0, internal similarity blocks 0, baseline similarity blocks 0.
- Ran split language stress tests instead of mixing languages in one run.
- Chinese split: 6 scenarios x 20 rounds = 120 runs, 120 passed, 0 failed, 0 warnings.
- English split: 6 scenarios x 20 rounds = 120 runs, 120 passed, 0 failed, 0 warnings.
- Combined second-matrix validation: 240 runs, 240 passed, 0 failed, 0 warnings.
- Every run generated `semantic_repair_draft` and left it in `pending_host_confirmation`.

### 修復項目

- Tightened drink task inference so a single drink-like item no longer overrules a restaurant or shared-cost scenario.
- Moved ticket/voucher signals before drink signals so voucher lines such as `飲品券` do not force drink-order routing.
- Added meeting-room, classroom, and studio terms to venue-like routing.
- Removed generic cleaning fee as a KTV routing trigger; KTV now depends on KTV/room/minimum-spend specific signals.
- Stopped dropping priced delivery lines before OCR extraction; delivery fees are retained as service-fee evidence.

### 驗證證據

- Evidence file: `docs/ai-generated/2026Q3/shared_room_demo_scenario_matrix_b_20260901.md`.
- `npm run check` passed before split stress.
