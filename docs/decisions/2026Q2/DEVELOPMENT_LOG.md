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
- 目前任何房間成員都可清空房間；正式版需要發起者權限或一次性管理碼。
- OCR 與邊界判定準確度取決於圖片清晰度；正式版需要加入人工校正欄位與保存校正紀錄。
- 尚未加入匯出 Excel 或歷史訂單查詢。
- 本機未讀取 `.env`，因此沒有系統環境 key 時無法驗證 Gemini 圖片解析；部署到 Zeabur 並設定 `GEMINI_API_KEY` 後再做端到端圖片測試。
- Zeabur health check 會顯示 `hasGeminiKey`、`geminiKeyName`、`hasOpenAiKey` 與 `openAiKeyName`，用來確認 runtime 是否讀到 key。

### 資料治理狀態

- 無 DB、JSON、JSONL、CSV、TSV、雲端推送或 shared data 正式寫入。
- 無金鑰寫入 repository；僅提供 `env.sample` 變數名稱。

## 2026-09-01

### 已完成

- 將專案重新收斂為英文預設的開源 WebMCP tool-layer template：主軸是 pre-commitment social coordination，不主張 AI 執行付款、正式送單或要求部署者提供公開可變更 API。
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
- Final local stress matrix passed on a clean local instance using a temporary JSON room store and the local unique-scenario stress runner.
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

## 2026-09-01 11:21 Closeout Governance

Scope:

- Owner project: `shared-room-mcp`
- Changed artifacts: `README.md`, `docs/submission/WEBMCP_SUBMISSION.md`, `docs/security/SECURITY_SCAN_EVIDENCE.md`, `docs/security/PACKAGE_REPUTATION_EVIDENCE.md`, `docs/testing/VALIDATION_EVIDENCE.md`, `server.js`, `public/index.html`, `package.json`, `env.sample`
- Latest validation evidence: `npm run check` passed; `git diff --check` passed; public wording scan found no hype or overclaiming terms.

DONE_CONFIRMED:

- Rewrote the public README opening into an evidence version instead of a hype version.
  - evidence: `README.md` now has `How We Checked It` with actual run counts and a clear non-production disclaimer.
- Added a tracked validation summary.
  - evidence: `docs/testing/VALIDATION_EVIDENCE.md` records local repeated room flows, host-only draft review, Load Sample Room, live Zeabur smoke, and short JSON save-burst checks.
- Synchronized submission and security evidence wording.
  - evidence: `docs/submission/WEBMCP_SUBMISSION.md` points to the validation summary; `docs/security/SECURITY_SCAN_EVIDENCE.md` includes JSON save queue and 25-room save-burst evidence.

PRIORITY_INDEX:

- Push and redeploy the evidence-version patch after human review.
  - next action: run final local validation, then commit, push, and deploy to Zeabur only after explicit approval.
  - risk if ignored: GitHub and the live app may still show the older wording or older behavior.

WATCH_LATER:

- JSON save layer remains a demo/single-service choice.
  - trigger to revisit: move to Redis or PostgreSQL before real multi-instance traffic.

INTENTIONALLY_NOT_DO:

## 2026-09-01 20:06 Closeout Governance

Scope:

- Owner project: `shared-room-mcp`
- Changed artifacts: `scripts/stress-open-gate.mjs`, `docs/testing/VALIDATION_EVIDENCE.md`, `docs/security/SECURITY_SCAN_EVIDENCE.md`, `docs/ai-generated/2026Q3/shared_room_task_gap_decoupling_audit_20260831.md`
- Latest validation evidence: `npm run check` passed; `node --check scripts/stress-open-gate.mjs` passed; `git diff --check` passed; public wording scan found no stale double-confirmation, hype, overclaiming, payment, or browser-replacement terms; public path and secret pattern scan found no local paths or key-like values; `npm audit --audit-level=moderate --omit=dev` passed with `0` vulnerabilities; `ai-security-rules export-gate` and `deploy-gate` passed with blocking `0`.

