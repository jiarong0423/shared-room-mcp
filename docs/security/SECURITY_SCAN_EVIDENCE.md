# Security Scan Evidence

Evidence date: 2026-09-03

## Scope

Repository: public WebMCP Challenge submission package.

## Code Security Checks

- Static syntax check: `npm run check` is required before release.
- AI security scanner: `ai-security-rules export-gate` and `ai-security-rules deploy-gate` are required before public deployment.
- Manual code review focus: WebMCP tool limits, draft-only writes, owner-only item/proposal review actions, upload limits, rate limits, CORS configuration, security headers, and no-payment rule.

## Current Result

Status: passed.

SAST-equivalent local code security evidence:

- Full Adaptive Contract MCP naming rescan passed on 2026-09-03. Active tracked source/docs/config/scripts no longer contain superseded protocol version names, superseded release-stress script names, retired non-Zeabur URLs, retired custom domains, local machine paths, or known secret token prefixes.
- Local `/healthz` on 2026-09-03 returned `adaptive-contract-evidence-ocr-contract.v1`, `adaptive-contract-service-blueprint.v1`, `adaptive-contract-trust-layer-contract.v1`, `adaptive-contract-webmcp-tools.v2`, and `adaptive-contract-room-store.v1`.
- Local Adaptive Contract parser regression passed 12/12 scenario lines on 2026-09-03 after the protocol naming cleanup.
- Local Member-Visibility Release stress passed 20/20 cases on 2026-09-03 after the protocol naming cleanup.
- The 115-image manifest builder passed on 2026-09-03 with the external image artifact supplied through `IMAGE_MATRIX_ROOT`; the public repository keeps the schema, manifest, and runner but does not commit the full PNG matrix.
- `release-boundary-safety-gate`: passed on 2026-09-03 with findings `0`, blocking `0`.
- `ai-security-rules agent-review`: passed on 2026-09-03 with P0 `0`, P1 `0`, P2 `75`; the P2 items are governance/review recommendations rather than release-blocking secret or boundary failures.
- GitHub remote comparison on 2026-09-03 showed `main` is still stale until the next push: remote README still contains the former Mermaid/member-release wording, remote `package.json` still contains the superseded release-stress script entry, remote `docs/architecture/ADAPTIVE_CONTRACT_MCP.md` is missing, and the historical development log is still tracked remotely.
- `npm run check`: passed on 2026-09-01.
- `npm run audit:tasks`: passed on 2026-09-01 with checks ready `8/8`.
- `npm audit --audit-level=high`: passed on 2026-09-01 with `0` vulnerabilities.
- `npm audit --audit-level=moderate --omit=dev`: passed on 2026-09-01 with `0` vulnerabilities.
- `ai-security-rules scan`: passed on 2026-09-01 with critical `0`, high `0`, medium `37`.
- `ai-security-rules rules-check`: passed on 2026-09-01 after the naming and export cleanup with blocking findings `0`; report was written outside the repository.
- `ai-security-rules agent-review`: passed on 2026-09-01 with blocking findings `0`, P0 `0`, P1 `0`, P2 `31`.
- `ai-security-rules export-gate`: passed on 2026-09-01 after the naming and export cleanup with blocking findings `0`; report was written outside the repository.
- `ai-security-rules deploy-gate`: passed on 2026-09-01 after the naming and export cleanup with blocking findings `0`; report was written outside the repository.
- `ai-security-rules rules-check`: passed again on 2026-09-02 after the room-transition fix with critical `0`, high `0`, blocking findings `0`, P0 `0`, and P1 `0`; report was written outside the repository.
- `ai-security-rules export-gate`: passed again on 2026-09-02 with blocking findings `0`, P0 `0`, P1 `0`, and P2 `0`; report was written outside the repository.
- `ai-security-rules deploy-gate`: passed again on 2026-09-02 with blocking findings `0`, P0 `0`, P1 `0`, and P2 `0`; report was written outside the repository.
- Current-file secret scan: no committed API keys, private keys, `.env` files, raw Google Sheet IDs, cookies, or payment data found in public source paths.
- Public path scrub: passed on 2026-09-01 with no tracked local machine paths, desktop media references, Codex attachment paths, spreadsheet document links, private-key blocks, or common token prefixes.
- Private-algorithm review: no sensitive scoring weights, non-public topology notes, restricted notes, or private business rules were found. Two broad keyword hits were false positives from embedded 1x1 PNG test fixtures in stress scripts.
- Local repeated room flow: passed 400/400 cases across 20 non-duplicate Chinese and English scenarios after the hidden-image UI fix.
- Load Sample Room repeat check: passed 120/120 localhost cases. Each case verified sample creation, no task conflict, no external calculation, no settlement, no image upload dependency, repeat-load rejection, non-owner rejection, and non-owner proposal rejection.
- In-app browser WebMCP smoke: local page exposed 7 WebMCP tools, including the proposal-only `create_action_proposal` tool. `Load Sample Room` produced 6 visible items, `No pending costs`, one waiting host-review draft, and a disabled repeat sample button.
- Hidden-image UI regression smoke: passed on desktop. Empty sample rooms no longer show the saved-photo panel, no visible broken image remains, and the page has no horizontal overflow.
- HTML cache-control regression smoke: the home page route serves `index.html` with `Cache-Control: no-store` so judges and the in-app browser do not stay on a stale UI after deployment. The route-level fix passed a 400/400 local repeated room-flow check.
- Superseded hosted sample smoke: passed on a retired Zeabur URL. `POST /api/rooms/:roomId/sample` returned 201 with 6 items, `restaurant_split`, no task conflict, one `pending_host_confirmation` draft, and `settled=false`.
- Live Zeabur restart persistence smoke: passed. Room `a288f74b` survived service restart with 6 items and one pending draft after `ROOM_STORE_PATH=/data/rooms.json` was active.
- GitHub repository smoke: `https://github.com/jiarong0423/shared-room-mcp` showed the expected source repository and `MIT license`.
- Owner-only check: passed 100/100 blocked non-owner proposal creates and 100/100 blocked non-owner proposal reviews.
- UI confirmation smoke: desktop approval and mobile rejection stay on one visible draft card, use the same-card confirmation button, and leave no horizontal overflow.
- Mutual-exclusion scenario matrix B: passed on 2026-09-01 with duplicate IDs `0`, duplicate titles `0`, duplicate OCR texts `0`, internal similarity blocks `0`, and baseline similarity blocks `0`.
- Split-language scenario matrix B: Chinese 120/120 passed with warnings `0`; English 120/120 passed with warnings `0`; every run left `semantic_repair_draft` in `pending_host_confirmation`.
- Parsed-item review check: `npm run stress:member-release -- --base-url http://127.0.0.1:3147 --rounds 20 --output-dir logs/runtime` passed 80/80 cases on 2026-09-01. It verified AI/OCR draft stays closed, non-owner edits are blocked, member claims before release are blocked, host edits before release are allowed, members cannot release the list, host edits after release are blocked, members can confirm only after release, and host settlement remains last.
- JSON save queue follow-up: `npm run stress:member-release -- --base-url http://127.0.0.1:3151 --rounds 5 --output-dir logs/runtime` passed 20/20 cases after `ROOM_PERSIST_DEBOUNCE_MS=35` and `ROOM_PERSIST_JITTER_MS=120` were added.
- Short save-burst check: 25 simultaneous room creates were all present in the saved JSON file on 2026-09-01; missing created rooms `0`.
- Superseded hosted post-deploy smoke: the Zeabur service reached `RUNNING` on 2026-09-01. Live `/healthz` showed `roomStorePath=/data/rooms.json`, `roomPersistDebounceMs=35`, `roomPersistJitterMs=120`, `hasGeminiKey=false`, and `hasOpenAiKey=false`. A retired-host Member-Visibility Release smoke passed 4/4.
- Post-export live smoke: the Zeabur export deployment reached `RUNNING` on 2026-09-01. The live home page showed `Evidence And Items`, `Owner Finalizes Summary`, `Download HTML`, and `智慧共享空間`. A live 4/4 room-flow smoke passed, then 4 HTML exports and 4 PDF exports returned valid files.
- Export readability recheck: downloaded live room `191fd8c3` HTML and PDF exports on 2026-09-01. `file` identified UTF-8 HTML and PDF 1.4; `pdftotext` extracted readable room status, item summary, total, and confirmation text.
- Impact check: `output/isolation/current_runs/shared_room_mcp_gate_20260901_pass/impact_evidence_state_gate.md` passed on 2026-09-01. Checked areas with evidence-backed `O` states: backend rules, frontend render, WebMCP tool limits, testing, security, and docs/submission.
- Local export smoke after wording cleanup: completed room `068b78ef` returned HTML 200 with `text/html; charset=utf-8`, PDF 200 with `application/pdf`, `%PDF-1.4`, and `%%EOF`; empty room export returned 409 for both HTML and PDF.
- Local export stress after backend export route: 80/80 complete-room flows passed, then 80/80 HTML exports and 80/80 PDF exports passed against `http://127.0.0.1:3162`.
- Single draft card cleanup: local contract stress passed 60/60 against `http://127.0.0.1:3178`. Each case now creates two same-type assistant drafts and verifies that only the latest pending draft remains for the host.
- Same-card flow recheck: local Member-Visibility Release stress passed 20/20 against `http://127.0.0.1:3178`. The host review UI stays on one visible card, while member claiming and settlement order remain unchanged.
- Final Member-Visibility Release export recheck: local Member-Visibility Release stress passed 20/20 against `http://127.0.0.1:3184` on 2026-09-01 after the export assertion was added to the script. The same flow verifies AI/OCR draft boundaries, host-only edits, member claim timing, member confirmation, host settlement, readable HTML export, and valid PDF export.
- Final superseded-host Member-Visibility Release export recheck: live Member-Visibility Release stress passed 4/4 against a retired Zeabur URL on 2026-09-01 with the same HTML/PDF export assertions. Live HTML also returned `Cache-Control: no-store`, old duplicate-review copy hits `0`, and expected hits for `Shared Room`, `Download HTML`, `Download PDF`, and `Owner Finalizes Summary`.
- Same-tab room-transition regression: passed 2/2 locally on 2026-09-02. A loaded room switched to a clean empty room with `Load Sample Room` enabled, and a late second-tab update from the old room could not overwrite the new room. Browser console errors and warnings were empty.
- Superseded production room-transition regression: passed exactly 2/2 low-rate cases on a retired custom domain after commit `bdaab1f` deployed. The same-tab room switch restored clean controls, and resetting the old room from a second tab did not overwrite the new room. Browser console errors and warnings were empty. No additional production stress run was performed.
- Room-transition impact gate: `output/isolation/current_runs/shared_room_transition_20260902/impact_evidence_state_gate.md` marked frontend render, room transition, async callback boundary, Socket.IO boundary, and unchanged backend projection as evidence-backed `O`. Git release and cloud runtime remained `△` before push and deployment.
- Final room-transition impact gate: `output/isolation/current_runs/shared_room_transition_20260902_final/impact_evidence_state_gate.md` returned `PASS` after Git and the two production cases were recorded; all affected layers were evidence-backed `O`.
- Proposal UI impact matrix: `output/isolation/current_runs/shared_room_proposal_ui_dedupe_20260901_final_latest/impact_evidence_state_gate.md` marked backend contract, frontend render, WebMCP draft, claim flow, and docs/submission as evidence-backed `O`; Git release was pending in that historical pass and was superseded by the completed 2026-09-02 release evidence above.
- Bilingual export repair: local Member-Visibility Release validation passed 4/4 on 2026-09-02 after PDF generation separated Latin text into Helvetica and Chinese text into MSung-Light. The same check requires both font resources, a valid PDF header and EOF marker, readable HTML, member confirmation, and owner finalization before export.
- Final public export and deployment gates passed on 2026-09-02 after the bilingual export and recording-script changes with blocking findings `0`, P0 `0`, P1 `0`, and P2 `0`. Audit-only reports remained outside the repository.
- Superseded retired-host production switched to the repaired build on 2026-09-02. `/healthz` returned HTTP 200 with `roomStorePath=/data/rooms.json` and `menuParseRateLimitMax=30`. One existing finalized room was used for a low-rate frontend download check: `Download PDF` returned a readable one-page PDF 1.4 file and `Download HTML` returned readable UTF-8 HTML. No production stress run was performed.

