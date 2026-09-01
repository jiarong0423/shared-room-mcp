# Threat Model

Evidence date: 2026-09-01

## Product Boundary

Shared Room MCP is an open-source WebMCP template for shared room coordination. The app helps people and agents turn messy group intent into a visible draft, then keeps the final decision with the human host.

The project does not process payments, collect credit cards, place orders, submit bookings, or write to external commerce systems.

## Assets

- Room state: room id, item list, quantities, participant display names, confirmation states, and agent draft proposals.
- Uploaded price evidence: one compressed image and optional pasted text per room.
- Deployment secrets: optional OCR or AI provider keys configured only by the deployment owner.
- WebMCP tool surface: browser-side tools registered through `document.modelContext.registerTool()`.
- Local persistence: JSON room storage for demo deployment, usually backed by a host volume.

## Trust Boundary

This section records the trust boundary decisions for the public WebMCP demo.

- Browser UI: trusted only for user interaction and final human review.
- WebMCP agent: allowed to inspect structured room state and create draft proposals only.
- Node server: owns room state, rate limits, upload validation, parsing, persistence, parsed-item review gates, and proposal status transitions.
- Optional OCR or AI providers: fallback-only helpers. The no-key demo path must continue to work without them.
- Google Sheets or external trust adapters: future optional adapters only. They must not receive raw device ids, payment data, uploaded images, or private room details.

## Data Flow

This section records the data flow used by the no-key demo and optional deployment-owner providers.

1. A user creates a room and shares the room link.
2. The host uploads a price image or pastes copied text.
3. The server parses local text first and may use optional fallback OCR only when configured.
4. A WebMCP-capable agent may inspect the page state and create a proposal draft.
5. The host may remove bad parsed rows or correct item names, prices, and categories before opening the list.
6. The host explicitly opens the reviewed list to members.
7. Participants choose their own items and confirm their own cost.
8. The host must use the page UI to approve or reject any agent draft through a two-step confirmation.
9. Settlement stays inside the room summary. No payment, booking, order, or external submission is triggered.

## Threats And Controls

| Threat | Control |
| --- | --- |
| Agent overreach into final decisions | WebMCP tools are read-only or draft-only. Final review is a host-only UI action. |
| Agent creates a misleading draft | Drafts are labeled as suggestions, remain pending, and require a two-step human decision. |
| Agent overwrites calculation rules or room type | Calculation rules and room type are owned by the server. Proposal payloads are sanitized and do not mutate totals. |
| Bad OCR row enters the item list | Host can edit or remove parsed rows before opening the list. Server blocks parsed-item edits after the list is opened, after settlement, after any member confirmation, or when the item is already claimed. |
| Unauthorized user reviews a draft | Server checks `ownerParticipantId` before accepting or rejecting a proposal. |
| Uploaded image abuse | Upload size, file type, rate limits, and image processing limits are enforced server-side. |
| Provider key exposure | Keys are read only from environment variables. `.env` files are ignored and sample files contain empty placeholders. |
| Room loss on demo host restart | JSON persistence can be mounted to a deployment volume through `ROOM_STORE_PATH`. |
| Personal or payment data entering public repo | Public export excludes runtime logs, room data, `.env`, and generated JSON evidence. |

## Out Of Scope

- Payment authorization or card storage.
- Direct order placement.
- External booking submission.
- Raw device fingerprint storage.
- Authenticated vendor account automation.
- Long-term production identity or fraud scoring.

## Release Gate

Before public deployment or repo submission:

- Run `npm run check`.
- Run `npm run audit:tasks`.
- Run `npm audit --audit-level=high`.
- Run the local repeated room-flow check with at least 20 rounds.
- Run the local AI security review.
- Confirm that no `.env`, room data, runtime logs, or generated JSON reports are staged for commit.