DONE_CONFIRMED:

- GitHub repository metadata was completed.
  - evidence: `gh repo view jiarong0423/shared-room-mcp` shows description, homepage `https://shared-room-mcp.zeabur.app/`, MIT license, public visibility, and topics `webmcp`, `codex`, `agent-native-web`, `human-in-the-loop`, and `open-source`.
- Zeabur live HTML no longer serves the old duplicate-review copy.
  - evidence: live cache-busted HTML returned `Cache-Control: no-store`, old hits `0`, and expected hits for `Shared Room`, `Download HTML`, `Download PDF`, and `Owner Finalizes Summary`.
- The official open-gate stress flow now verifies export files.
  - evidence: `npm run stress:open-gate -- --base-url http://127.0.0.1:3184 --rounds 5 --output-dir logs/runtime` passed 20/20 and now checks valid HTML/PDF after host settlement.
- The live service passed the same export-aware open-gate flow.
  - evidence: `npm run stress:open-gate -- --base-url https://shared-room-mcp.zeabur.app --rounds 1 --output-dir logs/runtime` passed 4/4 and checked host review, member confirmation, settlement, HTML export, and PDF export.
- Security and submission evidence were updated with the final export recheck.
  - evidence: `docs/testing/VALIDATION_EVIDENCE.md` and `docs/security/SECURITY_SCAN_EVIDENCE.md` include the 20/20 final open-gate export recheck.

PRIORITY_INDEX:

- Zeabur deployment record `6a96c02040c09e36c3eba584` remained in `BUILDING` while the existing live service was already clean and passed live smoke.
  - next action: recheck Zeabur deployment list before recording; use the current live URL only after smoke remains green.
  - risk if ignored: the service can be functionally clean while the newest deployment record has not yet finished rotating.

WATCH_LATER:

- JSON persistence remains a single-service demo storage layer.
  - trigger to revisit: production or multi-instance use should move rooms and uploaded image data to Redis/PostgreSQL/object storage.

INTENTIONALLY_NOT_DO:

- No new payment, booking, browser-control, or external vendor submission path was added.
  - reason: the competition demo boundary remains assistant draft plus human final approval.

Next resume point:

- Recheck Zeabur deployment list, then use `https://shared-room-mcp.zeabur.app/?v=<timestamp>` for recording if live HTML still has old hits `0` and live `stress:open-gate` remains green.

- Did not claim production-scale capacity.
  - reason: current evidence supports hackathon/demo repeatability, not thousands of concurrent users.
- Did not expose payment, booking submission, or external write APIs.
  - reason: the product boundary keeps final decisions with humans.

Next resume point:

- Run `npm run check`, frontend visible-text scan, `npm run audit:tasks`, and `git diff --check`; then inspect `git status --short` before any push or Zeabur deployment.

## 2026-09-01 11:42 GitHub And Zeabur Deployment Closeout

DONE_CONFIRMED:

- Committed and pushed evidence-version patch.
  - evidence: Git commit `58a77a8 Polish evidence-backed submission flow` pushed to `origin/main`.
- Deployed to the approved Zeabur target.
  - evidence: the Zeabur deployment reached `RUNNING`; platform-internal project identifiers are intentionally omitted from the public log.
- Verified live runtime after cutover.
  - evidence: `https://shared-room-mcp.zeabur.app/healthz` returned `roomStorePath=/data/rooms.json`, `roomPersistDebounceMs=35`, `roomPersistJitterMs=120`, `hasGeminiKey=false`, and `hasOpenAiKey=false`.
- Verified live flow after cutover.
  - evidence: `npm run stress:open-gate -- --base-url https://shared-room-mcp.zeabur.app --rounds 1 --output-dir logs/runtime` passed 4/4.

WATCH_LATER:

- The live service currently has no provider API keys configured.
  - trigger to revisit: add optional provider keys only if the demo must show image repair through an external model instead of no-key sample/copied-text flow.

Next resume point:

- Use the live room for recording. The intended demo flow is: Codex inspects and drafts through WebMCP, the host reviews the list, a second tab joins as a member, and the human clicks the final confirmation.

## 2026-09-01 12:00 Submission Diff Sweep Closeout

Scope:

- Owner project: `shared-room-mcp`
- Compared state: local `HEAD=35d5f80` matched `origin/main=35d5f80` before this sweep; local working tree then contained only README diagram and audit timestamp changes.
- Changed artifacts: `README.md`, `THREAT_MODEL.md`, `docs/ai-generated/2026Q3/shared_room_mermaid_module_design_20260831.md`, `docs/ai-generated/2026Q3/shared_room_task_gap_decoupling_audit_20260831.md`, `docs/security/public-export-manifest.md`, `scripts/task-gap-audit.mjs`

DONE_CONFIRMED:

- Found and fixed a real diagram omission.
  - evidence: README and Mermaid design now show JSON room storage, short write smoothing, and Zeabur volume path.
- Found and fixed a public export manifest omission.
  - evidence: manifest now includes `docs/testing/VALIDATION_EVIDENCE.md`, scenario evidence docs, `scripts/stress-local-contracts.mjs`, and `scripts/stress-open-gate.mjs`.
- Found and fixed stale audit wording.
  - evidence: `scripts/task-gap-audit.mjs` no longer regenerates the old live-pending conclusion and points to tracked validation evidence.
- Re-ran local checks after the fixes.
  - evidence: `npm run check` passed; `npm run audit:tasks` passed with `8/8`; `git diff --check` passed; Mermaid block scan found no missing diagram type or bracket mismatch.
- Re-ran local security gates after the manifest/script change.
  - evidence: ai-security-rules `rules-check`, `export-gate`, and `deploy-gate` all passed with blocking `0`, P0 `0`, P1 `0`, P2 `0`.

WATCH_LATER:

- The audit report still contains internal marker names because it is a developer evidence artifact generated by `scripts/task-gap-audit.mjs`.
  - trigger to revisit: if the public repo needs a fully non-technical package, move this generated audit to internal docs and keep only `docs/testing/VALIDATION_EVIDENCE.md` public.

Next resume point:

- Commit and push the submission diff sweep so GitHub no longer lacks the README/Mermaid persistence diagram and manifest entries.

## 2026-09-01 16:28 Locked Demo Runbook

Scope:

- Owner project: `shared-room-mcp`
- Changed artifacts: `README.md`, `docs/submission/WEBMCP_SUBMISSION.md`

DONE_CONFIRMED:

- Locked the recording flow into two scenes instead of an open-ended demo.
  - Scene A: English Restaurant Split.
  - Scene B: Chinese Group Buy / Free Shipping or Drink Order.
- Locked the operator rhythm for recording.
  - Agent opens/inspects/drafts.
  - Agent pauses before every approval, member confirmation, and finalization.
  - Human clicks only after the agent explicitly says it is ready.
- Synchronized the README demo summary with the detailed submission runbook.
  - evidence: `README.md` links to `docs/submission/WEBMCP_SUBMISSION.md#locked-demo-runbook`.

Next resume point:

- Use the locked runbook for the next recording pass. Do not approve all drafts together; approve one visible draft, wait for the state change, then continue to second-member confirmation.

## 2026-09-01 16:33 Closeout Governance

Scope:

- Owner project: `shared-room-mcp`
- Changed artifacts: `README.md`, `docs/submission/WEBMCP_SUBMISSION.md`, `docs/decisions/2026Q2/DEVELOPMENT_LOG.md`
- Latest validation evidence: `git diff --check` passed; old demo-script scan returned no stale timed-script matches.

DONE_CONFIRMED:

- Demo flow is now locked in the public submission packet.
  - evidence: `docs/submission/WEBMCP_SUBMISSION.md` contains `Locked Demo Runbook`.
- GitHub README points to the same flow instead of carrying a separate older script.
  - evidence: `README.md` links to `docs/submission/WEBMCP_SUBMISSION.md#locked-demo-runbook`.
