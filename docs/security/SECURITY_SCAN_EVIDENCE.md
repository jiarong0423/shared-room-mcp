# Security Scan Evidence

Evidence date: 2026-09-01

## Scope

Repository: public WebMCP Challenge submission package.

## Code Security Checks

- Static syntax check: `npm run check` is required before release.
- AI security scanner: `ai-security-rules export-gate` and `ai-security-rules deploy-gate` are required before public deployment.
- Manual code review focus: WebMCP tool boundaries, proposal-only writes, owner-only review/reset actions, upload limits, rate limits, CORS configuration, security headers, and no-payment boundary.

## Current Result

Status: passed.

SAST-equivalent local code security evidence:

- `npm run check`: passed on 2026-09-01.
- `npm run audit:tasks`: passed on 2026-09-01 with checks ready `8/8`.
- `npm audit --audit-level=high`: passed on 2026-09-01 with `0` vulnerabilities.
- `ai-security-rules agent-review`: passed on 2026-09-01 with blocking findings `0`.
- `ai-security-rules export-gate`: passed on 2026-09-01 with blocking findings `0`.
- `ai-security-rules deploy-gate`: passed on 2026-09-01 after this evidence file was added.
- Current-file secret scan: no committed API keys, private keys, `.env` files, raw Google Sheet IDs, cookies, or payment data found in public source paths.
- Local contract stress matrix: passed 400/400 cases across 20 non-duplicate Chinese and English scenarios after the hidden-image UI fix.
- Load Sample Room boundary stress: passed 120/120 localhost cases. Each case verified sample creation, no task conflict, no external calculation, no settlement, no image upload dependency, repeat-load rejection, non-owner rejection, and non-owner proposal rejection.
- In-app browser WebMCP smoke: local page exposed 7 WebMCP tools, including the proposal-only `create_action_proposal` tool. `Load Sample Room` produced 6 visible items, `No pending costs`, one waiting host-review draft, and a disabled repeat sample button.
- Hidden-image UI regression smoke: passed on desktop. Empty sample rooms no longer show the saved-photo panel, no visible broken image remains, and the page has no horizontal overflow.
- HTML cache-control regression smoke: production `index.html` is served with `Cache-Control: no-store` so judges and the in-app browser do not stay on a stale UI after deployment.
- Live Zeabur sample smoke: passed on `https://shared-room-mcp.zeabur.app/`. `POST /api/rooms/:roomId/sample` returned 201 with 6 items, `restaurant_split`, no task conflict, one `pending_host_confirmation` draft, and `settled=false`.
- Live Zeabur restart persistence smoke: passed. Room `a288f74b` survived service restart with 6 items and one pending draft after `ROOM_STORE_PATH=/data/rooms.json` was active.
- GitHub repository smoke: `https://github.com/jiarong0423/shared-room-mcp` showed the expected source repository and `MIT license`.
- Owner gate stress check: passed 100/100 blocked non-owner proposal creates and 100/100 blocked non-owner proposal reviews.
- UI confirmation smoke: desktop approval and mobile rejection both require two clicks and leave no horizontal overflow.

The current implementation contains no known auto-payment, card storage, order-finalization, or external booking submission path. Agents can inspect state and create bounded host-review drafts only.

## Discussion-Derived Weak-Point Scan

Checked against visible Devpost requirements and discussion topics on 2026-09-01.

| weak point | local mitigation | evidence state |
|---|---|---|
| Hosted room state can reset after a platform restart | JSON persistence supports `ROOM_STORE_PATH=/data/rooms.json`; Zeabur volume is mounted for live judging | Live restart smoke passed after deployment |
| Judges may test in ChatGPT in-app browser or Chrome WebMCP mode | UI remains usable without WebMCP; WebMCP registration is progressive through `document.modelContext` when available | Local in-app browser detected all 7 tools; ordinary UI smoke passed |
| Repository license must be visible in GitHub About | Root `LICENSE` file is MIT; README and submission packet state MIT | GitHub repository page shows `MIT license` |
| First 30 seconds of demo needs immediate visible value | `Load Sample Room` creates structured sample data and a pending draft without API keys or uploads | Local API stress and browser smoke passed |
| Overclaim risk around 8 social scenarios | README states supported room branches and explicitly discloses P1 formula controls that still require manual review | `npm run audit:tasks` reports checks ready 8/8 with known P1 gaps preserved |
