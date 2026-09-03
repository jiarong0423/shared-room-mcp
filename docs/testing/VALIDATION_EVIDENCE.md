# How We Checked It

Evidence date: 2026-09-04 Asia/Taipei

This file summarizes checks that were actually run before submission. The goal is simple: show that the demo flow was repeated, not only recorded once.

Raw runtime logs stay out of the public repository because `logs/runtime/` is ignored. The repeat counts below come from local run outputs and tracked security notes.

## Check Summary

| area | result | source | what was checked |
|---|---:|---|---|
| Current local contract stress after local-review bridge gate | 60/60 passed | `/private/tmp/webmcp-full-validation-v3/stress-local-contracts/local-contract-stress-2026-09-03T17-08-58-593Z.md` | 20 Chinese and English scenarios, 3 rounds each, no provider keys; OCR-only parser output remains review-required |
| Current HITL Member-Visibility Release after local vision proof gate | 12/12 passed | `/private/tmp/webmcp-full-validation-v3/stress-member-release/member-release-stress-2026-09-03T17-09-00-638Z.md` | valid local-vision-backed `semantic_repair_draft` clears only the OCR-only blocker, then host release, member confirmation, owner finalization, HTML export, and PDF export pass |
| OCR-only cloud proposal negative gate | PASS | local direct API probe against `http://127.0.0.1:3212` | direct `semantic_repair_draft` with `sourceMode=local_ocr_only_bridge_draft` returned HTTP 422 and did not create a cloud review draft |
| Local review bridge CLI gates | PASS | `/private/tmp/webmcp-full-validation-v3/bridge-write/` and `/private/tmp/webmcp-full-validation-v3/bridge-default-dry-run/` | bridge defaults to dry-run, requires `--write-cloud-proposal` and explicit `--base-url` for writes, refuses repo output paths, and writes a proposal only after local vision returns structured items |
| Current deterministic image-oracle integration benchmark | 115/115 passed | `/private/tmp/webmcp-full-validation-v3/image-matrix-oracle-v2/image-matrix-stress-2026-09-03T17-12-54-459Z.json` | external PNG artifacts were verified by SHA-256; full parser candidates, calculation rules, member-visible masks, forbidden-number checks, and HITL wiring passed in `image-plus-oracle-text` mode |
| Main room flow | 400/400 passed | `logs/runtime/local-contract-stress-2026-09-01T00-10-12-135Z.md`, summarized in `docs/security/SECURITY_SCAN_EVIDENCE.md` | 20 Chinese and English scenarios, 20 rounds each, no provider keys |
| Member-Visibility Release | 80/80 passed | summarized in `docs/security/SECURITY_SCAN_EVIDENCE.md` | AI draft stays closed, host reviews first, members can claim only after release |
| Save queue follow-up | 20/20 passed | summarized local run | same host-review flow after the save queue change |
| Short burst of room creation | 25/25 saved | local command output on 2026-09-01 after `ROOM_PERSIST_DEBOUNCE_MS=35` and `ROOM_PERSIST_JITTER_MS=120` | 25 simultaneous room creates were all present in the saved JSON file |
| Split-language scenarios | 240/240 passed | `fixtures/adaptive-parser-matrix.json` plus `npm run regression:adaptive-parser` | 12 additional scenarios, Chinese and English separated, 20 rounds each |
| Host-only draft review | 200/200 denied for non-hosts | `docs/security/SECURITY_SCAN_EVIDENCE.md` | non-host users cannot create or approve host drafts |
| Load Sample Room | 120/120 passed | `docs/security/SECURITY_SCAN_EVIDENCE.md` | sample data stays as a draft and does not settle, pay, or call outside services |
| Frontend review screen | PASS | summarized in `docs/security/SECURITY_SCAN_EVIDENCE.md` | sample room shows 6 items, 6 review controls, no horizontal overflow |
| Superseded hosted flow | 4/4 passed | historical run against a retired Zeabur URL | deployed app kept the same host-review and member-confirmation flow |
| Superseded post-deploy live check | RUNNING and 4/4 passed | historical live `/healthz` plus retired-host flow | live `/healthz` showed `/data/rooms.json`, save smoothing `35/120`, no provider keys, and the deployed host-review flow still passed |
| Export records | 160/160 passed | local run against `http://127.0.0.1:3162` on 2026-09-01 | 80 completed rooms exported once as HTML and once as PDF; HTML returned `text/html`, PDF returned `%PDF-1.4` and `%%EOF` |
| Superseded live export records | 8/8 passed | local command against a retired Zeabur URL on 2026-09-01 after the export deployment reached `RUNNING` | 4 live completed rooms exported once as HTML and once as PDF; HTML returned `text/html`, PDF returned `%PDF-1.4` and `%%EOF` |
| Export file readability | PASS | downloaded live room `191fd8c3` to a local scratch directory | `file` identified UTF-8 HTML and PDF 1.4; `pdftotext` extracted room status, item summary, total, and confirmation text |
| Single draft card regression | 60/60 passed | `logs/runtime/local-contract-stress-2026-09-01T11-24-48-624Z.md` local run | every case creates two same-type assistant drafts and verifies only the latest pending draft remains |
| Same-card review flow | 20/20 passed | summarized local run | host review stays before member claiming; member and settlement boundaries still pass after the draft-card cleanup |
| Final Member-Visibility Release and export recheck | 20/20 passed | summarized local run | the official flow also checks completed-room HTML and PDF exports after host settlement |
| Pre-push HITL Member-Visibility Release repair recheck | 20/20 passed | isolated local run | the stress flow accepts the pending review proposal before release; anti-pollution pending candidates/rules still block direct release |
| Final pre-push HITL Member-Visibility Release harness recheck | 80/80 passed | local run against `http://127.0.0.1:4181` on 2026-09-03 | Socket.IO polling reconnects after session expiry; host review, member release, member confirmation, owner finalization, HTML export, and PDF export all passed |
| Final superseded-host release and export recheck | 4/4 passed | historical run against a retired Zeabur URL | live service passed the same host-review, member-confirmation, settlement, HTML export, and PDF export flow |
| Historical retired-host production low-rate flow | 5/5 passed | summarized historical evidence in `docs/security/SECURITY_SCAN_EVIDENCE.md` | superseded historical evidence only; the retired host was removed before recording and the live demo now runs on Zeabur |
| Superseded Zeabur production pre-recording flow | Superseded historical evidence | live browser/API check on 2026-09-02 against `https://shared-room-mcp-next.zeabur.app/` | historical hosted evidence only; use a fresh `/healthz`, WebMCP inspect, finalized room HTML/PDF download, and browser console check after deployment |
| Same-tab room transition | 2/2 local and 2/2 production passed | summarized historical evidence in `docs/security/SECURITY_SCAN_EVIDENCE.md` | a loaded room can switch to a clean empty room, and a late update from the old room cannot overwrite the new room |
| Final bilingual export repair | 4/4 local flows passed | isolated local run on 2026-09-02, summarized in the development log | Chinese and English flows finalized, HTML/PDF exports passed, and PDFs include separate readable Latin and CJK fonts |
| Deterministic image-oracle integration benchmark | 115 deterministic cases passed | isolated local image-matrix run, summarized in security evidence | external PNG artifacts were verified by SHA-256 and matched scenario/language/contract/member-visible oracle expectations in `image-plus-oracle-text` mode; this is not an OCR or provider accuracy benchmark |
| Local OCR canary | 3/3 local S01 variants passed | local isolated runner output outside the repository | operator-machine Tesseract OCR plus text-block parsing produced member-safe candidates, prevented age-number leakage, and kept group-threshold text as advisory host context rather than a Zeabur OCR claim |

