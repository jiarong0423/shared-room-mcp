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
MENU_PARSE_RATE_LIMIT_MAX=30
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

Target length: 2 minutes 20 seconds to 2 minutes 45 seconds. The recording shows one complete English workflow followed by one faster Chinese contrast workflow. The agent directs and performs every routine page action. The human only performs the explicit approval, personal confirmation, finalization, and download clicks listed below.

Prepared synthetic evidence:

- English: `Community Workshop Signup`, containing ticket, material-kit, locker, and meal-voucher prices.
- Chinese: `社區水果免運團購`, containing purchasable fruit items plus a free-shipping threshold and shipping-review lines.
- Both images are synthetic recording assets. They contain no customer, vendor, social-account, or payment data.

Opening line:

"AI prepares the work directly on the page. Humans approve the commitment."

### Scene A: English Activity Signup

0:00-0:05: Start on a dark screen, then reveal the live Shared Room page with the Codex side panel on the right. Keep the UI in English.

Spoken line:

"AI prepares the work directly on the page. Humans approve the commitment."

0:05-0:18: **Agent action.** Click the visible evidence-photo area, open the system file picker, choose the prepared `Community Workshop Signup` image, and return to the page. Keep the selected image preview visible briefly so the evidence source is clear.

0:18-0:35: **Agent action.** Read the visible English evidence, enter only its visible price lines, and start the room. Call `inspect_room` and `suggest_next_actions`, then call `create_action_proposal`. Pause with one draft card visible under `Suggested Drafts`.

Agent cue:

"The draft matches the visible evidence. Please click the highlighted button once to mark it reviewed."

0:35-0:43: **Human click 1.** Click the highlighted button on the single draft card. Do not move to another card.

Agent cue after the button changes:

"The same card is now ready for approval. Please click the green button once."

0:43-0:50: **Human click 2.** Click the green button on the same card. The card must visibly leave the waiting state. If a second equivalent card appears, stop the recording.

0:50-1:05: **Agent action.** Open the copied room link in a second tab as `Jamie`, select one item for Jamie, and move the pointer to Jamie's personal confirmation button.

Agent cue:

"Jamie is confirming only Jamie's own item. Please click the highlighted confirmation button once."

1:05-1:12: **Human click 3.** Click Jamie's personal confirmation button once.

1:12-1:22: **Agent action.** Immediately return to the owner tab, verify that Jamie is present and confirmed, then move the pointer to `Owner Finalizes Summary`.

Agent cue:

"The room now includes the member's own confirmation. Please click Owner Finalizes Summary once."

1:22-1:28: **Human click 4.** Click `Owner Finalizes Summary` once.

1:28-1:40: **Human clicks 5 and 6.** Click `Download PDF`, then `Download HTML`. The agent verifies that both files were downloaded and can be opened. Stop immediately if either file is missing, blank, corrupted, or unreadable.

### Scene B: Chinese Free-Shipping Group Buy

1:40-1:48: **Agent action.** Open a new room, switch the UI to Chinese, and upload the prepared `社區水果免運團購` image through the visible file picker.

1:48-2:02: **Agent action.** Read the visible Chinese evidence and prepare the room. Show that `滿額 1500 免運`, `冷藏運費`, and `免運差額` are treated as conditions requiring review, not as member-selectable products.

2:02-2:12: **Agent action.** Call the same WebMCP inspection and proposal tools. Pause on one Chinese draft card and state:

"AI separated the purchasable items from the shipping conditions, but the organizer still owns the decision."

2:12-2:32: **Same human pattern.** The agent positions each target. The human clicks the same draft card twice, the second member clicks one personal confirmation, and the owner clicks finalization once. Do not pause between routine agent actions.

2:32-2:42: Hold on the completed Chinese room and its separated review context.

Closing line:

"WebMCP lets the agent handle the repetitive work on the page while people keep every commitment. The same pattern can support shared orders, registrations, bookings, and other collaborative tasks without exposing final payment or external submission as an agent tool."

Operator rule for recording:

- The agent performs all navigation, language switching, file selection, evidence entry, WebMCP inspection, draft creation, item selection, tab switching, and pointer placement.
- The human clicks only after the agent gives an explicit cue.
- Draft review uses one visible card in one position: first review click, then green approval click on that same card.
- The second member confirms only their own selection. The agent then returns to the owner tab immediately.
- The owner finalizes only after the second member state is visible.
- The human downloads PDF first and HTML second. Both files must open before the take is accepted.
- Any missing image preview, duplicate draft card, failed room join, wrong-language text, stale member state, broken download, or unreadable export stops the take immediately.

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