The current implementation contains no known auto-payment, card storage, order-finalization, or external booking submission path. Agents can inspect state and create bounded host-review drafts only. Parsed-item edits are host UI actions and are not exposed as WebMCP tools.

## Discussion-Derived Weak-Point Scan

Checked against visible Devpost requirements and discussion topics on 2026-09-01.

| weak point | local mitigation | evidence state |
|---|---|---|
| Hosted room state can reset after a platform restart | JSON persistence supports `ROOM_STORE_PATH=/data/rooms.json`; the current Zeabur service mounts `/data` | Zeabur health reports the `/data` store path; earlier retired-host checks are superseded historical evidence only |
| Judges may test in ChatGPT in-app browser or Chrome WebMCP mode | UI remains usable without WebMCP; WebMCP registration is progressive through `document.modelContext` when available | Local in-app browser detected all 7 tools; ordinary UI smoke passed |
| Repository license must be visible in GitHub About | Root `LICENSE` file is MIT; README and submission packet state MIT | GitHub repository page shows `MIT license` |
| First 30 seconds of demo needs immediate visible value | `Load Sample Room` creates structured sample data and a pending draft without API keys or uploads | Local API stress and browser smoke passed |
| Overclaim risk around 8 social scenarios | README states supported room branches and clearly says advanced formula items still require manual review | `npm run audit:tasks` reports checks ready 8/8 with known advanced-formula gaps preserved |
