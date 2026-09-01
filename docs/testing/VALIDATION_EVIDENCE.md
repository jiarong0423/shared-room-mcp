# How We Checked It

Evidence date: 2026-09-02

This file summarizes checks that were actually run before submission. The goal is simple: show that the demo flow was repeated, not only recorded once.

Raw runtime logs stay out of the public repository because `logs/runtime/` is ignored. The repeat counts below come from local run outputs and tracked security notes.

## Check Summary

| area | result | source | what was checked |
|---|---:|---|---|
| Main room flow | 400/400 passed | `logs/runtime/local-contract-stress-2026-09-01T00-10-12-135Z.md`, summarized in `docs/security/SECURITY_SCAN_EVIDENCE.md` | 20 Chinese and English scenarios, 20 rounds each, no provider keys |
| Opening the list to members | 80/80 passed | `logs/runtime/open-gate-stress-2026-09-01T00-09-52-108Z.md`, summarized in `docs/security/SECURITY_SCAN_EVIDENCE.md` | AI draft stays closed, host reviews first, members can claim only after opening |
| Save queue follow-up | 20/20 passed | `logs/runtime/open-gate-stress-2026-09-01T02-53-52-786Z.md` local run | same host-review flow after the save queue change |
| Short burst of room creation | 25/25 saved | local command output on 2026-09-01 after `ROOM_PERSIST_DEBOUNCE_MS=35` and `ROOM_PERSIST_JITTER_MS=120` | 25 simultaneous room creates were all present in the saved JSON file |
| Split-language scenarios | 240/240 passed | `docs/ai-generated/2026Q3/shared_room_demo_scenario_matrix_b_20260901.md` | 12 additional scenarios, Chinese and English separated, 20 rounds each |
| Host-only draft review | 200/200 denied for non-hosts | `docs/security/SECURITY_SCAN_EVIDENCE.md` | non-host users cannot create or approve host drafts |
| Load Sample Room | 120/120 passed | `docs/security/SECURITY_SCAN_EVIDENCE.md` | sample data stays as a draft and does not settle, pay, or call outside services |
| Frontend review screen | PASS | `logs/runtime/frontend-open-gate-smoke-2026-09-01T00-16-02-550Z.json`, summarized in `docs/security/SECURITY_SCAN_EVIDENCE.md` | sample room shows 6 items, 6 review controls, no horizontal overflow |
| Live Zeabur flow | 4/4 passed | `logs/runtime/open-gate-stress-2026-09-01T02-46-04-407Z.md` local run against `https://shared-room-mcp.zeabur.app` | deployed app kept the same host-review and member-confirmation flow |
| Post-deploy live check | RUNNING and 4/4 passed | live `/healthz`; `logs/runtime/open-gate-stress-2026-09-01T03-45-33-374Z.md` local run against `https://shared-room-mcp.zeabur.app` | live `/healthz` showed `/data/rooms.json`, save smoothing `35/120`, no provider keys, and the deployed host-review flow still passed |
| Export records | 160/160 passed | local run against `http://127.0.0.1:3162` on 2026-09-01 | 80 completed rooms exported once as HTML and once as PDF; HTML returned `text/html`, PDF returned `%PDF-1.4` and `%%EOF` |
| Live export records | 8/8 passed | local command against `https://shared-room-mcp.zeabur.app` on 2026-09-01 after the export deployment reached `RUNNING` | 4 live completed rooms exported once as HTML and once as PDF; HTML returned `text/html`, PDF returned `%PDF-1.4` and `%%EOF` |
| Export file readability | PASS | downloaded live room `191fd8c3` to a local scratch directory | `file` identified UTF-8 HTML and PDF 1.4; `pdftotext` extracted room status, item summary, total, and confirmation text |
| Single draft card regression | 60/60 passed | `logs/runtime/local-contract-stress-2026-09-01T11-24-48-624Z.md` local run | every case creates two same-type assistant drafts and verifies only the latest pending draft remains |
| Same-card review flow | 20/20 passed | `logs/runtime/open-gate-stress-2026-09-01T11-22-05-897Z.md` local run | host review stays before member claiming; member and settlement boundaries still pass after the draft-card cleanup |
| Final open-gate and export recheck | 20/20 passed | `logs/runtime/open-gate-stress-2026-09-01T12-05-44-080Z.md` local run | the official flow now also checks completed-room HTML and PDF exports after host settlement |
| Final live open-gate and export recheck | 4/4 passed | `logs/runtime/open-gate-stress-2026-09-01T12-10-11-461Z.md` local run against `https://shared-room-mcp.zeabur.app` | live service passed the same host-review, member-confirmation, settlement, HTML export, and PDF export flow |
| Railway production low-rate flow | 5/5 passed | sequential production browser/API check summarized in `docs/decisions/2026Q2/DEVELOPMENT_LOG.md` | sample load, same-card host review, member join, self-confirmation, finalization, and HTML/PDF export passed without concurrent stress traffic |
| Same-tab room transition | 2/2 local and 2/2 production passed | isolated and low-rate production browser regressions summarized in `docs/decisions/2026Q2/DEVELOPMENT_LOG.md` | a loaded room can switch to a clean empty room, and a late update from the old room cannot overwrite the new room |
| Final bilingual export repair | 4/4 local flows passed | isolated local run on 2026-09-02, summarized in the development log | Chinese and English flows finalized, HTML/PDF exports passed, and PDFs include separate readable Latin and CJK fonts |

## What This Means

- The demo does not depend on a paid OCR or model API.
- The assistant can inspect the room and create drafts, but cannot open the list, confirm for members, finalize the room, pay, or submit bookings.
- The host can review and fix parsed rows before members enter the claim step.
- Duplicate assistant drafts for the same topic collapse into one visible host decision.
- Members can claim and confirm only their own costs.
- Reviewed rooms can be exported as local HTML or PDF records.
- The same open-gate stress script now verifies the export buttons' backend files after the room is finalized.
- Room identity changes clear room-only temporary UI state while preserving language and display-name preferences.
- Asynchronous responses and Socket.IO events are applied only when they still belong to the room shown in the URL.
- The default JSON save layer is suitable for a single demo service and short write bursts, not production-scale traffic.
- The recording runbook now fixes the human/agent handoff: the agent handles routine page actions, while the human performs the same-card two-click review, personal confirmation, owner finalization, and final downloads.

## What This Does Not Claim

- This is not a claim of production database capacity.
- This is not a benchmark for thousands of users.
- This is not a payment, booking, banking, or vendor-ordering system.
- Exported records are local review summaries. They do not submit forms or change external systems.
- Production deployments should add real authentication and replace the JSON save layer with Redis or PostgreSQL.
