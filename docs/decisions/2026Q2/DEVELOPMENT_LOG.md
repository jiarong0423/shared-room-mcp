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
- `webMcpToolSurfaceVersion` 當時升級為 superseded pre-Adaptive tool-surface version，並在 README、submission packet、task gap audit 中同步標記 proposal-only tool。
- Submission packet public repository URL 已改為 pending，等最終 GitHub repository name 確認後再填。
- 已 commit 並 push：`fd26055 Add proposal-only WebMCP draft tool`。

### 驗證證據

- `npm run check` 通過。
- `npm run audit:tasks` 通過，7/7 checks ready，open gaps 2，partial gaps 2。
- `public/index.html` inline script syntax check 通過。
- `git diff --check` 通過。
- 本地 HTTP smoke 通過：`POST /api/rooms` 回 201，`POST /api/rooms/:roomId/agent-proposals` 回 201，讀回 `proposalCount=1`、`firstProposalStatus=pending_host_confirmation`、`allowedEffect=draft_only`、`moneyTotalUnchanged=true`。
- 重啟 smoke 通過：同一個 `ROOM_STORE_PATH` 重啟後載入 `loadedCount=1`，同一 room 讀回 `proposalCount=1`、superseded pre-Adaptive proposal contract version 與 superseded pre-Adaptive WebMCP version。
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
  - evidence: `gh repo view jiarong0423/shared-room-mcp` showed the expected description, MIT license, public visibility, and topics `webmcp`, `codex`, `agent-native-web`, `human-in-the-loop`, and `open-source` at that time. The earlier homepage is superseded by the current active demo URL.
- Zeabur live HTML no longer serves the old duplicate-review copy.
  - evidence: live cache-busted HTML returned `Cache-Control: no-store`, old hits `0`, and expected hits for `Shared Room`, `Download HTML`, `Download PDF`, and `Owner Finalizes Summary`.
- The official open-gate stress flow now verifies export files.
  - evidence: `npm run stress:open-gate -- --base-url http://127.0.0.1:3184 --rounds 5 --output-dir logs/runtime` passed 20/20 and now checks valid HTML/PDF after host settlement.
- The live service passed the same export-aware open-gate flow.
  - evidence: a retired hosted URL passed 4/4 and checked host review, member confirmation, settlement, HTML export, and PDF export.
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

- SUPERSEDED: this historical recording target is retired. Use only `https://shared-room-mcp-next.zeabur.app/` for current recording.

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
  - evidence: the retired hosted health endpoint returned `roomStorePath=/data/rooms.json`, `roomPersistDebounceMs=35`, `roomPersistJitterMs=120`, `hasGeminiKey=false`, and `hasOpenAiKey=false`.
- Verified live flow after cutover.
  - evidence: a retired hosted smoke passed 4/4.

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

- SUPERSEDED: that earlier recording target is retired. Current recording starts from `https://shared-room-mcp-next.zeabur.app/` using one English scene and one Chinese scene. The agent should stop before final confirmation and tell the human which button to press.

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

## 2026-09-02 Retired Host Production Recovery (SUPERSEDED HISTORICAL EVIDENCE)

Scope:

- Owner project: `shared-room-mcp`
- Cloud target: retired production service with a persistent `/data` volume
- Public URL: retired custom domain
- Superseded status: the retired host was removed before recording after the operator stopped payment. This section is retained only as dated recovery evidence and is not an active deployment instruction.

DONE_CONFIRMED:

- The retired host was connected to `jiarong0423/shared-room-mcp` on `main` and reported the service online.
- Persistent room storage is enabled with `ROOM_STORE_PATH=/data/rooms.json`.
- The deployment health check is `/healthz` on port `8080`.
- Cloudflare published the retired host CNAME and ownership-verification TXT records as DNS-only records.
- The retired host accepted the custom domain and removed the pending DNS state.
- Public HTTPS checks passed for the homepage and `/healthz` with HTTP 200.
- The Socket.IO polling handshake passed with HTTP 200 and advertised a WebSocket upgrade.
- The in-app browser loaded the production UI and detected the seven expected WebMCP tools.

Next resume point:

- SUPERSEDED: do not use the retired custom domain as the live judging or recording URL. Current active target is `https://shared-room-mcp-next.zeabur.app/`.

## 2026-09-02 Retired Host Five-Round Low-Rate Smoke Test (SUPERSEDED HISTORICAL EVIDENCE)

Scope:

- Production URL: retired custom domain
- Method: five sequential end-to-end rooms with deliberate delays; no concurrency or stress traffic
- Superseded status: historical retired-host smoke evidence. Current production target is Zeabur at `https://shared-room-mcp-next.zeabur.app/`.

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
- Production HTML contained `switchRoom(room)` and `isSwitchingRoom` after the retired host deployed commit `bdaab1f`.
- Case 1 passed: room `2989812c` loaded the sample, switched in the same tab to room `ea7ba1b6`, restored the empty-room sample action, and loaded the sample only into the new room.
- Case 2 passed: the main tab switched from room `430977f9` to room `24125277`; resetting the old room in a second tab did not change the main URL, sample button, empty-room chip, or item count.
- Console warning/error lists were empty for the case 1 tab, case 2 main tab, and case 2 old-room tab.
- Production verification stopped after these two cases. No extra stress or concurrent cloud run was performed.
- The final impact evidence state gate returned `PASS`; frontend render, room transition, async callbacks, Socket.IO isolation, unchanged backend projection, Git release, and cloud runtime all have evidence-backed `O` states.

Next resume point:

- SUPERSEDED: do not use the retired custom domain for recording or Devpost. Current active target is `https://shared-room-mcp-next.zeabur.app/`.

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
- SUPERSEDED HISTORICAL EVIDENCE: the retired host automatically deployed the change at that time; production `/healthz` returned HTTP 200, retained `/data/rooms.json`, and reported `menuParseRateLimitMax=30`. It is no longer the active host.
- The in-app browser detected all seven WebMCP tools on the production page.
- One existing finalized room was used for a low-rate frontend check. The visible `Download PDF` and `Download HTML` controls each produced a file.
- `file`, `pdfinfo`, `pdftotext`, and a rendered-page inspection confirmed that the production PDF is a readable one-page PDF 1.4 file and that the HTML is readable UTF-8.
- No new production room stress, concurrency test, or repeated OCR upload was run after deployment.

## 2026-09-02 Zeabur-Only Recording Gate

Scope:

- Current recording target: `https://shared-room-mcp-next.zeabur.app/`
- Current cloud host: Zeabur
- Historical retired host: removed before recording after the operator stopped payment

Direct cause:

- Submission-facing docs still named the retired custom domain and described the retired host as current production after the live service moved back to Zeabur.

Root cause:

- Deployment evidence from earlier retired-host and Zeabur passes was mixed with the current recording target, so historical provider names were easy to read as the active deployment.

DONE_CONFIRMED:

- Current Zeabur `/healthz` returned HTTP 200 and reported `roomStorePath=/data/rooms.json`.
- Current Zeabur service kept the mounted `/data` volume and JSON persistence.
- A fresh production browser smoke on Zeabur loaded the page, loaded the sample room, opened it to members, claimed an item, confirmed the member cost, finalized the room, and triggered both HTML and PDF downloads.
- WebMCP `inspect_room` was available on the current Zeabur page.
- Browser console warning/error count was `0` during the pre-recording Zeabur smoke.
- `README.md`, `docs/submission/WEBMCP_SUBMISSION.md`, `docs/testing/VALIDATION_EVIDENCE.md`, and `docs/security/SECURITY_SCAN_EVIDENCE.md` were updated so the current public demo points to Zeabur. Older hosted URLs remain only as superseded historical evidence where explicitly framed by date.

Next resume point:

- Record from `https://shared-room-mcp-next.zeabur.app/`.
- Do not use any retired custom domain for recording unless DNS is later repointed to the current Zeabur service and rechecked.

## 2026-09-03 04:05 Superseded Host Cleanup

Scope:

- Owner project: `shared-room-mcp`
- Changed artifacts: `docs/decisions/2026Q2/DEVELOPMENT_LOG.md`, `docs/security/SECURITY_SCAN_EVIDENCE.md`, `docs/testing/VALIDATION_EVIDENCE.md`
- Latest validation evidence: post-deploy live Zeabur `/healthz` returned HTTP 200; live HTML exposed `Price Role`, `AI review score`, `scenario contract`, and `sourceNumberClass`; local HEAD and `origin/main` matched commit `4c770bc34ac5a2988022ea829e051243462895d3`.

DONE_CONFIRMED:

- Active deployment wording is Zeabur-only.
  - evidence: current target remains `https://shared-room-mcp-next.zeabur.app/`.
- Retired hosts are retained only as superseded dated evidence.
  - evidence: historical sections now include `SUPERSEDED HISTORICAL EVIDENCE` or equivalent superseded notes.

WATCH_LATER:

- GitHub repository About homepage should be rechecked if the public listing still points to an older host.
  - trigger to revisit: before final public submission or if judges report a stale homepage link.

Next resume point:

- Use `https://shared-room-mcp-next.zeabur.app/` as the only active demo, recording, and validation URL unless a future DNS migration is explicitly performed and revalidated.

## 2026-09-03 P0 Schema Decoupling Local Gate

Scope:

- Local-only architecture work after the recording flow exposed that text-only/parser-direct output can pollute member-selectable items.
- No GitHub push.
- No Zeabur deployment.
- No temporary production patch.

Direct cause:

- Parser output, review state, rule/audit rows, and member-selectable items were too close together. Some scenarios could pass regression while still hiding whether a number came from an image line, a rule, an audit total, or an actual selectable item.

Root cause:

- The earlier demo path optimized for fast recording and item extraction. It did not make the EvidenceAsset -> OcrObservation -> ParserCandidate -> Human Review -> SelectableItem/CalculationRule boundary explicit enough for enterprise-style scenario contracts.

DONE_CONFIRMED:

- Added a P0 evidence review contract under `config/evidence-review-contract.json`.
- Added runtime room layers for evidence assets, OCR observations, parser candidates, calculation rules, review decisions, and settlement snapshots.
- Added OCR-derived rule candidates for thresholds, discount policies, tax/service rates, deposits, prepayments, receipt totals, tendered cash/change, points, and transport rules.
- Added anti-pollution blocking before member open: pending candidates/rules, rule-like member rows, and missing evidence pointers block the flow.
- Updated frontend labels and the review panel so parser candidate count, calculation rule count, and anti-pollution blockers are visible.
- Updated the 12-scenario regression matrix so candidate counts, member item counts, rule counts, and member-layer forbidden values are checked separately.

VALIDATION:

- `npm run check`: PASS.
- `npm run verify:adaptive-contracts`: PASS.
- `npm run regression:adaptive-parser -- --base-url http://127.0.0.1:3181 --repeat 1 --timeout-ms 25000`: PASS.
- `npm run regression:adaptive-parser -- --base-url http://127.0.0.1:3181 --repeat 5 --timeout-ms 25000`: PASS with test-only local rate-limit overrides.

WATCH_LATER:

- Build the full P0.5 UI split for non-member ParserCandidate rows: per-candidate accept, reject, modify, and source focus.
- Add OCR bounding boxes and crop highlights when the OCR layer can provide geometry.
- Freeze SettlementSnapshot before PDF/HTML export so exports read immutable settlement evidence rather than live mutable room state.

Next resume point:

- Continue local P0.5 UI split and targeted browser QA.
- Do not push or deploy until the UI gate is reviewed locally.

## 2026-09-03 ServiceBlueprint P0 Final Lock Check

Scope:

- Locked the product boundary as a single-direction private task room.
- Added `ServiceBlueprint` as the external contract name and `hostTask` as the internal alias.
- Compressed the 12 scenario contracts into 4 reusable archetypes: `menu_unit_pricing`, `tiered_slot_booking`, `threshold_incentive`, and `posthoc_audit_split`.
- Kept `taskType` as an internal routing signal, but required every fixture to bind `language + contractId + archetypeId`.

Direct cause:

- The earlier scenario expansion could drift toward chat, negotiation, or bespoke back-office workflows instead of host-published tasks with receiver-side selection/confirmation.

Root cause:

- Scenario contracts, prompt nodes, WebMCP tool descriptions, and runtime room state did not share one explicit top-level commercial boundary. This made it possible for correct individual parsers to still imply the wrong product model.

DONE_CONFIRMED:

- Added `config/service-blueprint-contract.json`.
- Exposed `serviceBlueprintContractVersion=shared-room-service-blueprint.v1` through `/healthz`, room serialization, and the WebMCP tool surface.
- Updated WebMCP tool wording to private task room and ServiceBlueprint boundary language.
- Updated adaptive prompts so sparse evidence routes unknown or provider-only details to review instead of inventing hidden official options.
- Updated the 12-scenario fixture matrix so each case declares a known archetype and contract mapping.
- Removed the remaining agent-facing parser prompt wording that described the task as generic multi-person discussion-style coordination.

VALIDATION:

- `npm run verify:adaptive-contracts`: PASS, including 13 scenario contracts, 17 prompt nodes, 19 guardrails, 7 submit-gate stages, 11 evidence review layers, 4 ServiceBlueprint archetypes, and 12 scenarios.
- `node --check server.js`: PASS.
- `node --check scripts/regression-adaptive-parser.mjs`: PASS.
- Local `/healthz` on `127.0.0.1:4180`: PASS, returned `shared-room-service-blueprint.v1` and all 4 archetypes.
- `npm run regression:adaptive-parser -- --base-url http://127.0.0.1:4180 --repeat 1 --timeout-ms 25000`: PASS.
- `npm run regression:adaptive-parser -- --base-url http://127.0.0.1:4181 --repeat 5 --timeout-ms 25000`: PASS with test-only local rate-limit overrides.
- Residue scan for retired non-Zeabur host tokens and retired custom-domain tokens in active docs/config/fixtures/public/server/scripts: PASS, no active hits.
- Residue scan for chat/discussion wording in agent-facing active surfaces: PASS, no active hits.
- Fixture scan for empty `language`, `contractId`, or `archetypeId`: PASS.

LOCK_STATUS:

- Local project gate: OK.
- GitHub push: not performed in this lock check.
- Zeabur deployment: not performed in this lock check.

## 2026-09-03 Image-Matrix Oracle Gate

Scope:

- Ingested the external architecture review verdict that the previous state was `RISKY`.
- Added a checksum-backed image fixture oracle layer without committing the full large PNG matrix into the main repository.
- Kept the large generated image assets external to the source tree while making the repo able to validate them by manifest and runner.

Direct cause:

- Text-only regression was too easy to overclaim because copied OCR text already resembles the answer.
- The 115 generated PNGs existed as recording artifacts, but the code repository did not have a repeatable script that tied each image to scenario, language, contract, expected member-visible items, forbidden numbers, and quarantine output.

Root cause:

- The earlier test surface mixed artifact existence, parser behavior, OCR/provider quality, and release readiness into one claim. That made it possible to say "image matrix exists" without proving that each image has a stable oracle and repeatable execution path.

DONE_CONFIRMED:

- Added `config/image-fixture-manifest.schema.json`.
- Added `scripts/build-image-fixture-manifest.mjs`.
- Added `scripts/stress-image-matrix.mjs`.
- Added `fixtures/image-fixture-manifest.json` with 115 checksum-bound tests:
  - 60 English tests.
  - 55 Traditional Chinese tests.
  - 12 scenario contracts covered.
  - 5 OCR-risk/layout variants per covered language/scenario lane.
- Added production-safe pacing and 429 retry/backoff to the image-matrix runner.
- Split oracle assertions so parser candidates may contain rule/audit/non-price context, while member-visible items remain strictly checked for forbidden prices and forbidden names.
- Updated README and validation evidence to state that the 115/115 run is an oracle-chain check, not a Zeabur image-only OCR benchmark.

VALIDATION:

- `npm run build:image-fixture-manifest`: PASS, produced 115 tests.
- `node --check scripts/build-image-fixture-manifest.mjs`: PASS.
- `node --check scripts/stress-image-matrix.mjs`: PASS.
- Isolated local server used `ROOM_STORE_PATH=/private/tmp/webmcp_image_matrix_rooms_v3.json` with local-only high rate limits.
- `node scripts/stress-image-matrix.mjs --manifest fixtures/image-fixture-manifest.json --mode image-plus-oracle-text --delay-ms 0 --continue-on-failure --output-dir /private/tmp/webmcp_image_matrix_full_oracle_text_v4`: PASS, 115/115.

WATCH_LATER:

- Run a Zeabur production `image-only` pass at low rate after deployment, using the default slow runner pacing and quarantine output.
- Add a host-proposal accept step to the open-gate stress flow so the test state machine matches the stricter anti-pollution gate.
- Add front-end pre-open block reasons for pending parser candidates and calculation rules.

LOCK_STATUS:

- Local image oracle chain: OK.
- Zeabur image-only OCR/provider benchmark: not performed.
- GitHub push: not performed in this lock check.
- Zeabur deployment: not performed in this lock check.

## 2026-09-03 15:36 Pre-Push HITL And Export Boundary Closeout

Scope:

- Owner project: `/Users/sunjiarong/Developer/webmcp`
- Changed artifacts: `.gitignore`, `.zeaburignore`, `README.md`, `docs/security/public-export-manifest.md`, `docs/submission/WEBMCP_SUBMISSION.md`, `docs/testing/VALIDATION_EVIDENCE.md`, `public/index.html`, `scripts/stress-open-gate.mjs`
- Latest validation evidence: `/private/tmp/webmcp_open_gate_patch_check_v4/open-gate-stress-2026-09-03T07-35-47-266Z.md`

DONE_CONFIRMED:

- Fixed the `stress-open-gate` lifecycle simulation so the positive flow accepts the pending host review proposal before opening the member-facing list.
  - evidence: `npm run stress:open-gate -- --base-url http://127.0.0.1:3186 --rounds 5 --concurrency 2 --output-dir /private/tmp/webmcp_open_gate_patch_check_v4` passed 20/20.