- Operator rule is written down for recording.
  - evidence: the runbook requires the agent to pause before approval, member confirmation, and finalization.

WATCH_LATER:

- The locked runbook should be followed during the next recording pass.
  - trigger to revisit: if the live UI labels change or the second-member flow is adjusted before recording.

INTENTIONALLY_NOT_DO:

- Did not redeploy Zeabur for this change.
  - reason: this pass changes documentation and recording flow only, not runtime files.

Next resume point:

- Record from the live page using the locked two-scene runbook: English Restaurant Split, then Chinese Group Buy / Free Shipping or Drink Order.

## 2026-09-01 16:46 Positioning Tightening

Scope:

- Owner project: `shared-room-mcp`
- Changed artifacts: `README.md`, `docs/submission/WEBMCP_SUBMISSION.md`

DONE_CONFIRMED:

- Raised the public wording from a group-buy or form-filling tool to an open-source trust boundary layer for the agent-native web.
  - evidence: README and submission packet now open with "AI prepares the work; humans approve the commitment."
- Kept the demo narrow without shrinking the product claim.
  - evidence: the recording script still uses one English scene and one Chinese scene, while the closing line states that the pattern applies before payment, booking submission, regulated purchase approval, public posting, or external account action.

Next resume point:

- Run documentation checks and security gate, then push if the tree stays clean.

## 2026-09-01 17:36 Naming And Export Route Closeout

Scope:

- Owner project: `shared-room-mcp`
- Changed artifacts: `README.md`, `docs/submission/WEBMCP_SUBMISSION.md`, `docs/security/SECURITY_SCAN_EVIDENCE.md`, `docs/testing/VALIDATION_EVIDENCE.md`, `server.js`, `public/index.html`, `package.json`, `scripts/stress-local-contracts.mjs`, `scripts/stress-open-gate.mjs`, `scripts/task-gap-audit.mjs`

DONE_CONFIRMED:

- Locked public UI naming.
  - evidence: English title remains `Shared Room`; Chinese UI title is `智慧共享空間`; repository and submission name remain `Shared Room MCP`.
- Removed stale public-facing wording.
  - evidence: stale-term scan returned no matches for old room names, hype claims, browser-replacement claims, or payment automation claims.
- Added backend HTML and PDF review-record export routes.
  - evidence: `/api/rooms/:roomId/export.html` and `/api/rooms/:roomId/export.pdf` are read-only routes and return 409 until the room has reviewed items and a positive total.
- Re-ran the affected flow under stress settings.
  - evidence: `scripts/stress-open-gate.mjs --rounds 20` passed 80/80 local cases against `http://127.0.0.1:3162`; then 80 HTML exports and 80 PDF exports passed.

WATCH_LATER:

- Export records are local review summaries only.
  - trigger to revisit: add signed export metadata or stronger participant identity before business or private-community production use.

Next resume point:

- Run `npm run check`, `npm run audit:tasks`, security gates, and live smoke after GitHub push and Zeabur redeploy.

## 2026-09-01 17:44 Post-Deploy Export Closeout

Scope:

- Owner project: `shared-room-mcp`
- Changed artifacts: `docs/testing/VALIDATION_EVIDENCE.md`, `docs/security/SECURITY_SCAN_EVIDENCE.md`, `docs/decisions/2026Q2/DEVELOPMENT_LOG.md`
- Deployed commit: `f806d69`
- Zeabur export deployment: `RUNNING`; platform-internal deployment identifier omitted from the public log

DONE_CONFIRMED:

- GitHub main received the naming and export commit.
  - evidence: `git push origin main` updated `main` to `f806d69`.
- Zeabur was redeployed to the approved service and reached `RUNNING`.
  - evidence: the Zeabur export deployment reached `RUNNING`; platform-internal project identifiers are intentionally omitted from the public log.
- Live page served the current wording and export controls.
  - evidence: live HTML contained `Evidence And Items`, `Owner Finalizes Summary`, `Download HTML`, and `智慧共享空間`.
