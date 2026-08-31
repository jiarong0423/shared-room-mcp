# WebMCP Hackathon Submission Packet

Project name: Shared Room MCP

Live URL: pending deployment

Public repository URL: https://github.com/jiarong0423/shared-room-mcp

YouTube demo URL: TODO_YOUTUBE_DEMO_URL

License: MIT

## One-Line Pitch

Shared Room MCP is an open-source WebMCP template for pre-payment social coordination. It lets a browser-side agent inspect structured room state, task boundaries, formula rules, and claim audit gaps while humans retain control over claims, settlement, payment, and final confirmation.

## WebMCP Fit

The app exposes page-local tools through `document.modelContext.registerTool()` when WebMCP is available. Most tools are deliberately read-only: agents can inspect the room, task router, formula contract, claim audit, and trust-layer contract, but they cannot calculate money externally, assign claims, overwrite formulas, finalize settlement, or write payment data. One proposal-only tool can create a bounded JSON draft for host review without applying it.

This is a tool-layer template, not a paid API wrapper. Manual input, sample data, local OCR text, and deterministic parsing are the default path. Cloud OCR, vision, model, spreadsheet, commerce, booking, CRM, or community integrations are optional adapters owned by the deployment owner.

Implemented WebMCP tools:

- `inspect_room`
- `get_task_router`
- `get_claim_audit`
- `get_formula_contract`
- `get_trust_layer_contract`
- `suggest_next_actions`
- `create_action_proposal`

## Human And Agent Collaboration

The human controls the room, task type, uploaded evidence, OCR text, participant names, claim confirmation, and settlement. The agent helps by reading the current state, identifying task conflicts, explaining missing claims, guiding the next action from the WebMCP tool output, and preparing draft proposals for the host. The `suggest_next_actions` tool is the primary read path. The `create_action_proposal` tool is the primary safe action path: it stores `pending_host_confirmation` JSON under `room.agentProposals[]`, and owner review can mark the draft accepted or rejected without mutating orders, formulas, settlement, payment, Google Sheets, or external services.

Provider AI is optional and limited to OCR/schema repair adapters. It cannot decide who owes money, change formulas, assign cost pools, or settle disputes. Future forks can reuse the same proposal-only contract for booking drafts, repair appointment drafts, salon reservation drafts, activity signup drafts, and other pre-commitment workflows, but final submission and payment should remain human-controlled.

## Official Requirement Alignment

Checked against the WebMCP Challenge page on 2026-09-01.

| Requirement | Local status |
|---|---|
| Working live URL accessible in ChatGPT in-app browser or Chrome with WebMCP enabled | Pending final deployment name |
| Text description explaining WebMCP fit and user experience | Ready in `README.md` and this packet |
| Public YouTube demo under 3 minutes with audio | Pending `TODO_YOUTUBE_DEMO_URL` |
| Public code repository | Ready: https://github.com/jiarong0423/shared-room-mcp |
| All necessary source code, assets, and instructions | Ready |
| Open-source license visible at repository root | Ready: MIT `LICENSE` |
| Repository contains `document.modelContext.registerTool(...)` | Ready: `public/index.html` |
| WebMCP leverage beyond a trivial proof of concept | Ready: read-only tools plus `create_action_proposal` draft-only tool |
| Complete coherent product experience | Ready for local smoke; live deployment pending |
| Specific real-world audience/problem | Ready: social group coordination before payment or commitment |

## What Changed After August 25, 2026

This project existed earlier as a group menu ordering room. The WebMCP hackathon refactor changes the project into a generalized social group split room with six independent contract lines:

- Task router contract for `group_buy`, `drink_order`, `restaurant_split`, `ktv_room`, `sports_venue`, `ticket_activity`, `rental_share`, and `generic_split`.
- Evidence/OCR contract with local-first parsing and a bounded AI repair gate.
- Deterministic formula engine contract that keeps money math inside the app.
- AI repair gate and task conflict gate.
- Claim audit ledger for shared candidates and extra personal claims.
- WebMCP read-only inspection tools, one proposal-only draft tool, and a hash-only Google Sheets trust-layer contract.
- Open-source adapter positioning for future social, commerce, booking, OCR, spreadsheet, and private-community integrations.

## Environment Variables

Required for normal Zeabur runtime:

```bash
HOST=0.0.0.0
PORT=3000
ROOM_TTL_HOURS=12
ROOM_PERSISTENCE=json
ROOM_STORE_PATH=/data/rooms.json
MAX_IMAGE_MB=8
RATE_LIMIT_WINDOW_MS=60000
API_RATE_LIMIT_MAX=180
ROOM_CREATE_RATE_LIMIT_MAX=20
MENU_PARSE_RATE_LIMIT_MAX=6
LOCAL_OCR_FIRST=true
LOCAL_OCR_MIN_ITEMS=3
LOCAL_OCR_MAX_CHARS=12000
CORS_ORIGIN=
TRUST_LAYER_SPREADSHEET_ID=replace_with_google_sheet_id_for_whitelist_audit_only
```

Optional for AI repair:

```bash
GEMINI_API_KEY=
GOOGLE_API_KEY=
GOOGLE_GENERATIVE_AI_API_KEY=
GOOGLE_GEMINI_API_KEY=
GEMINI_KEY=
GEMINI_MODEL=gemini-2.5-flash
GEMINI_MODEL_FALLBACKS=gemini-2.5-flash-lite,gemini-flash-latest
GEMINI_RETRY_ATTEMPTS=2
```

Do not commit API keys. Set secrets in Zeabur environment variables only.

Runtime requires Node.js `>=20.9.0`. Leave `CORS_ORIGIN` empty for a same-origin Zeabur deployment; set it only when the browser frontend is served from a separate trusted origin.

For Zeabur, attach a persistent volume before using `/data/rooms.json`. Without a volume, the JSON store still works during one runtime session, but platform filesystem resets can clear room state.

The JSON store is a hackathon MVP persistence layer for one running service instance. It should be disclosed as not suitable for horizontal scaling or high-concurrency writes; production should use Redis or PostgreSQL.

Deployment owners should replace secrets only in Zeabur Variables or the hosting provider secret manager. The repository includes variable names in `env.sample`, but no real key values. AI provider keys are optional adapters because manual input and local OCR text can still demonstrate the WebMCP tool workflow.

## Local Verification

```bash
npm install
npm run check
npm run audit:tasks
npm start
```

Open `http://localhost:3000`, create a room, choose a task type, paste OCR text or upload an image, add participants, claim items, and inspect the audit panel.

## Demo Script

Target length: under 3 minutes.

1. Show the room UI and select a task type such as drink order, KTV room, or sports venue.
2. Paste local OCR text first to demonstrate local-first parsing.
3. Show the task router, OCR quality, formula contract, and claim audit panels.
4. Add participants and mark one item as an extra personal claim.
5. Show the share calculator: shared candidate total is separate from personal claim total.
6. Open the page with WebMCP-capable browsing and ask the agent to inspect the room using `inspect_room`.
7. Ask the agent to call `suggest_next_actions` and explain which human confirmation is still required.
8. Ask the agent to call `create_action_proposal` to prepare a draft host checklist for unresolved claims.
9. Show the Host Draft Review panel and accept or reject the draft as the room owner.
10. Show that the accepted draft did not calculate money externally, finalize settlement, write payment data, or submit to any external service.
11. Explain that WebMCP is the browser-page tool surface registered by `document.modelContext.registerTool()`. The same-origin backend exists for app state, uploads, Socket.IO sync, persistence, and draft storage; it is not a public unrestricted agent mutation API.
12. Close with the open-source extension model: the group room is the reference module, and future forks can add proposal-only adapters for bookings, repair appointments, salon reservations, activity signups, and other pre-commitment workflows.

## Compliance Notes

- No fake account scraping.
- No vendor API reverse engineering.
- No authenticated vendor cookies or private ordering sessions.
- No payment processing.
- No raw OCR, images, raw device IDs, payment identifiers, or social account identifiers are written to Google Sheets.
- Google Sheets is only a short-lived hash whitelist and audit-log trust layer.

## Remaining Submission Checklist

- Public repository URL is set to `https://github.com/jiarong0423/shared-room-mcp`.
- Replace `TODO_YOUTUBE_DEMO_URL` after uploading the public demo video.
- Set and verify the live Zeabur URL after the final deployment name is chosen.
- Confirm Zeabur volume is mounted when `ROOM_STORE_PATH=/data/rooms.json` is configured.
- Confirm Devpost description uses the same WebMCP boundary stated here.