- Preserved anti-pollution behavior for pending parser candidates and rule candidates.
  - evidence: the repaired open-gate script now explicitly checks that direct host open is rejected when `room.antiPollution.blocks` is non-empty.
- Added a visible frontend gate hint for pre-open AI/HITL review blocks.
  - evidence: extracted inline frontend script passed `node --check /private/tmp/webmcp_index_inline_after_patch.mjs`.
- Clarified public wording so the 115-image result is a deterministic contract-driven image-oracle integration benchmark, not a raw OCR accuracy benchmark.
  - evidence: `README.md`, `docs/submission/WEBMCP_SUBMISSION.md`, and `docs/testing/VALIDATION_EVIDENCE.md` now use the deterministic image-oracle wording.
- Updated public export boundaries for the new Adaptive Contract MCP artifacts.
  - evidence: `docs/security/public-export-manifest.md` now includes the evidence review contract, service blueprint contract, image-fixture schema, image manifest, and image runner scripts while excluding full PNG matrices and quarantine outputs.
- Added ignore coverage for generated coverage/quarantine folders.
  - evidence: `.gitignore` and `.zeaburignore` now exclude `coverage/` and `quarantine/`.

VALIDATION:

- `npm run check`: PASS.
- `node --check /private/tmp/webmcp_index_inline_after_patch.mjs`: PASS.
- `node --check scripts/stress-open-gate.mjs`: PASS.
- `npm run verify:adaptive-contracts`: PASS with 13 contracts, 17 prompt nodes, 19 guardrails, 7 submit-gate stages, 11 evidence review layers, 4 ServiceBlueprint archetypes, and 12 scenarios.
- `node scripts/build-image-fixture-manifest.mjs --out /private/tmp/webmcp_image_fixture_manifest_check_final.json`: PASS, produced 115 tests.
- Manifest reproducibility check ignoring only `generatedAt`: PASS.
- `git diff --check`: PASS.
- `node /Users/sunjiarong/.codex/skills/release-boundary-safety-gate/scripts/release_boundary_scan.mjs --root /Users/sunjiarong/Developer/webmcp --out /private/tmp/webmcp_prepush_release_boundary_20260903 --minSeverity MEDIUM`: PASS, 0 findings.
- `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=/Users/sunjiarong/Developer/ai-security-rules/src python3 -m ai_security_rules agent-review /Users/sunjiarong/Developer/webmcp --output-dir /private/tmp/webmcp_prepush_ai_security_agent_review_20260903`: PASS, P0=0, P1=0, P2=67.

PRIORITY_INDEX:

- Production `image-only` OCR/provider run is still separate from the 115/115 oracle benchmark.
  - next action: after GitHub push and Zeabur redeploy, run a low-rate `stress:image-matrix` production pass in `image-only` mode with quarantine output.
  - risk if ignored: public evidence remains integration-oracle evidence only, not hosted OCR/provider quality evidence.
- LocalGuard produced 105 MEDIUM/HIGH findings, mostly low-confidence entropy/API-route/client-role/cache heuristics over ignored runtime outputs, docs, route maps, and package strings.
  - next action: review or tune LocalGuard false positives before final public export packaging; do not treat this as a blocking secret finding because release-boundary and ai-security agent-review passed.
  - risk if ignored: noisy security scan output can distract reviewers from the actual public-export boundary.

INTENTIONALLY_NOT_DO:

- GitHub push was not performed in this closeout.
  - reason: this stage was a pre-push preventive audit and local repair pass.
- Zeabur redeploy was not performed in this closeout.
  - reason: deployment should happen only after the user approves the cleaned Git diff.

Next resume point:

- Review `git diff`, then commit and push if accepted; after that, redeploy Zeabur and run the production `image-only` smoke separately.

## 2026-09-03 16:05 Full Preventive Rescan Closeout

Scope:

- Re-scanned the project from source, docs, public export boundary, local runtime scripts, ignored runtime artifacts, and security scanners before GitHub push or Zeabur redeploy.

Findings:

- P1 fixed: active runtime and audit code still exposed superseded pre-Adaptive contract version names. The behavior was not broken, but health/WebMCP/audit output could carry stale architecture language after the project was locked as Shared Room MCP powered by Adaptive Contract MCP.
- P1 fixed: `stress-open-gate` could fail with HTTP 429 when run quickly beside other local stress tests under public-demo rate limits. This was a test configuration/rate-limit interaction, not a HITL state-machine failure.
- P1 remaining: `docs/submission/WEBMCP_SUBMISSION.md` still contains `TODO_YOUTUBE_DEMO_URL`; replace it only after the final public demo video is uploaded.
- P1 remaining: production `image-only` OCR/provider benchmark is still separate from the 115/115 deterministic image-oracle integration result.
- P1 product gap remaining: formula controls for service fee, hourly venue fee, deposit include/exclude, shipping allocation, group discount, and headcount threshold are still manual-review scope.

