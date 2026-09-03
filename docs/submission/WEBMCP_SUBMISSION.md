# WebMCP Hackathon Submission Packet

Project name: Shared Room MCP, powered by Adaptive Contract MCP

Live URL: https://shared-room-mcp-next.zeabur.app/

Public repository URL: https://github.com/jiarong0423/shared-room-mcp

YouTube demo URL: Pending final demo upload

License: MIT

## One-Line Pitch

Shared Room MCP shows a practical commercial MCP workflow: a merchant uploads an electronic menu, customers enter a private booth link and order on their own devices, AI prepares the room state, and the merchant downloads the reviewed order details.

## Devpost Text Description Draft

Shared Room MCP is an open-source trust boundary layer for menu and service intake on the agent-native web. It is not a chatroom, messaging app, payment gateway, or auto-booking agent. In the demo script, a merchant uploads an electronic menu, opens a private booth link, customers enter the booth on their own devices, choose items, and the merchant reviews the merged order details before downloading the summary. Payments and formal external orders stay outside this project. From the browser sidebar or an authorized local bridge, the assistant uses WebMCP-compatible room tools to read private room state, spot missing details, and place draft suggestions into the room.

The core safety idea is simple: AI prepares the evidence review; humans approve the commitment. The assistant handles context gathering, field extraction, risk hints, and repetitive draft work. Merchant/customer review gates control the committed state. Every booth room is independent: the shared link, evidence, draft list, customer selections, merged totals, review decisions, and export summary belong to that one room, and WebMCP tools read only the current room state.

The visible UI and exports are locked to the selected language. Menu item names and customer-entered names keep their source language, while system review copy is translated through the page dictionary and plain-language mapping.

`Shared Room MCP` is the reference app and repository slug. `Adaptive Contract MCP` is the reusable architecture layer: scenario contracts, routing, prompt constraints, image-oracle verification, anti-pollution guardrails, and HITL state-machine enforcement.

`Adaptive Contract MCP` is not a blockchain smart contract and not an autonomous execution engine. It means adaptive room terms drafted from evidence, validated by strict schemas, reviewed through WebMCP/Codex, and executed only after human approval.

This brings WebMCP capability to real-world workflows, combining agent productivity with human control.

Shared Room MCP is built for messy real-world coordination: table ordering, drink orders, group purchases, service checklists, repair estimates, appointment drafts, activity signups, and other pre-commitment workflows. These workflows usually start from a menu board, social post, evidence photo, receipt, partial form, copied text, or screenshot rather than a clean store API.

The project gives the assistant page-local WebMCP tools. The assistant can inspect the current private room, read the selected scenario, find missing confirmations, review price-reading quality, and create a draft for the merchant. Codex can also create a field-fix draft when the price list is read incorrectly, such as quantity, subtotal, size, or add-on columns being confused with item prices. Repairs become visible merchant-reviewed proposals before they affect customer-facing rows.

The core demo works without any paid API key for room state, WebMCP inspection, merchant-reviewed proposals, local math, customer confirmation, and export. For image evidence, OCR-only output is candidate evidence; an authorized local bridge runs local OCR, Codex occupies the LLM/visual-review node, and the bridge writes a draft-only proposal into the hosted room. Optional hosted or local model providers are replaceable helpers for deployments that explicitly choose them outside this Codex demo path.

After human review, the room can export a local HTML or PDF review record of the private task state.

The broader idea is an open-source pattern for the agent-native web: tools that are useful enough for AI assistants to prepare real work, but narrow enough that humans keep control over final commitments.

## WebMCP Fit

The app exposes page-local tools through `document.modelContext.registerTool()` when WebMCP is available. In this project, WebMCP is a state reader and draft generator, not a browser-control agent that clicks or submits final actions. Most tools are read-only: the assistant can inspect the room, the selected plan, the local math rules, confirmation status, and trust settings. One draft tool can create a small JSON proposal for merchant review. Applied state changes pass through merchant/customer UI transitions and customer publishing.

WebMCP is not presented as the multi-user sync layer. The normal web runtime synchronizes customer selections and totals. WebMCP scopes the assistant to the current room state and exposes only bounded review tools.

This is a WebMCP starter project, not a paid API wrapper. The default no-key path is the authorized local bridge, `Load Sample Room`, deterministic parsing, and merchant-reviewed local bridge proposals. OCR-only parsing is draft evidence and must not be described as completed image review. External image-reading, vision, model, spreadsheet, commerce, booking, CRM, or community integrations are optional extensions owned by the deployment owner.

Implemented WebMCP tools:

- `inspect_room`
- `get_task_router`
- `get_claim_audit`
- `get_formula_contract`
- `get_trust_layer_contract`
- `suggest_next_actions`
- `create_action_proposal`

