# How We Checked It

Evidence date: 2026-09-04 Asia/Taipei

This file summarizes checks that were actually run before submission. The goal is simple: show that the demo flow was repeated, not only recorded once.

Raw runtime logs stay out of the public repository because `logs/runtime/` is ignored. The repeat counts below come from local run outputs and tracked security notes.

Verification levels:

- `current_live_smoke`: low-rate checks run against the public Zeabur URL after the latest deployment.
- `current_local_regression`: repeatable local scripts run after the local review bridge gate was added.
- `historical_local_regression`: earlier local stress evidence retained for continuity; it is not a current live-capacity claim.
- `deterministic_oracle`: checksum-backed fixtures validate contract wiring and HITL behavior, not OCR or provider accuracy.

## Check Summary

| area | result | source | what was checked |
|---|---:|---|---|
| Current Zeabur post-deploy health | PENDING RECHECK | deploy this commit, then recheck live `/healthz` | must show the mounted `/data/rooms.json` store, no active external/local image provider, `localVisionConfigured=false`, `allowRemoteVisionFallback=false`, and no provider key flags |
| Current Zeabur room/customer/export smoke | PENDING RECHECK | deploy this commit, then run `npm run stress:customer-publishing -- --base-url https://shared-room-mcp-next.zeabur.app --rounds 1 --fail-fast` | must pass merchant proposal review, customer publishing, customer confirmation, merchant finalization, language-locked HTML export, and PDF export |
| Current local OCR + Codex LLM proposal apply smoke | PASS | `/private/tmp/webmcp-commercial-ui-final2-codex-anchor-accepted/codex-ocr-llm-demo-2026-09-03T21-32-30-177Z.json` | Tesseract OCR read 767 characters from the synthetic merchant menu image; `reviewProvider=codex_guided`, `reviewExecution.mode=codex_guided_visual_review`, `codexNodeCompleted=true`; the test-only accept flag applied 18 rows and kept customer publishing closed |
| Current local OCR + Codex LLM pending demo room | PASS | `/private/tmp/webmcp-commercial-ui-final2-codex-anchor-pending/codex-ocr-llm-demo-2026-09-03T21-32-30-174Z.json` | same generated evidence and OCR path, but left the 18-row Codex visual-review draft pending for the merchant to approve |
| Current local contract stress after local-review bridge gate | 40/40 passed | `/private/tmp/webmcp-commercial-ui-contracts-v2/local-contract-stress-2026-09-03T20-37-09-634Z.md` | 20 Chinese and English scenarios, two fast rounds each, no provider keys; OCR-only parser output remains review-required |
| Current HITL Customer Publishing after Codex-positioning lock | 4/4 passed | `/private/tmp/webmcp-commercial-ui-final2-codex-anchor-customer-publishing/customer-publishing-stress-2026-09-03T21-32-28-838Z.md` | visual-review-backed drafts remain behind merchant review, then customer publishing, customer confirmation, merchant finalization, language-locked HTML export, and PDF export pass; earlier commercial UI run passed 8/8 |
| Current browser/WebMCP product-room smoke | PASS | Codex in-app browser against `http://127.0.0.1:3224` | pending and accepted rooms showed a visible locked business-flow selector, no old engineering UI strings, no system-language mixing, and clean published-customer state after merchant approval |
| OCR-only cloud proposal negative gate | PASS | local direct API probe against `http://127.0.0.1:3212` | direct OCR-only draft request returned HTTP 422 and did not create a cloud review draft |
| Local review bridge CLI gates | PASS | `/private/tmp/webmcp-full-validation-v3/bridge-write/` and `/private/tmp/webmcp-full-validation-v3/bridge-default-dry-run/` | bridge defaults to dry-run, requires `--write-cloud-proposal` and explicit `--base-url` for writes, refuses repo output paths, and writes a proposal only after LLM visual review returns structured items |
| Deterministic image-oracle integration benchmark | Previous 115/115 artifact-backed run | `/private/tmp/webmcp-full-validation-v3/image-matrix-oracle-v2/image-matrix-stress-2026-09-03T17-12-54-459Z.json` | external PNG artifacts were verified by SHA-256; full extracted menu rows, calculation rules, customer-visible masks, forbidden-number checks, and HITL wiring passed in `image-plus-oracle-text` mode |
| Current image-matrix rerun | NOT RERUN | `/private/tmp/webmcp-codex-ocr-llm-image-matrix-final/image-matrix-stress-2026-09-03T18-47-15-338Z.json` | current checkout does not contain `fixtures/image-matrix/generated/*.png`; the runner failed closed with `ENOENT` and requires the external `IMAGE_MATRIX_ROOT` artifact to repeat the 115-case check |
| Historical main room flow | 400/400 passed | `logs/runtime/local-contract-stress-2026-09-01T00-10-12-135Z.md`, summarized in `docs/security/SECURITY_SCAN_EVIDENCE.md` | historical local regression: 20 Chinese and English scenarios, 20 rounds each, no provider keys |
| Historical Customer Publishing Release | 80/80 passed | summarized in `docs/security/SECURITY_SCAN_EVIDENCE.md` | historical local regression: AI draft stays closed, merchant reviews first, customers can choose only after release |
| Historical save queue follow-up | 20/20 passed | summarized local run | historical local regression: same merchant-review flow after the save queue change |
| Short burst of room creation | 25/25 saved | local command output on 2026-09-01 after `ROOM_PERSIST_DEBOUNCE_MS=35` and `ROOM_PERSIST_JITTER_MS=120` | 25 simultaneous room creates were all present in the saved JSON file |
| Historical split-language scenarios | 240/240 passed | `fixtures/adaptive-parser-matrix.json` plus `npm run regression:adaptive-parser` | historical local regression: 12 additional scenarios, Chinese and English separated, 20 rounds each |
| Historical merchant-only draft review | 200/200 denied for non-merchants | `docs/security/SECURITY_SCAN_EVIDENCE.md` | historical local regression: non-merchant users cannot create or approve merchant drafts |
| Historical Load Sample Room | 120/120 passed | `docs/security/SECURITY_SCAN_EVIDENCE.md` | historical local regression: sample data stays as a draft and does not settle, pay, or call outside services |
| Frontend review screen | PASS | summarized in `docs/security/SECURITY_SCAN_EVIDENCE.md` | sample room shows 6 items, 6 review controls, no horizontal overflow |
| Superseded hosted flow | 4/4 passed | historical run against a retired Zeabur URL | deployed app kept the same merchant-review and customer-confirmation flow |
| Superseded post-deploy live check | RUNNING and 4/4 passed | historical live `/healthz` plus retired-host flow | live `/healthz` showed `/data/rooms.json`, save smoothing `35/120`, no provider keys, and the deployed merchant-review flow still passed |
| Export records | 160/160 passed | local run against `http://127.0.0.1:3162` on 2026-09-01 | 80 completed rooms exported once as HTML and once as PDF; HTML returned `text/html`, PDF returned `%PDF-1.4` and `%%EOF` |
| Superseded live export records | 8/8 passed | local command against a retired Zeabur URL on 2026-09-01 after the export deployment reached `RUNNING` | 4 live completed rooms exported once as HTML and once as PDF; HTML returned `text/html`, PDF returned `%PDF-1.4` and `%%EOF` |
| Export file readability | PASS | downloaded live room `191fd8c3` to a local scratch directory | `file` identified UTF-8 HTML and PDF 1.4; `pdftotext` extracted room status, item summary, total, and confirmation text |
| Single draft card regression | 60/60 passed | `logs/runtime/local-contract-stress-2026-09-01T11-24-48-624Z.md` local run | every case creates two same-type assistant drafts and verifies only the latest pending draft remains |
| Same-card review flow | 20/20 passed | summarized local run | merchant review stays before customer choosing; customer confirmation and merchant finalization boundaries still pass after the draft-card cleanup |
| Final Customer Publishing and export recheck | 20/20 passed | summarized local run | the official flow also checks completed-room HTML and PDF exports after merchant finalization |
| Pre-push HITL Customer Publishing repair recheck | 20/20 passed | isolated local run | the stress flow accepts the pending review proposal before release; anti-pollution pending candidates/rules still block direct release |
| Final pre-push HITL Customer Publishing harness recheck | 80/80 passed | local run against `http://127.0.0.1:4181` on 2026-09-03 | Socket.IO polling reconnects after session expiry; merchant review, customer publishing, customer confirmation, merchant finalization, HTML export, and PDF export all passed |
| Final superseded-host release and export recheck | 4/4 passed | historical run against a retired Zeabur URL | live service passed the same merchant review, customer confirmation, merchant finalization, HTML export, and PDF export flow |
| Historical retired-host production low-rate flow | 5/5 passed | summarized historical evidence in `docs/security/SECURITY_SCAN_EVIDENCE.md` | superseded historical evidence only; the retired host was removed before recording and the live demo now runs on Zeabur |
| Superseded Zeabur production pre-recording flow | Superseded historical evidence | live browser/API check on 2026-09-02 against `https://shared-room-mcp-next.zeabur.app/` | historical hosted evidence only; use a fresh `/healthz`, WebMCP inspect, finalized room HTML/PDF download, and browser console check after deployment |
| Same-tab room transition | 2/2 local and 2/2 production passed | summarized historical evidence in `docs/security/SECURITY_SCAN_EVIDENCE.md` | a loaded room can switch to a clean empty room, and a late update from the old room cannot overwrite the new room |
| Final bilingual export repair | 4/4 local flows passed | isolated local run on 2026-09-02, summarized in the development log | Chinese and English flows finalized, HTML/PDF exports passed, and PDFs include separate readable Latin and CJK fonts |
| Deterministic image-oracle integration benchmark | 115 deterministic cases passed | isolated local image-matrix run, summarized in security evidence | external PNG artifacts were verified by SHA-256 and matched scenario/language/contract/customer-visible oracle expectations in `image-plus-oracle-text` mode; this is not an OCR or provider accuracy benchmark |
| Local OCR canary | 3/3 local S01 variants passed | local isolated runner output outside the repository | authorized local bridge Tesseract OCR plus text-block parsing produced customer-safe candidates, prevented age-number leakage, and kept group-threshold text as advisory merchant context rather than a Zeabur OCR claim |

