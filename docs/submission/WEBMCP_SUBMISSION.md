# WebMCP Hackathon Submission Packet

Project name: Shared Room MCP

Live URL: https://sharedroom.jace0423.com/

Public repository URL: https://github.com/jiarong0423/shared-room-mcp

YouTube demo URL: TODO_YOUTUBE_DEMO_URL

License: MIT

## One-Line Pitch

Shared Room MCP is an open-source trust boundary layer for the agent-native web. AI prepares the work; humans approve the commitment.

## Devpost Text Description Draft

Shared Room MCP is an open-source trust boundary layer for the agent-native web. It creates one shared page where people and AI assistants can work together before anyone pays, books, signs up, posts publicly, or makes another real-world commitment. From the browser sidebar, the assistant uses WebMCP tools from the page itself to read the room, spot missing details, and place draft suggestions directly on the page.

The core safety idea is simple: AI prepares the work; humans approve the commitment. The assistant handles context gathering and repetitive draft work, while settlement, payment, booking submission, signup submission, regulated purchase approval, public posting, and final commitment remain behind human confirmation.

This brings WebMCP capability to real-world workflows, combining agent productivity with human control.

Shared Room MCP is built for messy real-world coordination: group buys, drink orders, restaurant splits, KTV rooms, sports venues, tickets, rentals, appointment drafts, service requests, activity signups, and other pre-commitment workflows. These workflows usually start from a chat message, social post, evidence photo, receipt, partial form, or copied text rather than a clean store API.

The project gives the assistant page-local WebMCP tools. The assistant can inspect the room, read the selected scenario, find missing confirmations, review price-reading quality, and create a draft for the host. Codex can also create a field-fix draft when the price list is read incorrectly, such as quantity, subtotal, size, or add-on columns being confused with item prices. It cannot silently apply that repair, calculate money outside the app, assign claimants, submit bookings, write payment data, or finalize settlement.

The core demo works without any paid API key: users can paste copied text from a price image, the app creates structured items, and local room logic keeps totals and confirmation state inside the app. Optional model providers are only replaceable helpers for image/text repair, not the required agent workflow.

After human review, the room can export a local HTML or PDF review record. Export is read-only: it does not submit a form, call a payment provider, change Google Sheets, or write to external services.

The broader idea is an open-source pattern for the agent-native web: tools that are useful enough for AI assistants to prepare real work, but narrow enough that humans keep control over final commitments.

## WebMCP Fit

The app exposes page-local tools through `document.modelContext.registerTool()` when WebMCP is available. Most tools are read-only: the assistant can inspect the room, the selected plan, the local math rules, confirmation status, and trust settings, but it cannot calculate money externally, assign claims, overwrite rules, finalize settlement, or write payment data. One draft tool can create a small JSON proposal for host review without applying it.

This is a WebMCP starter project, not a paid API wrapper. Manual input, `Load Sample Room`, copied OCR text, and local parsing are the default path. Cloud OCR, vision, model, spreadsheet, commerce, booking, CRM, or community integrations are optional and owned by the deployment owner.

Implemented WebMCP tools:

- `inspect_room`
- `get_task_router`
- `get_claim_audit`
- `get_formula_contract`
- `get_trust_layer_contract`
- `suggest_next_actions`
- `create_action_proposal`

## Human And Agent Collaboration

The human controls the room, task type, uploaded evidence, copied text, parsed item review, group opening, participant names, claim confirmation, and settlement. The assistant helps by reading the current state, identifying conflicts, explaining missing claims, guiding the next action from the WebMCP tool output, and preparing drafts for the host. The `suggest_next_actions` tool is the main read path. The `create_action_proposal` tool is the safe draft path: it stores a waiting-for-host JSON proposal under `room.agentProposals[]`, including field-fix drafts when Codex detects a reading mistake. The host can edit or remove parsed item rows before opening the list to members. Owner review stays on one visible draft card; repeated same-type drafts replace the previous pending card instead of stacking duplicate decisions. Review does not change orders, formulas, settlement, payment, Google Sheets, or external services.