## Human And Agent Collaboration

The human controls the room, task type, uploaded evidence, copied text, parsed item review, customer publishing, participant names, customer selection confirmation, and final summary. The assistant helps by reading the current private room state, identifying conflicts, explaining missing confirmations, guiding the next action from the WebMCP tool output, and preparing drafts for the merchant. The `suggest_next_actions` tool is the main read path. The `create_action_proposal` tool stores a waiting-for-merchant JSON proposal under `room.agentProposals[]`, including field-fix drafts when Codex detects a reading mistake. The merchant can edit or remove parsed item rows before publishing the list to customers. Merchant review stays on one visible draft card; repeated same-type drafts replace the previous pending card instead of stacking duplicate decisions. Accepted reviews are explicit room-state transitions.

The core loop is: local OCR produces candidate text; Codex checks the image and turns it into a structured draft; WebMCP/Codex writes or reviews the draft against room state and evidence; the human edits, confirms, and releases the final commitment.

Chinese wording for review: 圖片 -> 本地 OCR -> Codex 看圖校正 -> 結構化草稿 -> 人工審核 -> 通過。

Zeabur is the hosted state storage, MCP protocol host, HITL approval gate, guardrail runtime, customer publishing surface, and export surface. Zero required ML/OCR workload is processed on the Zeabur server in the default WebMCP Challenge path; local OCR and Codex visual review run through the authorized local bridge before a draft proposal is pushed.

Threshold conditions such as minimum headcount, minimum spend, and free-shipping thresholds are review context. The assistant may flag a mismatch between the evidence and the current room state, but it cannot decide that the group is formed, the booking is valid, payment is complete, or the final summary is complete. The merchant can edit, override, and publish the customer-facing task after review.

Optional provider AI is limited to image/text repair helpers outside this demo path. Future forks can reuse the same draft-first pattern for booking drafts, repair appointment drafts, salon reservation drafts, activity signup drafts, and other pre-commitment workflows while keeping commitments behind merchant/customer review gates.

## Official Requirement Alignment

Checked against the WebMCP Challenge page on 2026-09-01.

| Requirement | Local status |
|---|---|
| Working live URL accessible in ChatGPT in-app browser or Chrome with WebMCP enabled | Ready: https://shared-room-mcp-next.zeabur.app/ |
| Text description explaining WebMCP fit and user experience | Ready in `README.md` and this packet |
| Public YouTube demo under 3 minutes with audio | Pending final demo upload |
| Public code repository | Ready: https://github.com/jiarong0423/shared-room-mcp |
| All necessary source code, assets, and instructions | Ready |
| Open-source license visible at repository root | Ready: MIT `LICENSE` |
| Repository contains `document.modelContext.registerTool(...)` | Ready: `public/index.html` |
| WebMCP use beyond a trivial proof of concept | Ready: read-only tools plus a merchant-reviewed draft tool |
| Complete coherent product experience | Ready for local and live smoke |
| Specific real-world audience/problem | Ready: messy private task workflows before commitment |
| Local record export | Ready: reviewed rooms can export HTML and PDF summaries |

## What Changed After August 25, 2026

This project existed earlier as a menu-ordering room. The WebMCP hackathon refactor changes the project into a form-based async private task room powered by Adaptive Contract MCP, with six fixed safety lines:

- One selected room type for `group_buy`, `drink_order`, `restaurant_split`, `ktv_room`, `sports_venue`, `ticket_activity`, `rental_share`, and `generic_split`.
- Price evidence review with local-first parsing and optional extension repair.
- Local money math that stays inside the app.
- AI repair and conflict checks that stop for human review when the input is unclear.
- Customer confirmation records for selected items and add-ons.
- WebMCP read-only inspection tools, one merchant-reviewed draft tool, and a hash-only trust option.
- Open-source extension path for future social, commerce, booking, image-reading, spreadsheet, and private-community integrations.
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

For a hosted demo, attach a persistent volume before using `/data/rooms.json`. Without a volume, room data can still work during one runtime session, but a platform restart can clear it. The current Zeabur service mounts `/data` and uses this path.

The current save layer is a hackathon MVP choice for one running service instance. It smooths short write bursts by merging nearby room changes and adding a small millisecond delay before saving, but a hard crash can still lose the latest tiny write window. Production traffic should still use Redis or PostgreSQL.

Deployment owners should replace secrets only in the hosting provider secret manager. The repository includes variable names in `env.sample`, but no real key values. AI provider keys are extension-only adapters. The required demo path is authorized local OCR plus LLM visual review, WebMCP room inspection, Codex review, and human approval.