## What This Means

- The demo does not depend on Zeabur-hosted OCR, a paid OCR API, or a paid model API.
- The assistant can inspect the room and create drafts, but cannot publish the customer-visible list, confirm for customers, finalize the room, pay, or submit bookings.
- OCR-only output is draft evidence. A cloud review draft requires local OCR plus Codex visual-review structured items before merchant review can clear the OCR-only stop.
- The merchant can review and fix parsed rows before customers enter the claim step.
- Duplicate assistant drafts for the same topic collapse into one visible merchant decision.
- Customers can claim and confirm only their own selections.
- Reviewed rooms can be exported as local HTML or PDF records.
- The same customer-publishing stress script now verifies the export buttons' backend files after the room is finalized.
- Room identity changes clear room-only temporary UI state while preserving language and display-name preferences.
- Asynchronous responses and Socket.IO events are applied only when they still belong to the room shown in the URL.
- The default JSON save layer is suitable for a single demo service and short write bursts, not production-scale traffic.
- The recording runbook now fixes the human/agent handoff: the presenter handles page navigation and file selection; WebMCP and Codex handle room-state reading, local OCR review draft preparation, visual correction, and publishing-gate checks; the human performs the same-card two-click review, customer confirmation, merchant finalization, and final downloads.
- The image fixture runner now keeps large generated PNGs outside the main repository while preserving a checksum-backed oracle and quarantine output path.
- The image fixture manifest build no longer blocks Zeabur deployment when the external PNG artifact is absent; it validates the checked-in 115-test manifest and only rebuilds when `IMAGE_MATRIX_ROOT` or `--matrix-root` is supplied.

## What This Does Not Claim

- This is not a claim of production database capacity.
- This is not a benchmark for thousands of users.
- This is not a payment, booking, banking, or vendor-ordering system.
- Exported records are local review summaries. They do not submit forms or change external systems.
- Production deployments should add real authentication and replace the JSON save layer with Redis or PostgreSQL.
- The 115-case image fixture oracle result is not a hosted image-recognition benchmark. It proves artifact integrity, contract routing, oracle wiring, and HITL state behavior. The core demo path is local OCR plus Codex visual review, WebMCP room-state review, and human approval. If the runner uses `image-plus-local-ocr`, OCR happens through the authorized local bridge before the request reaches the hosted room.