Provider AI is optional and limited to image/text repair helpers. It cannot decide who owes money, change calculation rules, assign cost pools, or settle disputes. Future forks can reuse the same draft-first pattern for booking drafts, repair appointment drafts, salon reservation drafts, activity signup drafts, and other pre-commitment workflows, but final submission and payment should remain human-controlled.

## Official Requirement Alignment

Checked against the WebMCP Challenge page on 2026-09-01.

| Requirement | Local status |
|---|---|
| Working live URL accessible in ChatGPT in-app browser or Chrome with WebMCP enabled | Ready: https://sharedroom.jace0423.com/ |
| Text description explaining WebMCP fit and user experience | Ready in `README.md` and this packet |
| Public YouTube demo under 3 minutes with audio | Pending `TODO_YOUTUBE_DEMO_URL` |
| Public code repository | Ready: https://github.com/jiarong0423/shared-room-mcp |
| All necessary source code, assets, and instructions | Ready |
| Open-source license visible at repository root | Ready: MIT `LICENSE` |
| Repository contains `document.modelContext.registerTool(...)` | Ready: `public/index.html` |
| WebMCP use beyond a trivial proof of concept | Ready: read-only tools plus a host-reviewed draft tool |
| Complete coherent product experience | Ready for local and live smoke |
| Specific real-world audience/problem | Ready: messy shared workflows before payment, booking, signup, posting, or commitment |
| Local record export | Ready: reviewed rooms can export HTML and PDF summaries |

## What Changed After August 25, 2026

This project existed earlier as a group menu ordering room. The WebMCP hackathon refactor changes the project into a generalized social group room with six fixed safety lines:

- One selected room type for `group_buy`, `drink_order`, `restaurant_split`, `ktv_room`, `sports_venue`, `ticket_activity`, `rental_share`, and `generic_split`.
- Price evidence review with local-first parsing and optional AI repair.
- Local money math that stays inside the app.
- AI repair and conflict checks that stop for human review when the input is unclear.
- Member confirmation records for shared items and extra personal claims.
- WebMCP read-only inspection tools, one host-reviewed draft tool, and a hash-only Google Sheets trust option.
- Open-source extension path for future social, commerce, booking, OCR, spreadsheet, and private-community integrations.
- No-key `Load Sample Room` entrypoint for fast judging and smoke testing.

## Environment Variables

Required for a normal single-instance hosted runtime:

```bash
HOST=0.0.0.0
PORT=3000
ROOM_TTL_HOURS=12
ROOM_PERSISTENCE=json
ROOM_STORE_PATH=/data/rooms.json
ROOM_PERSIST_DEBOUNCE_MS=35
ROOM_PERSIST_JITTER_MS=120
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

Do not commit API keys. Set secrets in the hosting provider's secret manager only.

Runtime requires Node.js `>=20.9.0`. Leave `CORS_ORIGIN` empty for a same-origin deployment; set it only when the browser frontend is served from a separate trusted origin.

For a hosted demo, attach a persistent volume before using `/data/rooms.json`. Without a volume, room data can still work during one runtime session, but a platform restart can clear it. The current Railway service mounts `/data` and uses this path.

The current save layer is a hackathon MVP choice for one running service instance. It smooths short write bursts by merging nearby room changes and adding a small millisecond delay before saving, but a hard crash can still lose the latest tiny write window. Production traffic should still use Redis or PostgreSQL.

Deployment owners should replace secrets only in the hosting provider secret manager. The repository includes variable names in `env.sample`, but no real key values. AI provider keys are optional adapters because manual input and local OCR text can still demonstrate the WebMCP tool workflow.

## Local Verification

```bash
npm install
npm run check
npm run audit:tasks
npm run stress:contracts -- --base-url http://127.0.0.1:3000 --rounds 20 --concurrency 4 --output-dir logs/runtime
npm start
```

The repeated room-flow check covers 20 non-duplicate Traditional Chinese and English scenarios, with 20 rounds per scenario. It checks room creation, local copied-text OCR parsing, stable room-type selection, draft creation, and the final human approval rule.

The public evidence summary is tracked in `docs/testing/VALIDATION_EVIDENCE.md`. It records only checks that were actually run: local repeated flows, host-only draft review, Load Sample Room, hosted smoke checks, and short JSON save-burst checks.

Open `http://localhost:3000`, create a room, choose a task type, paste OCR text or upload an image, add participants, claim items, and inspect the audit panel.