- Live backend export routes worked.
  - evidence: 4 live completed rooms exported once as HTML and once as PDF; 8/8 exports passed with HTML `text/html` and PDF `%PDF-1.4` plus `%%EOF`.

WATCH_LATER:

- The next recording pass should use the live page after cache-busting reload.
  - trigger to revisit: if the browser still shows the old title or lacks `Download HTML`, reload with a fresh `?v=` query.

Next resume point:

- Recording can start from `https://shared-room-mcp.zeabur.app/` using one English scene and one Chinese scene. The agent should stop before final confirmation and tell the human which button to press.

## 2026-09-01 17:54 Architecture And Export Readability Recheck

Scope:

- Owner project: `shared-room-mcp`
- Changed artifacts: `docs/ai-generated/2026Q3/shared_room_mermaid_module_design_20260831.md`, `public/index.html`, `docs/testing/VALIDATION_EVIDENCE.md`, `docs/security/SECURITY_SCAN_EVIDENCE.md`, `docs/decisions/2026Q2/DEVELOPMENT_LOG.md`

DONE_CONFIRMED:

- Standalone Mermaid architecture was updated to match the README export boundary.
  - evidence: `shared_room_mermaid_module_design_20260831.md` now includes human export, HTML download, PDF download, print summary, and the rule that exports do not submit forms or change external systems.
- Visible evidence-photo download naming no longer uses the old menu wording.
  - evidence: `public/index.html` downloads saved evidence as `evidence-photo-<room>.jpg`.
- Exported files are readable.
  - evidence: live room `191fd8c3` HTML/PDF exports downloaded successfully; `file` identified UTF-8 HTML and PDF 1.4; `pdftotext` extracted readable room status, item summary, total, and confirmation text.
- Public wording and private-data scans passed after the recheck.
  - evidence: tracked-file scans returned no stale public wording, local file paths, Codex attachment paths, Google Sheet URLs, common token prefixes, private keys, or raw media references.
- Public export gate passed after the recheck.
  - evidence: local ai-security-rules export-gate output outside the repository, blocking `0`, P0 `0`, P1 `0`, P2 `0`.

Next resume point:

- Commit, push, and redeploy this small architecture/download-name cleanup before recording.

## 2026-09-01 18:03 Public Path And Private Algorithm Recheck

Scope:

- Owner project: `shared-room-mcp`
- Changed artifacts: `docs/ai-generated/2026Q3/shared_room_demo_scenario_matrix_20260901.md`, `docs/ai-generated/2026Q3/shared_room_demo_scenario_matrix_b_20260901.md`, `docs/security/SECURITY_SCAN_EVIDENCE.md`, `docs/testing/VALIDATION_EVIDENCE.md`, `docs/decisions/2026Q2/DEVELOPMENT_LOG.md`

DONE_CONFIRMED:

- Removed local scratch paths from public evidence documents.
  - evidence: tracked-file scan returned no local machine paths, desktop media references, Codex attachment paths, pasted attachment paths, or spreadsheet document links.
- Checked whether the public repo contains private algorithm material.
  - evidence: no sensitive scoring weights, non-public topology notes, restricted notes, or private business rules were found. Broad keyword hits were limited to embedded 1x1 PNG test fixtures.
- Public export gate still passed after the path scrub.
  - evidence: local ai-security-rules export-gate output outside the repository, blocking `0`, P0 `0`, P1 `0`, P2 `0`.

Decision:

- No private algorithm extraction is required for the current open-source submission. The repository exposes the intended template logic and WebMCP boundary contract, while optional commercial integrations remain outside the core.

Next resume point:

- Commit, push, and redeploy the path-scrub evidence update if runtime files changed; otherwise push documentation only.

## 2026-09-01 19:24 Single Draft Card Cleanup

Scope:

- Owner project: `shared-room-mcp`
- Changed artifacts: `server.js`, `public/index.html`, `scripts/stress-local-contracts.mjs`, `scripts/stress-open-gate.mjs`, `README.md`, `docs/submission/WEBMCP_SUBMISSION.md`, `docs/ai-generated/2026Q3/shared_room_mermaid_module_design_20260831.md`, `docs/ai-generated/2026Q3/shared_room_proposal_ui_relationship_matrix_20260901.md`, `docs/testing/VALIDATION_EVIDENCE.md`, `docs/security/SECURITY_SCAN_EVIDENCE.md`, `docs/decisions/2026Q2/DEVELOPMENT_LOG.md`

Direct cause:

- The UI could show two pending draft cards for one host decision, and the first approval click added extra copy that looked like another confirmation dialog.

Root cause:

- Backend draft storage allowed same-type pending drafts to stack, while the frontend rendered all pending drafts without collapsing equivalent decisions.

DONE_CONFIRMED:

- Backend proposal creation now replaces older pending proposals with the same proposal type.
- Frontend proposal rendering now hides duplicate same-type pending cards from older persisted rooms.
- Extra approval/rejection hint copy was removed, so the human sees one visible draft card and one same-card review path.
- Public docs and Mermaid architecture now describe same-card host review instead of the older ambiguous review wording.
- Local stress evidence passed after the cleanup.
  - evidence: `logs/runtime/local-contract-stress-2026-09-01T11-24-48-624Z.md` passed 60/60 and checks same-type draft replacement.
  - evidence: `logs/runtime/open-gate-stress-2026-09-01T11-22-05-897Z.md` passed 20/20.
- Security export gate passed after the cleanup.
  - evidence: security report written outside the repository, blocking `0`, P0 `0`, P1 `0`, P2 `0`.
- Impact matrix was rerun.
  - evidence: `output/isolation/current_runs/shared_room_proposal_ui_dedupe_20260901_final_latest/impact_evidence_state_gate.md`.

WATCH_LATER:

- GitHub and Zeabur still need an explicit push/deploy pass for this cleanup. The local gate is ready; live has not received this change yet.

Next resume point:

- Run `git diff --check`, inspect the final diff, then commit, push, and redeploy only after approval.

## 2026-09-02 Railway Production Recovery

Scope:

- Owner project: `shared-room-mcp`
- Cloud target: Railway production service with a persistent `/data` volume
- Public URL: `https://sharedroom.jace0423.com`

DONE_CONFIRMED:

- Railway is connected to `jiarong0423/shared-room-mcp` on `main` and reports the service online.
- Persistent room storage is enabled with `ROOM_STORE_PATH=/data/rooms.json`.
- The deployment health check is `/healthz` on port `8080`.
- Cloudflare publishes the Railway CNAME and ownership-verification TXT records as DNS-only records.
- Railway accepted the custom domain and removed the pending DNS state.
- Public HTTPS checks passed for the homepage and `/healthz` with HTTP 200.
- The Socket.IO polling handshake passed with HTTP 200 and advertised a WebSocket upgrade.
- The in-app browser loaded the production UI and detected the seven expected WebMCP tools.

Next resume point:

- Use `https://sharedroom.jace0423.com` as the live judging and recording URL. Keep the Railway generated domain only as a fallback.

## 2026-09-02 Railway Five-Round Low-Rate Smoke Test

Scope:

- Production URL: `https://sharedroom.jace0423.com`
- Method: five sequential end-to-end rooms with deliberate delays; no concurrency or stress traffic

DONE_CONFIRMED:

- Five fresh-room workflows passed: `bbcb431e`, `85fc826a`, `ccb7f9f8`, `081b7a5c`, and `14b70245`.
- Every passing round covered sample loading, same-card host draft review, member opening, a second participant joining, self-selection, self-confirmation, owner finalization, and enabled HTML/PDF exports.
- Round one export files were downloaded from production and identified as readable HTML and a one-page PDF 1.4 document; PDF text extraction contained the finalized room, item, person, and total.
- WebMCP tools were detected on both host and member pages throughout the production run.

WATCH_LATER:

- After finalizing a room, using `New Room` in the same browser tab creates an empty room but leaves `Load Sample Room` disabled. A fresh browser tab is unaffected. The likely direct cause is that `startNewRoom()` renders the new room without resetting the upload/button state previously derived from the finalized room.

Next resume point:

- Repair and regression-test the same-tab `New Room` button state before recording repeated rooms in one tab. The public first-visit judging path is otherwise ready.

## 2026-09-02 03:00 Room Transition State Isolation

Scope:

- Owner project: `shared-room-mcp`
- Changed runtime artifact: `public/index.html`
- Validation target: local browser only; no cloud deployment or cloud stress traffic

Direct cause:

- `Load Sample Room` was disabled from the previous room inside `setUploading()`, but `startNewRoom()` rendered the new empty room without recalculating that control state.

Root cause:

- Room identity changes, room-scoped temporary UI state, and asynchronous room responses did not share one transition boundary. API-only and fresh-tab tests did not cover same-tab cross-room state.

DONE_CONFIRMED:

- Added one `switchRoom(room)` boundary for initial load, new-room creation, missing-room recovery, and same-room reset.
- Room transitions now clear pending upload previews, proposal confirmation staging, source-image transforms, summary-tab state, copied OCR text, and room messages while preserving language and display-name preferences.
- Every room render recalculates upload and sample controls from the current room plus upload/transition state.
- New-room and reset transitions block overlapping upload/transition actions.
- Fetch and Socket.IO callbacks capture their target room and ignore responses that no longer match the current room.
- Socket `roomState` and `presenceState` events are ignored during room transitions and when their room id differs from the current URL room.
- Local browser regression 1 passed: loaded room A -> New Room B -> `Load Sample Room` enabled -> sample loaded only into B.
- Local browser regression 2 passed: after the host switched from room A to room B, a second tab updated A; the host remained on B with the empty-room controls intact.
- Browser console warning/error check passed with no entries in either test tab.
- `npm run check`, inline-script syntax check, `npm run audit:tasks`, and `git diff --check` passed.
- `ai-security-rules rules-check` passed with critical `0`, high `0`, blocking `0`, P0 `0`, and P1 `0`; the audit-only report was written outside the repository.
- `ai-security-rules export-gate` passed after documentation and identifier cleanup with blocking findings `0`, P0 `0`, P1 `0`, and P2 `0`; the audit-only report was written outside the repository.
- `ai-security-rules deploy-gate` passed before commit with blocking findings `0`, P0 `0`, P1 `0`, and P2 `0`; the audit-only report was written outside the repository.

Release scenario matrix:

| Scenario | Expected | Result | Evidence |
|---|---|---|---|
| Existing room render | Controls derive from the room currently shown | passed | every `renderRoom()` now recomputes upload, reset, and sample controls |
| Loaded room A -> New Room B | B receives a clean URL, clean temporary UI state, and enabled sample action | passed | isolated local browser regression 1 |
| Same-room reset | Reset keeps the room URL but clears the room through the same transition boundary | passed | second-tab reset completed while the first tab remained isolated |
| Late fetch or Socket.IO response | A response for A cannot render over B | passed | target-room guards plus isolated local browser regression 2 |
| Overlapping upload or room switch | New upload/switch actions stop until the active transition ends | passed | transition lock is checked by upload, new-room, reset, and write actions |
| Backend room/calculation contract | No backend formula, persistence, settlement, or export behavior changes | passed | changed runtime scope is limited to `public/index.html`; existing backend checks passed |
| Git release | New commit is visible on public `main` | passed | commit `bdaab1f` is on `origin/main`; GitHub About uses the custom production URL |
| Cloud runtime | Two locked production E2E cases pass on the deployed commit | passed | exactly two low-rate browser cases passed after the production HTML exposed the new transition code |

Impact state before release:

