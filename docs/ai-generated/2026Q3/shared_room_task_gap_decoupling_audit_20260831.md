# Group Room Task Gap Decoupling Audit

Generated at: 2026-09-01T03:59:05.176Z

Owner project: `.`

## Decision

目前可以參賽的核心方向成立：這是用 WebMCP 讓 AI 幫忙準備草稿、人類保留最後確認的共享房間。下一步不是再擴張情境，而是保持現有房間流程、驗證證據、Live URL、GitHub README 與 Demo 腳本一致。

## Current Readiness

- Checks ready: 8 / 8
- Open gaps: 1
- Partial gaps: 2

## Gap Matrix

| importance | area | status | finding | next action |
|---|---|---|---|---|
| P0 | formula-engine | ready | 公式引擎合約狀態 | 下一步在 formula-controls 線補 UI manual inputs；不需要更動 formula engine contract。 |
| P0 | claim-audit | ready | 認領稽核合約狀態 | 下一步在 testing 線補 socket 非空 ledger 測試；不需要改 claim audit contract。 |
| P0 | webmcp | ready | WebMCP 工具面狀態 | 下一步只需要在瀏覽器支援 WebMCP 的環境做真機 demo；Sheets 寫入 bridge 仍屬 P1。 |
| P0 | ai-repair-gate | ready | 任務衝突與 AI 修補閘門狀態 | 下一步在 testing 線補 conflict smoke case，確認手動鎖定錯誤任務時 local-first 不放行。 |
| P0 | submission | partial | 提交包狀態 | YouTube demo 完成後替換 submission packet 的 TODO URL。 |
| P1 | trust-layer | partial | Google Sheets 白名單仍是設計稿 | 建立 Sheets bridge P1；只存短效 hash，不存原始 device id、付款資訊、社群帳號。 |
| P0 | evidence-ocr | ready | 價格證據與 OCR contract 狀態 | 後續加強可評估 Web OCR/WASM OCR 或裝置端 companion；不影響六線解耦完成。 |
| P1 | formula-controls | open | 任務特定公式輸入不足 | 依任務模組顯示最少必要公式欄位，不讓 AI 計算金額。 |
| P1 | testing | ready | 本地合約與開放順序壓測矩陣狀態 | 後續若新增公式、任務模組、或成員權限流程，先擴充兩個壓測矩陣再提交。 |

## Evidence Markers

### Task modules
- OK: `auto`
- OK: `group_buy`
- OK: `drink_order`
- OK: `restaurant_split`
- OK: `ktv_room`
- OK: `sports_venue`
- OK: `ticket_activity`
- OK: `rental_share`
- OK: `generic_split`

### Room type rules
- OK: `taskRouterContract`
- OK: `group-room-task-router-contract.v1`
- OK: `contractVersion`
- OK: `supportedTaskTypes`
- OK: `selectedTaskType`
- OK: `inferredTaskType`
- OK: `taskType`
- OK: `confidenceScore`
- OK: `confidenceReason`
- OK: `reviewStatus`
- OK: `riskPolicy`
- OK: `thresholdKind`
- OK: `splitMode`
- OK: `evidenceStrength`
- OK: `hasTaskConflict`
- OK: `conflictTaskType`
- OK: `lockedByUser`
- OK: `aiRepairAllowed`
- OK: `aiRepairScope`
- OK: `forbiddenAiActions`

### Evidence/OCR rules
- OK: `evidenceContract`
- OK: `group-room-evidence-ocr-contract.v1`
- OK: `evidenceLine`
- OK: `localFirst`
- OK: `localOcr`
- OK: `imageInput`
- OK: `acceptedEvidenceSources`
- OK: `forbiddenEvidenceSources`
- OK: `deterministicParser`
- OK: `qualityGate`
- OK: `aiRepairGate`
- OK: `privacyBoundary`
- OK: `user_uploaded_price_photo`
- OK: `user_provided_local_ocr_text`
- OK: `fake_account_scraping`
- OK: `vendor_api_reverse_engineering`
- OK: `cookies_or_authenticated_vendor_session`
- OK: `storeRawOcrInSheets`
- OK: `repairScope`

### Formula modules
- OK: `sameItemMerge`
- OK: `participantSubtotal`
- OK: `grandTotal`
- OK: `averageSplit`
- OK: `thresholdRemaining`
- OK: `optionDelta`
- OK: `sharedFeeSplit`
- OK: `depositGate`
- OK: `tierDiscount`
- OK: `extraPersonalClaim`