## Locked Demo Runbook

Target length: under 3 minutes. The recording should show two controlled scenes: one English scene and one Chinese scene. The point is not to show every feature. The point is to show the same safety loop twice: agent prepares, humans confirm.

Opening line:

"AI prepares the work directly on the page. Humans approve the commitment."

### Scene A: English Restaurant Split

0:00-0:05: Start directly on the live Shared Room page with the Codex or ChatGPT side panel visible. Do not start from setup screens.

0:05-0:15: Keep the UI in English. Use the Restaurant Split scene. Click `Load Sample Room` if the recording environment cannot reliably upload a prepared image. Pause on `Connected`, `6 items`, `Suggested Drafts`, and `Needs review`.

0:15-0:35: In the side panel, have the agent call `inspect_room` and `suggest_next_actions`. The page should show that the agent reads the room state and blockers through WebMCP tools, not through manual screen guessing.

0:35-0:50: Have the agent call `create_action_proposal`. Pause on the new host draft in `Suggested Drafts`. The visible state must remain waiting for host review.

0:50-1:05: The agent tells the host: "You can press Approve Draft now." The human clicks the single visible draft card button and waits for the card state to change.

1:05-1:25: Open the same room in a second tab with another member name, such as `Jamie`. Show that Jamie is in the same room, claims one item, and confirms only Jamie's own cost.

1:25-1:40: Return to the host tab. Show the member confirmation state. Stop before finalization until the agent says: "You can press Owner Finalizes Summary now." After finalization, click `Download HTML` or `Download PDF` once to show that the reviewed record can be exported locally.

### Scene B: Chinese Group Buy Or Drink Order

1:40-1:50: Open a new room or reset the current room. Switch the UI to Chinese. Use a different scene from Scene A: Group Buy / Free Shipping or Drink Order.

1:50-2:05: Load or paste a Chinese sample that includes a threshold, menu option, or ambiguous non-item line. Pause when the page shows the parsed list and any review notice.

2:05-2:25: Have the agent inspect the room and create a host draft. The draft should explain what needs human review, such as a threshold line that is not a purchasable item.

2:25-2:40: The agent tells the host when to approve. The human performs the approval step, then stops.

2:40-2:55: Open the same Chinese room as a second member, such as `小明`. The second member claims or confirms only their own item. Return to the host and stop before any final irreversible action.

Closing line:

"This is not an ordering app. It is a WebMCP trust boundary template. The agent prepares structured drafts and highlights conflicts directly on the page. Humans approve, claim, and finalize. No payment, booking submission, regulated purchase approval, public posting, or external account action is exposed as a tool."

Operator rule for recording:

- The agent performs page setup, WebMCP inspection, and draft creation.
- The agent must pause before every host approval, member confirmation, and finalization.
- The human clicks approval or confirmation only after the agent explicitly says it is ready.
- Do not approve all drafts at once. Approve one visible draft, wait for the state change, then continue.

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
- Live URL `https://sharedroom.jace0423.com/` was rechecked after the final functional push; production health, WebMCP tools, and the two locked room-transition cases passed.
- Confirm the Railway `/data` volume remains mounted when `ROOM_STORE_PATH=/data/rooms.json` is configured.
- Disclose that the current room ownership model is demo-grade; production deployments should add signed sessions or a real login system.
- Confirm Devpost description uses the same WebMCP safety rule stated here.