## Local Verification

```bash
npm install
npm run check
npm run audit:tasks
IMAGE_MATRIX_ROOT=/path/to/downloaded/image-matrix npm run build:image-fixture-manifest
IMAGE_MATRIX_ROOT=/path/to/downloaded/image-matrix npm run stress:image-matrix -- --base-url http://127.0.0.1:3000 --mode image-plus-oracle-text --output-dir logs/runtime/image-matrix
IMAGE_MATRIX_ROOT=/path/to/downloaded/image-matrix npm run stress:image-matrix -- --base-url https://shared-room-mcp-next.zeabur.app --mode image-plus-local-ocr --tesseract-bin /opt/homebrew/bin/tesseract --delay-ms 5000 --limit 3 --continue-on-failure --output-dir logs/runtime/image-matrix-local-ocr-canary
npm run stress:contracts -- --base-url http://127.0.0.1:3000 --rounds 20 --concurrency 4 --output-dir logs/runtime
npm start
```

For repeated local stress runs, run `npm start` with test-only rate limits:

```bash
ROOM_CREATE_RATE_LIMIT_MAX=500 MENU_PARSE_RATE_LIMIT_MAX=500 API_RATE_LIMIT_MAX=1000 npm start
```

The Zeabur public demo keeps the lower public-demo throttle. A local 429 during rapid repeated tests means the runner is measuring the throttle, not the HITL state machine.

The repeated room-flow check covers 20 non-duplicate Traditional Chinese and English scenarios, with 20 rounds per scenario. It checks room creation, candidate evidence parsing, stable room-type selection, draft creation, and the final human approval rule.

The image-matrix command is a deterministic contract-driven integration benchmark. The public repository keeps the manifest, schema, and runner; the full PNG set is supplied as an external artifact through `IMAGE_MATRIX_ROOT` or `--matrix-root`.

There are three separate image-test modes:

- `image-only`: uploads only the image. It is a negative canary unless the deployment owner configured an image-reading provider.
- `image-plus-local-ocr`: runs OCR through the authorized local bridge first, then writes OCR details and a draft proposal into the hosted room. Zeabur remains the room/runtime/HITL surface, not the OCR engine. This mode is a canary for field isolation, evidence pointers, forbidden-number leakage, and advisory threshold handling; completed image review still requires Codex visual review or merchant repair before customer publishing.
- `image-plus-oracle-text`: uploads the image plus locked oracle text and verifies checksum-backed image-oracle artifacts, contract routing, customer-visible masks, and HITL state behavior.

None of these modes should be described as provider accuracy, zero-shot extraction, unconstrained vision accuracy, or Zeabur-hosted OCR.

Semantic Visual Anchor Notice: the current protocol records logical `boundingZone` values and contextual `auditAnchor` snippets for merchant review. Pixel-level `bbox` crop overlays are reserved roadmap fields and are not part of the current release claim.

The public evidence summary is tracked in `docs/testing/VALIDATION_EVIDENCE.md`. It records only checks that were actually run: local repeated flows, merchant-only draft review, Load Sample Room, hosted smoke checks, deterministic image-oracle integration, and short JSON save-burst checks.

Open `http://localhost:3000`, create a room, choose a business flow, paste evidence text or upload an image, add customers, choose items, and inspect the review panel.

## Locked Demo Runbook

Target length: 2 minutes 20 seconds to 2 minutes 45 seconds. The recording shows one complete English workflow followed by one faster Chinese contrast workflow. The presenter handles page navigation and file selection, while WebMCP/Codex handles room inspection and draft proposal creation. The human only performs explicit approval, customer confirmation, finalization, and download clicks listed below.

Prepared synthetic evidence:

- English: `Moon Table Cafe Menu`, generated by `npm run demo:codex-ocr-llm` when no image path is supplied. It is a synthetic merchant menu board with short-name, add-on, and pricing-note rows for OCR plus Codex visual review.
- Optional Chinese contrast: `社區水果免運團購`, containing purchasable fruit items plus a free-shipping threshold and shipping-review lines.
- All recording images are synthetic. They contain no customer, vendor, social-account, or payment data.

Opening line:

"AI prepares a local review draft and writes it into the room. Humans approve the commitment."

### Scene A: English Menu Review

0:00-0:05: Start on a dark screen, then reveal the live Merchant Menu Intake page with the Codex side panel on the right. Keep the UI in English.

Spoken line:

"AI prepares a local review draft and writes it into the room. Humans approve the commitment."

0:05-0:18: **Presenter setup.** Create or reuse the live room. Keep the evidence image and draft area visible so the source and the pending review card are both clear.