| Layer | State | Reason |
|---|---:|---|
| Frontend room transition | O | two isolated browser regressions passed |
| Async callback boundary | O | target-room guards are present on affected fetch and Socket.IO callbacks |
| Old-room event isolation | O | second-tab old-room update could not overwrite the new room |
| Backend calculations and persistence | O | no backend file or data contract changed |
| Human confirmation and payment boundary | O | proposal, confirmation, settlement, and no-payment rules are unchanged |
| Git release | O | commit `bdaab1f` is visible on public `main` |
| Cloud runtime | O | exactly two low-rate production browser cases passed |

PRODUCTION_EVIDENCE:

- Production health returned HTTP 200 and reported `/data/rooms.json`, save smoothing `35/120`, and no optional provider keys.
- Production HTML contained `switchRoom(room)` and `isSwitchingRoom` after Railway deployed commit `bdaab1f`.
- Case 1 passed: room `2989812c` loaded the sample, switched in the same tab to room `ea7ba1b6`, restored the empty-room sample action, and loaded the sample only into the new room.
- Case 2 passed: the main tab switched from room `430977f9` to room `24125277`; resetting the old room in a second tab did not change the main URL, sample button, empty-room chip, or item count.
- Console warning/error lists were empty for the case 1 tab, case 2 main tab, and case 2 old-room tab.
- Production verification stopped after these two cases. No extra stress or concurrent cloud run was performed.
- The final impact evidence state gate returned `PASS`; frontend render, room transition, async callbacks, Socket.IO isolation, unchanged backend projection, Git release, and cloud runtime all have evidence-backed `O` states.

Next resume point:

- Use `https://sharedroom.jace0423.com/` for recording and the Devpost Live URL. The next remaining submission artifact is the public demo video URL.

## 2026-09-02 Bilingual Export And Recording Lock

Scope:

- Owner project: `shared-room-mcp`
- Changed runtime artifacts: `server.js`, `scripts/stress-open-gate.mjs`
- Changed public artifacts: `README.md`, `docs/submission/WEBMCP_SUBMISSION.md`, `env.sample`

Direct cause:

- The PDF route used one CJK font for every character, which made English text appear widely spaced even though the file was technically valid.

Root cause:

- Export checks verified PDF structure and extracted text, but did not verify the font resources or rendered bilingual appearance.

DONE_CONFIRMED:

- PDF output now uses Helvetica for Latin runs and MSung-Light for Chinese runs, with wider mixed-language spacing.
- The open-gate check now requires both font resources in every completed PDF export.
- One local round passed all four Chinese and English room scenarios, including draft boundary, second-member confirmation, owner finalization, HTML export, and PDF export.
- The English PDF was rendered and visually inspected; its text is compact and readable.
- The Chinese PDF was rendered and visually inspected after mixed-language spacing was widened; Chinese labels, room IDs, quantities, and totals no longer overlap.
- The recording script now assigns all routine page work to the agent and lists the human clicks in order: same-card review twice, member confirmation once, owner finalization once, PDF download, then HTML download.
- The recording uses a synthetic English activity signup image and a synthetic Chinese free-shipping group-buy image. It does not use private customer or payment data.

Release rule:

- The bilingual render check, security export gate, and deployment gate passed before commit. Both security gates reported blocking findings `0`, P0 `0`, P1 `0`, and P2 `0`.

Next resume point:

- Record the demo video with the locked script. Do not run another production stress pass before recording.

PRODUCTION_EVIDENCE:

- GitHub `main` received commit `4d133f2`.
- Railway automatically deployed the change; production `/healthz` returned HTTP 200, retained `/data/rooms.json`, and reported `menuParseRateLimitMax=30`.
- The in-app browser detected all seven WebMCP tools on the production page.
- One existing finalized room was used for a low-rate frontend check. The visible `Download PDF` and `Download HTML` controls each produced a file.
- `file`, `pdfinfo`, `pdftotext`, and a rendered-page inspection confirmed that the production PDF is a readable one-page PDF 1.4 file and that the HTML is readable UTF-8.
- No new production room stress, concurrency test, or repeated OCR upload was run after deployment.
