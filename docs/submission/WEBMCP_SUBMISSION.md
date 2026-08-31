# WebMCP Hackathon Submission Packet

Project name: Group Room Split MCP

Live URL: https://group-menu-order.zeabur.app

Public repository URL: TODO_PUBLIC_REPO_URL

YouTube demo URL: TODO_YOUTUBE_DEMO_URL

License: MIT

## One-Line Pitch

Group Room Split MCP is a WebMCP-powered room for social group buying, meals, drinks, KTV rooms, sports venues, tickets, rentals, and generic shared expenses. It lets a human start with photos or local OCR text, then lets an agent inspect the room through read-only WebMCP tools without taking over money decisions.

## WebMCP Fit

The app exposes page-local tools through `document.modelContext.registerTool()` when WebMCP is available. The first tool surface is deliberately read-only: agents can inspect the room, task router, formula contract, claim audit, and trust-layer contract, but they cannot calculate money externally, assign claims, overwrite formulas, or write payment data.

Implemented WebMCP tools:

- `inspect_room`
- `get_task_router`
- `get_claim_audit`
- `get_formula_contract`
- `get_trust_layer_contract`
- `suggest_next_actions`

## Human And Agent Collaboration

The human controls the room, task type, uploaded evidence, OCR text, participant names, and claim confirmation. The agent helps by reading the current state, identifying task conflicts, explaining missing claims, and guiding the next action from the WebMCP tool output. The `suggest_next_actions` tool is the primary agent workflow entrypoint: it returns read-only action suggestions, human-review blockers, formula boundaries, and forbidden actions.

AI is limited to OCR/schema repair. It cannot decide who owes money, change formulas, assign cost pools, or settle disputes.

## What Changed After August 25, 2026

This project existed earlier as a group menu ordering room. The WebMCP hackathon refactor changes the project into a generalized social group split room with six independent contract lines:

- Task router contract for `group_buy`, `drink_order`, `restaurant_split`, `ktv_room`, `sports_venue`, `ticket_activity`, `rental_share`, and `generic_split`.
- Evidence/OCR contract with local-first parsing and a bounded AI repair gate.
- Deterministic formula engine contract that keeps money math inside the app.
- AI repair gate and task conflict gate.
- Claim audit ledger for shared candidates and extra personal claims.
- WebMCP read-only tool surface plus a hash-only Google Sheets trust-layer contract.

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
TRUST_LAYER_SPREADSHEET_ID=1jWJTduZ-ZalNfBQ_X5PYyEMoa8We0ppaA6Y8QJhiUwM
```

Optional for AI repair:

```bash
GEMINI_API_KEY=zeabur_secret_value
GOOGLE_API_KEY=zeabur_secret_value
GOOGLE_GENERATIVE_AI_API_KEY=zeabur_secret_value
GOOGLE_GEMINI_API_KEY=zeabur_secret_value
GEMINI_KEY=zeabur_secret_value
GEMINI_MODEL=gemini-2.5-flash
GEMINI_MODEL_FALLBACKS=gemini-2.5-flash-lite,gemini-flash-latest
GEMINI_RETRY_ATTEMPTS=2
```

Do not commit API keys. Set secrets in Zeabur environment variables only.

For Zeabur, attach a persistent volume before using `/data/rooms.json`. Without a volume, the JSON store still works during one runtime session, but platform filesystem resets can clear room state.

The JSON store is a hackathon MVP persistence layer for one running service instance. It should be disclosed as not suitable for horizontal scaling or high-concurrency writes; production should use Redis or PostgreSQL.

Deployment owners should replace secrets only in Zeabur Variables or the hosting provider secret manager. The repository includes variable names in `.env.example`, but no real key values. AI provider keys are optional because manual input and local OCR text can still demonstrate the WebMCP tool workflow.

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
8. Show that the agent can read contracts and audit state, but cannot calculate money externally or write payment data.
9. Explain that WebMCP is the browser-page tool surface registered by `document.modelContext.registerTool()`. The same-origin backend exists for app state, uploads, Socket.IO sync, and persistence; it is not a public agent mutation API.

## Compliance Notes

- No fake account scraping.
- No vendor API reverse engineering.
- No authenticated vendor cookies or private ordering sessions.
- No payment processing.
- No raw OCR, images, raw device IDs, payment identifiers, or social account identifiers are written to Google Sheets.
- Google Sheets is only a short-lived hash whitelist and audit-log trust layer.

## Remaining Submission Checklist

- Replace `TODO_PUBLIC_REPO_URL` after publishing the repository.
- Replace `TODO_YOUTUBE_DEMO_URL` after uploading the public demo video.
- Verify the live Zeabur URL after deployment.
- Confirm Zeabur volume is mounted when `ROOM_STORE_PATH=/data/rooms.json` is configured.
- Confirm Devpost description uses the same WebMCP boundary stated here.