0:18-0:35: **WebMCP/Codex action.** Run `npm run demo:codex-ocr-llm -- --base-url https://shared-room-mcp-next.zeabur.app`. The guided bridge performs local OCR, puts Codex in the LLM/visual-review node for the image, and writes one review draft proposal into the Zeabur room. Call `inspect_room` and `suggest_next_actions`, then pause with one draft card visible under `AI Review Draft`.

Agent cue:

"The draft matches the visible evidence. Please click the highlighted button once to mark it reviewed."

0:35-0:43: **Human click 1.** Click the highlighted button on the single draft card. Do not move to another card.

Agent cue after the button changes:

"The same card is now ready for approval. Please click the green button once."

0:43-0:50: **Human click 2.** Click the green button on the same card. The card must visibly leave the waiting state. If a second equivalent card appears, stop the recording.

0:50-1:05: **Presenter setup.** Open the copied room link in a second tab as `Jamie`, select one item for Jamie, and move the pointer to Jamie's selection confirmation button.

Agent cue:

"Jamie is confirming only Jamie's own item. Please click the highlighted confirmation button once."

1:05-1:12: **Human click 3.** Click Jamie's selection confirmation button once.

1:12-1:22: **Presenter setup.** Immediately return to the merchant tab, verify that Jamie is present and confirmed, then move the pointer to `Merchant Finalizes Summary`.

Agent cue:

"The room now includes Jamie's confirmation. Please click Merchant Finalizes Summary once."

1:22-1:28: **Human click 4.** Click `Merchant Finalizes Summary` once.

1:28-1:40: **Human clicks 5 and 6.** Click `Download PDF`, then `Download HTML`. The agent verifies that both files were downloaded and can be opened. Stop immediately if either file is missing, blank, corrupted, or unreadable.

### Scene B: Chinese Free-Shipping Group Buy

1:40-1:48: **Presenter setup.** Open a new room, switch the UI to Chinese, and upload the prepared `社區水果免運團購` image through the visible file picker.

1:48-2:02: **WebMCP/Codex action.** Run the authorized local review bridge against the Chinese evidence image. Show that `滿額 1500 免運`, `冷藏運費`, and `免運差額` are treated as review conditions, not as customer-selectable products.

2:02-2:12: **WebMCP/Codex action.** Call the same WebMCP inspection and proposal tools. Pause on one Chinese draft card and state:

"AI separated the purchasable items from the shipping conditions, but the merchant still owns the decision."

2:12-2:32: **Same human pattern.** The agent positions each target. The human clicks the same draft card twice, the second customer clicks one selection confirmation, and the merchant clicks finalization once. Do not pause between routine agent actions.

2:32-2:42: Hold on the completed Chinese room and its separated review context.

Closing line:

"WebMCP lets the agent prepare and check merchant review drafts while people keep every commitment. The same pattern can support shared orders, registrations, bookings, and other customer-facing intake workflows without exposing final payment or external submission as an agent tool."

Operator rule for recording:

- The presenter performs navigation, language switching, file selection, customer item selection, tab switching, and pointer placement.
- WebMCP/Codex performs room inspection, local-review draft creation, and release-gate checks.
- The human clicks only after the agent gives an explicit cue.
- Draft review uses one visible card in one position: first review click, then green approval click on that same card.
- The second customer confirms only their own selection. The agent then returns to the merchant tab immediately.
- The merchant finalizes only after the second customer state is visible.
- The human downloads PDF first and HTML second. Both files must open before the take is accepted.
- Any missing image preview, duplicate draft card, failed room join, wrong-language text, stale customer state, broken download, or unreadable export stops the take immediately.

## Compliance Notes

- No fake account scraping.
- No vendor API reverse engineering.
- No authenticated vendor cookies or private ordering sessions.
- No payment processing.
- No raw extracted text, images, raw device IDs, payment identifiers, or social account identifiers are written to Google Sheets.
- Google Sheets is only a design-level short-lived hash whitelist and audit-log trust layer in this public core; production check/enroll/revoke adapters are roadmapped extensions.

## Remaining Submission Checklist

- Public repository URL is set to `https://github.com/jiarong0423/shared-room-mcp`.
- Add the final public YouTube demo URL after uploading the video.
- Live URL `https://shared-room-mcp-next.zeabur.app/` must be rechecked after the next successful Zeabur production deployment; the latest local fixes should not be represented as deployed until `/healthz` reports the new Adaptive Contract MCP versions.
- Confirm the Zeabur `/data` volume remains mounted when `ROOM_STORE_PATH=/data/rooms.json` is configured.
- Disclose that the current room authority model is demo-grade; production deployments should add signed sessions or a real login system.
- Confirm Devpost description uses the same WebMCP safety rule stated here.