Changes:

- Renamed active contract version strings to `adaptive-contract-*` in runtime and task-gap audit expectations.
- Added HTTP 429 retry/backoff to `scripts/stress-open-gate.mjs` for JSON create/upload calls.
- Documented that repeated local stress runs should use test-only rate limits, while Zeabur keeps lower public-demo throttles.
- Tightened the public export manifest so `docs/ai-generated/` and `docs/decisions/` are excluded from the judge-facing public export surface as historical/internal evidence.

Validation:

- `npm run check`: PASS.
- `npm run audit:tasks`: PASS, 8/8 checks ready, 1 open gap, 2 partial gaps.
- `npm run verify:adaptive-contracts`: PASS, 13 contracts, 17 prompt nodes, 19 guardrails, 7 submit-gate stages, 11 evidence-review layers, 4 service-blueprint archetypes, 12 scenarios.
- `node --check` for stress/open-gate, image-matrix, manifest builder, regression parser, and task-gap audit: PASS.
- `git diff --check`: PASS.
- `npm audit --audit-level=high`: PASS, 0 vulnerabilities.
- release-boundary scan: PASS, 0 findings.
- ai-security-rules agent review: PASS, P0=0, P1=0, P2=67.
- Local open-gate runtime stress with test-only rate limits: PASS, 20/20.
- Local image-oracle runtime sample with test-only rate limits: PASS, 23/23.
- Active-source stale pre-Adaptive version names, retired non-Zeabur host tokens, and retired-domain scan: no matches in the judge-facing source/documentation surface.
- Historical/internal stale-string scan: expected hits remain only under `docs/ai-generated/` and `docs/decisions/`, which are excluded from the public export surface.

## 2026-09-03 17:31 Gemini Review Reconciliation Closeout

Scope:

- Reconciled the pasted external pre-launch security and architecture review against the actual local codebase.
- Owner project: `/Users/sunjiarong/Developer/webmcp`.

Adopted fixes:

- Public wording now defines Shared Room MCP as a form-based async state room, not a chatroom, messaging app, payment gateway, or auto-booking agent.
- Public wording now defines WebMCP as a page-local state reader and draft generator, not a browser-control agent that clicks final actions.
- Host open wording is documented as Member-Visibility Release while preserving the existing `Open To Members` UI label used by the locked demo flow.
- Prompt and evidence review contracts now include a complex-formula hard-stop: tax, service fee, deposit, prepayment, threshold, tiered discount, shipping split, and headcount formulas cannot become member-selectable line items before host review.
- Frontend fetch handling now renders explicit 429 retry guidance using the server's JSON `retryAfterSeconds` value instead of a generic failure message.
- Image-matrix oracle assertions now normalize currency/commas in price-like fields so formatted values cannot bypass forbidden-number checks.
- `docs/ai-generated/` was removed from the Git index and added to `.gitignore`; local files remain available, but historical AI draft material is no longer part of the public GitHub surface.
- Tracked-only stale-string scan no longer finds superseded version names, retired non-Zeabur host tokens, retired custom domains, overclaim wording, or Google Sheets production overclaims.

Rejected or deferred:

- Rejected boot-time failure when provider keys are missing. The no-key WebMCP demo is an explicit product boundary; missing optional model keys must degrade to local/manual review rather than crash.
- Deferred a full code/API rename of `openItemsForMembers` because it would create unnecessary demo-flow risk. The architecture wording is clarified without breaking the stable button/API path.
- The YouTube demo URL remains intentionally unresolved until the final video link exists.
- Production `image-only` OCR/provider quality remains a separate Zeabur run; the 115-image result remains an image-plus-oracle integration benchmark.

Validation:

- `npm run check`: PASS.
- `npm run verify:adaptive-contracts`: PASS, 13 contracts, 17 prompt nodes, 19 guardrails, 7 submit-gate stages, 11 evidence-review layers, 4 service-blueprint archetypes, 12 scenarios.
- `npm run audit:tasks`: PASS, 8/8 checks ready, 1 open gap, 2 partial gaps.
- `public/index.html` inline script extraction and `node --check`: PASS.
- `node --check scripts/stress-image-matrix.mjs`, `node --check scripts/stress-open-gate.mjs`, and `node --check scripts/build-image-fixture-manifest.mjs`: PASS.
- `git diff --check`: PASS.
- Local HTTP smoke with test-only rate limits: `stress:open-gate` PASS 8/8 against `127.0.0.1:3190`.
- Local image-oracle smoke with test-only rate limits: `stress:image-matrix --limit 6` PASS 6/6 against `127.0.0.1:3190`.
- `ai-security-rules scan`: PASS for critical/high, with 0 critical, 0 high, 67 medium governance/config-surface findings.
- `npm audit --audit-level=high`: not rerun in this reconciliation because the networked registry request was blocked by the security reviewer as an external dependency payload disclosure. Previous local closeout already recorded a successful npm audit; current dependency files were not changed in this reconciliation.

Release decision:

- Local source gate: OK except for the intentional YouTube submission placeholder and separate production image-only OCR/provider evidence gap.
- GitHub public surface: OK after removing tracked AI-generated draft docs from the index and confirming ignored runtime/data/output/quarantine paths are not tracked.
- Zeabur deployment: not performed in this reconciliation; deploy only after user approves the final diff and commit.

## 2026-09-03 17:55 P0 HITL Schema Closeout

Scope:

- Implemented the P0 schema decoupling follow-up for WebMCP + LLM collaboration + human host review.
- Owner project: `/Users/sunjiarong/Developer/webmcp`.

Changes:

- Added `boundingZone`, `detectedTypeHint`, `auditAnchor`, `auditAnchors`, and `reviewGates` to the OCR observation, parser candidate, calculation rule, and member-visible item path.
- Extended `config/evidence-review-contract.json` and every scenario contract output field list so the new review fields are contract-required rather than incidental runtime metadata.
- Strengthened Host Review UI with a two-column evidence review panel: source evidence/audit anchor on the left and suspicious-field review gate reasons on the right.
- Frontend `Open To Members` now checks anti-pollution blocks before sending the socket mutation, so host sees the blocking reason before the backend rejects it.
- Reworked guardrail memory writes into `negative_pattern_registry` events. The registry stores masked error patterns and routing instructions, not corrected answers, raw identifiers, or final prices.
- Fixed the first regression from the stricter gate: host accept/modify now resolves blocking review gates into host-reviewed warnings and rebuilds member-visible items before open-gate checks.

Validation:

- `npm run check`: PASS.
- `npm run verify:adaptive-contracts`: PASS, 13 contracts, 17 prompt nodes, 19 guardrails, 7 submit-gate stages, 11 evidence-review layers, 4 service-blueprint archetypes, 12 scenarios.
- `npm run audit:tasks`: PASS, 8/8 checks ready, 1 open gap, 2 partial gaps.
- `public/index.html` inline script extraction and `node --check`: PASS.
- `node --check scripts/regression-adaptive-parser.mjs`, `node --check scripts/stress-open-gate.mjs`, and `node --check scripts/stress-image-matrix.mjs`: PASS.
- Local adaptive parser regression against `127.0.0.1:4191`: PASS, 12/12 scenario lines.
- Local open-gate HITL stress against `127.0.0.1:4191`: PASS, 80/80 cases across zh group-buy, zh drink-order, en sports-venue, and en ticket-activity.

Remaining gaps:

- The visual anchor currently records logical image zones and OCR-line anchors. Pixel-level crop/bbox overlay is prepared by schema but not yet implemented.
- The open `audit:tasks` gap is still the existing final YouTube/demo artifact placeholder, not a failure of this P0 schema patch.
- Zeabur deployment and GitHub push were intentionally not performed in this step.

## 2026-09-03 18:10 P0 External Review Follow-Up

Scope:

- Reconciled the follow-up external review after the P0 HITL schema patch.

Changes:

- Refined review-gate state semantics: normal block gates can become host-reviewed warnings after explicit Host accept/modify, but structural gates cannot be released by plain accept.
- Added structural gate classification for forbidden context numbers, member-visible non-currency numbers, and unresolved formulas. These require edit/remove before release.
- Fixed a detector false positive where age wording such as `未滿` could be treated as a threshold/discount rule.
- Fixed service-fee/tax rule parsing for reversed wording such as `未含 10% 服務費` and `10% tax`.
- Expanded negative pattern registry metadata with `patternScope`, `contractId`, `language`, `evidenceType`, `matcherStrength`, and `actionOnMatch`.
- Expanded contact keyword matching across Traditional Chinese, Simplified Chinese, and English.
- Updated README wording to describe Semantic Visual Anchors and clarify that pixel-level crop/bbox overlays are schema-reserved roadmap work.
- Tightened the image-matrix canonical number normalizer so oracle values such as `$2,026`, `NT$ 2,026`, `2,026元`, and `TWD 2026` normalize to `2026`.

