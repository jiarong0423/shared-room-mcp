# How We Checked It

Evidence date: 2026-09-01

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
| Live export records | 8/8 passed | local command against `https://shared-room-mcp.zeabur.app` on 2026-09-01 after deployment `6a969dab5158a7aaa4e61476` reached `RUNNING` | 4 live completed rooms exported once as HTML and once as PDF; HTML returned `text/html`, PDF returned `%PDF-1.4` and `%%EOF` |

## What This Means

- The demo does not depend on a paid OCR or model API.
- The assistant can inspect the room and create drafts, but cannot open the list, confirm for members, finalize the room, pay, or submit bookings.
- The host can review and fix parsed rows before members enter the claim step.
- Members can claim and confirm only their own costs.
- Reviewed rooms can be exported as local HTML or PDF records.
- The default JSON save layer is suitable for a single demo service and short write bursts, not production-scale traffic.

## What This Does Not Claim

- This is not a claim of production database capacity.
- This is not a benchmark for thousands of users.
- This is not a payment, booking, banking, or vendor-ordering system.
- Exported records are local review summaries. They do not submit forms or change external systems.
- Production deployments should add real authentication and replace the JSON save layer with Redis or PostgreSQL.