### Local calculation rules
- OK: `formulaContract`
- OK: `group-room-formula-contract.v1`
- OK: `group-room-formula.v1`
- OK: `formulaModuleContracts`
- OK: `deterministicOnly`
- OK: `activeModules`
- OK: `pendingModules`
- OK: `inputSources`
- OK: `outputFields`
- OK: `aiAllowed`
- OK: `externalCalculationAllowed`
- OK: `externalFormulaTargetsAllowed`
- OK: `forbiddenExternalCalculationTargets`
- OK: `google_sheets`
- OK: `calculate_money`
- OK: `change_formula`
- OK: `assign_cost_pool`
- OK: `override_claim_mode`

### Claim audit fields
- OK: `claimAuditVersion`
- OK: `sharedCandidateTotal`
- OK: `personalClaimTotal`
- OK: `claimedOrderCount`
- OK: `claimLedgerCount`
- OK: `pendingClaimCount`
- OK: `claimStateCounts`
- OK: `claimLedger`
- OK: `claim_id`
- OK: `item_id`
- OK: `claimer_id`
- OK: `mode`
- OK: `cost_pool`
- OK: `verifiers`
- OK: `approvals`
- OK: `state`
- OK: `updated_at`
- OK: `unconfirmedParticipantCount`
- OK: `unconfirmedParticipants`
- OK: `settlementReady`
- OK: `rules`

### Google Sheets whitelist fields
- OK: `room_id`
- OK: `invite_code_hash`
- OK: `device_id_hash`
- OK: `display_name`
- OK: `role`
- OK: `status`
- OK: `expires_at`
- OK: `created_at`
- OK: `last_seen_at`
- OK: `notes`

### WebMCP tool names
- OK: `inspect_room`
- OK: `get_task_router`
- OK: `get_claim_audit`
- OK: `get_formula_contract`
- OK: `get_trust_layer_contract`
- OK: `suggest_next_actions`
- OK: `create_action_proposal`
- OK: `agentProposals`
- OK: `pending_host_confirmation`
- OK: `document.modelContext`
- OK: `registerTool`
- OK: `webMcpToolSurface`
- OK: `group-room-webmcp-tools.v2`
- OK: `trustLayerContract`
- OK: `group-room-trust-layer-contract.v1`
- OK: `check_whitelist`
- OK: `enroll_device`
- OK: `revoke_device`

### Submission package
- OK: `MIT License`
- OK: `"license": "MIT"`
- OK: `WebMCP Hackathon Submission Packet`
- OK: `Live URL`
- OK: `Public repository URL`
- OK: `YouTube demo URL`
- OK: `docs/testing/VALIDATION_EVIDENCE.md`
- OK: `What Changed After August 25, 2026`
- OK: `document.modelContext.registerTool()`
- OK: `Environment Variables`
- OK: `TRUST_LAYER_SPREADSHEET_ID`
- OK: `RATE_LIMIT_WINDOW_MS`
- OK: `MENU_PARSE_RATE_LIMIT_MAX`
- OK: `GEMINI_API_KEY`
- OK: `Do not commit API keys`
- OK: `Demo Script`
- OK: `Compliance Notes`

## Work Batches

| batch | priority | scope | stop condition |
|---|---|---|---|
| A | P0 | formula-engine + claim-audit pure contracts | API response exposes formulaResults and claim ledger without changing settlement behavior. |
| B | P0 | WebMCP read-only + proposal-only tools | Agent can inspect room state and create host-reviewed draft proposals without browser scraping or final-state mutation. |
| C | P0 | task conflict quality gate + submission checklist | Mismatched evidence routes to manual review; LICENSE/submission checklist present. |
| D | P1 | Google Sheets short-lived whitelist | check/enroll/revoke tools operate on hash-only rows and expired rows fail closed. |
| E | P1 | task-specific formula controls | UI emits formula inputs for service fee, hourly rate, deposit, shipping, and group thresholds. |

## Stop Conditions

- AI 只可協助整理 OCR/文字欄位，不可計算金額、指定認領者、改房間類型或仲裁爭議。
- 公式、門檻、均分、額外單點自認必須留在本地頁面與伺服器規則內。
- WebMCP 工具維持讀取與草稿；Sheets 白名單是選配信任層，不碰金流。
- 每一批解耦完成後都要重跑 `npm run check` 與 `npm run audit:tasks`。