Validation:

- `npm run check`: PASS.
- `npm run verify:adaptive-contracts`: PASS, 13 contracts, 17 prompt nodes, 19 guardrails, 7 submit-gate stages, 11 evidence-review layers, 4 service-blueprint archetypes, 12 scenarios.
- `npm run audit:tasks`: PASS, 8/8 checks ready, 1 open gap, 2 partial gaps.
- `public/index.html` inline script extraction and `node --check`: PASS.
- Local adaptive parser regression against `127.0.0.1:4192`: PASS, 12/12 scenario lines.
- Local open-gate HITL stress against `127.0.0.1:4192`: PASS, 80/80 cases.
- Negative formula gate probe: PASS. `未含 10% 服務費，依人數分攤` now produces `unresolved_formula_requires_edit:block` and `structural_review_gate_requires_edit_or_remove`.

## 2026-09-03 18:35 P0 Forbidden Context Follow-Up

Scope:

- Reconciled the latest external release-risk review for address, tax identifier, and time-range numbers.
- Kept this as a local release-gate patch only; no GitHub push or Zeabur deployment was performed in this step.

Changes:

- Added `address_number`, `tax_identifier`, `time_range`, and `booking_or_invoice_identifier` OCR observation types.
- Routed address, tax identifier, contact, date, and time-range numbers to `forbidden_context_number:block`.
- Routed booking, invoice, receipt, and order identifiers to a warning gate rather than a structural block.
- Added fallback candidate review-gate detection from `rawTextEvidence`, `auditAnchor`, `label`, and `name` so provider output cannot bypass forbidden-context checks by omitting observation ids.
- Extended local OCR skip keywords for Traditional Chinese, Simplified Chinese, and English address/tax/time/contact identifiers.
- Added the `forbidden_context_keywords_cover_address_tax_time` anti-pollution rule to the evidence review contract and made `verify:adaptive-contracts` require it.
- Added a frontend 15 second image-parse timeout with localized fallback text. Timeout now tells the host to paste OCR text or create a manual draft for review instead of leaving the UI hanging.
- Updated README and submission text to state that the 115-image matrix is a deterministic contract-driven integration benchmark, not raw OCR, zero-shot OCR, or unconstrained vision accuracy.
- Fixed the first overly broad address detector draft: generic `路` matching incorrectly classified `每公里 NT$ 25` as an address. The address detector now requires explicit address keywords or a fuller location/address structure.

Validation:

- `npm run check`: PASS.
- `npm run verify:adaptive-contracts`: PASS, 13 contracts, 17 prompt nodes, 19 guardrails, 7 submit-gate stages, 11 evidence-review layers, 4 service-blueprint archetypes, 12 scenarios.
- `public/index.html` inline script extraction and `node --check`: PASS.
- `git diff --check`: PASS.
- Local adaptive parser regression against `127.0.0.1:4194`: PASS, 12/12 scenario lines.
- Local open-gate HITL stress against `127.0.0.1:4194`: PASS, 80/80 release-gate cases across zh group-buy, zh drink-order, en sports-venue, and en ticket-activity.
- P0 forbidden-context probe against `127.0.0.1:4194`: PASS. Address, tax identifier, and time-range evidence lines each produced an OCR observation with `forbidden_context_number:block`.
- English service-duration guard probe against `127.0.0.1:4194`: PASS. `Pitch rental two hours 220` remains a normal sports-venue item and is not misclassified as `date_time`.

Observed test-only noise:

- A 320-case extended open-gate run passed the first 105 cases, then hit a Socket.IO `Session ID unknown` test transport failure. The release-gate 80-case run passed afterward.
- The first address detector draft was too broad and treated `每公里 NT$ 25` as address context because of the standalone `路` character. The final detector requires explicit address terms or fuller location structure, and avoids generic `hours` matching so service duration can remain a line item.
- Early P0 probes used an invalid or too-small test image and failed at image preparation/minimum item gates before reaching OCR observation validation. The final probe used the same valid tiny PNG pattern as the existing stress scripts and passed.

Remaining gaps:

- Final YouTube demo URL remains pending.
- Production image-only OCR/provider quality remains a separate Zeabur test. Current 115-image and text-backed checks must not be presented as zero-shot OCR accuracy.
- Pixel-level visual crop overlay and Google Sheets trust-layer production bridge remain roadmap items.