## What This Means

- The demo does not depend on Zeabur-hosted OCR, a paid OCR API, or a paid model API.
- The assistant can inspect the room and create drafts, but cannot release the member-visible list, confirm for members, finalize the room, pay, or submit bookings.
- OCR-only output is candidate evidence. A cloud `semantic_repair_draft` requires local OCR plus local/visual LLM structured items before host review can clear the OCR-only blocker.
- The host can review and fix parsed rows before members enter the claim step.
- Duplicate assistant drafts for the same topic collapse into one visible host decision.
- Members can claim and confirm only their own costs.
- Reviewed rooms can be exported as local HTML or PDF records.
- The same Member-Visibility Release stress script now verifies the export buttons' backend files after the room is finalized.
- Room identity changes clear room-only temporary UI state while preserving language and display-name preferences.
- Asynchronous responses and Socket.IO events are applied only when they still belong to the room shown in the URL.
- The default JSON save layer is suitable for a single demo service and short write bursts, not production-scale traffic.
- The recording runbook now fixes the human/agent handoff: the presenter/operator handles page navigation and file selection; WebMCP and the assistant handle room-state reading, local-review draft preparation, and release-gate checks; the human performs the same-card two-click review, personal confirmation, owner finalization, and final downloads.
- The image fixture runner now keeps large generated PNGs outside the main repository while preserving a checksum-backed oracle and quarantine output path.
- The image fixture manifest build no longer blocks Zeabur deployment when the external PNG artifact is absent; it validates the checked-in 115-test manifest and only rebuilds when `IMAGE_MATRIX_ROOT` or `--matrix-root` is supplied.

## What This Does Not Claim

- This is not a claim of production database capacity.
- This is not a benchmark for thousands of users.
- This is not a payment, booking, banking, or vendor-ordering system.
- Exported records are local review summaries. They do not submit forms or change external systems.
- Production deployments should add real authentication and replace the JSON save layer with Redis or PostgreSQL.
- The 115-case image fixture oracle result is not a hosted image-recognition benchmark. It proves artifact integrity, contract routing, oracle wiring, and HITL state behavior. The core demo path is local OCR plus local/visual LLM review, WebMCP plus Codex room-state review, and human approval. If the runner uses `image-plus-local-ocr`, OCR happens on the operator machine before the request reaches the hosted room.
