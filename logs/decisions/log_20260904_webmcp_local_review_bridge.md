# WebMCP Local Review Bridge

Completion timestamp: 2026-09-04 00:48 Asia/Taipei

## Scope

Owner project: `<project-root>`

Changed the evidence review path so local OCR no longer acts as a silent finalizer. Added a local bridge script for the Zeabur demo boundary: local machine reads private image evidence, performs local OCR and optional local vision review, then writes only a host-reviewed proposal to the cloud room.

## Direct Cause

`parseMenuImages()` previously allowed deterministic OCR parsing to return early when enough items were found and no high issue was detected. That made OCR text behave like a final parse layer instead of candidate evidence.

## Root Cause

The project had two different integration boundaries mixed together:

- Server-side provider adapters for deployments that can reach Gemini, OpenAI, or another vision endpoint.
- WebMCP/Codex local collaboration, where the user's machine is authorized to read local evidence and separately authorized to write a draft proposal into the cloud room.

Zeabur cannot reach the user's local vision model, so the Zeabur demo needs a local bridge instead of relying only on server-side provider adapters.

## Changes

- Added `local_vision` provider configuration to `server.js`.
- Changed provider order default to `local_vision,gemini,openai`.
- Changed configured provider detection so `local_vision` activates only with `LOCAL_VISION_BASE_URL` and `LOCAL_VISION_MODEL`.
- Removed local OCR early return when provider candidates exist.
- Forced pure local OCR fallback into `review_required` with a host-review warning.
- Added `/healthz` local vision fields without exposing secrets.
- Added `scripts/webmcp-local-review-bridge.mjs`.
- Added `npm run bridge:local-review`.

## Validation

- `npm run check`: passed.
- `node --check scripts/webmcp-local-review-bridge.mjs`: passed.
- `npm run verify:adaptive-contracts`: passed.
- Healthz without `LOCAL_VISION_*`: passed, `localVisionConfigured:false`, `activeProviderCandidates:[]`.
- Local OCR fallback smoke: passed, fallback produces `review_required`.
- Mock `local_vision` provider routing smoke: passed, `providerUsed:"local_vision"`.
- Bridge dry-run with no local vision: passed, no cloud write, OCR evidence report created.
- Bridge dry-run with mock local vision: passed, produced `sourceMode:"local_ocr_plus_local_vision"` and structured proposal items.

## Next Resume Point

To run a real Zeabur host proposal, the operator must provide the target room's owner `participantId` and a reachable local vision endpoint/model. The bridge command should be run without `--dry-run` only after that owner identity is confirmed.

## Closeout Update

Completion timestamp: 2026-09-04 01:14 Asia/Taipei

Additional release-prep fixes completed after parallel review:

- Added room-level evidence review provenance so `local_ocr_fallback` cannot be lost by later `parseQuality` recalculation.
- Added server-side proposal validation: OCR-only bridge payloads are rejected for `semantic_repair_draft` and `evidence_review`; `semantic_repair_draft` requires `sourceMode=local_ocr_plus_local_vision`, `localVisionConfigured=true`, and non-empty `structuredItems`.
- Made configured `local_vision` terminal by default. Remote Gemini/OpenAI fallback now requires `ALLOW_REMOTE_VISION_FALLBACK=true`.
- Changed `/healthz` to expose only `localVisionConfigured` and `allowRemoteVisionFallback`; local vision endpoint origin and model name are no longer returned.
- Changed the bridge CLI to default to dry-run, require `--write-cloud-proposal` for writes, require an explicit base URL for writes, and refuse private OCR reports outside tmp paths.
- Updated README, submission runbook, architecture Mermaid diagrams, security evidence, validation evidence, `env.sample`, and public export manifest to match the local OCR plus local/visual LLM review loop.
- Fixed the image-matrix runner to validate full extracted rows instead of member-selectable candidates only.

Validation evidence:

- `npm run check`: passed.
- `node --check scripts/webmcp-local-review-bridge.mjs`: passed.
- `node --check scripts/stress-member-release.mjs`: passed.
- `node --check scripts/stress-image-matrix.mjs`: passed.
- `npm run verify:adaptive-contracts`: passed.
- `git diff --check`: passed.
- `npm run audit:tasks`: passed with code release blocking gaps `0`; one submission-only gap remains for the final YouTube demo URL.
- Local `/healthz` redaction check against `http://127.0.0.1:3211`: passed.
- Local contract stress against `http://127.0.0.1:3212`: passed `60/60`.
- HITL Member-Visibility Release stress against `http://127.0.0.1:3212`: passed `12/12`.
- OCR-only direct cloud proposal negative test against `http://127.0.0.1:3212`: passed with HTTP `422`.
- Bridge legal write with mock local vision: passed with `structuredItemCount=2` and one pending host proposal.
- Bridge default dry-run: passed with no proposal write.
- Bridge missing explicit write base URL: failed closed as expected.
- Bridge unsafe output directory: failed closed as expected.
- Image-oracle benchmark against `http://127.0.0.1:3214`: passed `115/115`.
- `release-boundary-safety-gate`: PASS, blocking `0`.
- `ai-security-rules rules-check`: pass, blocking `0`, P0 `0`, P1 `0`, P2 `0`.

Remaining non-code submission item:

- Final YouTube demo URL must still be inserted after the accepted recording is uploaded.

## Final Push-Prep Recheck

Completion timestamp: 2026-09-04 01:24 Asia/Taipei

Final recheck after README, submission, Mermaid, and runner wording cleanup:

- `git fetch origin`: passed. Local `main` and `origin/main` have no commit divergence; current work is uncommitted changes on top of the latest fetched GitHub HEAD.
- Stale wording scan: passed. Removed stale demo-path claims around manual evidence entry, copied evidence text, direct browser action wording, old Zeabur PASS wording, desktop media paths, and prior attachment names.
- Mermaid duplicate-label scan: passed for `README.md` and `docs/architecture/ADAPTIVE_CONTRACT_MCP.md`.
- `npm run check`: passed.
- `node --check scripts/webmcp-local-review-bridge.mjs`: passed.
- `node --check scripts/stress-image-matrix.mjs`: passed.
- `node --check scripts/stress-member-release.mjs`: passed.
- `npm run verify:adaptive-contracts`: passed.
- `npm run audit:tasks`: passed with code release blocking gaps `0`; one submission-only gap remains for the final YouTube demo URL.
- `git diff --check`: passed.
- `release-boundary-safety-gate`: PASS, blocking `0`; final report written under `/private/tmp/webmcp-release-boundary-scan-20260904-final/`.
- `ai-security-rules rules-check`: pass, blocking `0`, P0 `0`, P1 `0`, P2 `0`; final reports written under `/private/tmp/webmcp-ai-security-rules-check-20260904-final/`.
- `npm audit --audit-level=high`: passed, `0 vulnerabilities`.
- `npm audit --audit-level=moderate --omit=dev`: passed, `0 vulnerabilities`.

Remaining before public submission:

- Insert the final uploaded YouTube demo URL.

## 2026-09-04 02:55 Current Resume Pointer

Current state:

- Guided Codex OCR+LLM review flow is locally implemented and precommit-validated.
- Local accept smoke passed with 18 structured rows applied after host approval.
- Local pending smoke passed with the same 18 structured rows left for the host to approve during recording.
- The 115-case image-matrix check was not rerun in this checkout because the external PNG artifact directory is absent; do not cite it as current evidence unless `IMAGE_MATRIX_ROOT` is restored and the runner is repeated.

Next action:

- Commit and push this guided OCR+LLM review flow, deploy it to Zeabur, then rerun live `/healthz`, hosted member-release smoke, and one pending guided Codex review room for recording.

## 2026-09-04 03:00 Recording UI Warning Cleanup

Current state:

- After the first Zeabur deploy, live HTML was updated, `/healthz` was healthy, and live member-release plus guided accept smoke passed.
- A right-panel recording room then exposed an old OCR-only warning string from backend room state. This was not a flow failure, but it was visible recording copy and too technical.

Fix:

- Changed new backend OCR-only warnings, multi-price notes, and task-conflict details to plain-language English.
- Added frontend compatibility mapping for old room data so previously created rooms also render the old warning as plain text.
- Kept the internal data keys stable; only visible copy and compatibility rendering changed.

Validation evidence:

- `npm run check`: passed.
- `node --check scripts/stress-menu-parser.mjs`: passed.
- `npm run verify:adaptive-contracts`: passed.
- `npm run audit:tasks`: passed with code release blocking gaps `0`; one submission-only gap remains for final YouTube URL.
- `git diff --check`: passed.
- Residual wording scan returned zero hits for old OCR parser, pre-push, host visual-review, mock local-vision, source-mode, OCR-count, local-model, parser-candidate, rule/audit-candidate, local machine path, and Codex attachment wording.
- `release-boundary-safety-gate`: PASS, blocking `0`; evidence `/private/tmp/webmcp-release-boundary-codex-ocr-llm-hotfix/release-boundary-report-2026-09-03T18-59-31-582Z.json`.
- `ai-security-rules deploy-gate`: pass, blocking `0`, P0 `0`, P1 `0`, P2 `0`; evidence `/private/tmp/webmcp-ai-security-deploy-gate-codex-ocr-llm-hotfix/local_security_design_gate_deploy_gate.md`.

Next action:

- Commit/push the warning cleanup, redeploy Zeabur, then create a fresh right-panel guided OCR+LLM pending room for recording.

## 2026-09-04 02:50 Guided Codex OCR+LLM Review Flow

Scope:

- Owner project: `<project-root>`
- Changed artifacts: `server.js`, `public/index.html`, `scripts/prepare-codex-ocr-llm-demo.mjs`, `scripts/webmcp-local-review-bridge.mjs`, `scripts/stress-member-release.mjs`, `scripts/stress-image-matrix.mjs`, `package.json`, README/submission/architecture/testing/security docs.

Direct cause:

- The prior bridge path proved that OCR-only output was blocked, but the recording path still did not provide a concrete guided Codex node that reads OCR plus the image, creates a structured visual-review draft, and leaves the final decision for the host.

Root cause:

- The architecture mixed three separate roles: local OCR, LLM visual review, and Zeabur room state. The code needed an explicit proposal mode for OCR plus LLM visual review so Codex/Gemini/local models can act as an authorized review node without pretending that Zeabur runs the local OCR/LLM engine.

DONE_CONFIRMED:

- Added a guided demo runner: `npm run demo:codex-ocr-llm`.
  - evidence: the runner generates a fictional English menu image when no image is supplied, runs local Tesseract OCR, creates a Zeabur/local room, uploads OCR evidence, creates one Codex visual-review draft, and leaves it pending unless `--accept-for-test` is passed.
- Changed backend proposal handling so a valid OCR+LLM visual-review draft can replace old OCR rows after host approval.
  - evidence: `local_ocr_plus_llm_visual_review` requires completed visual review metadata and structured items; OCR-only proposals are still rejected.
- Changed frontend proposal blocking so a valid visual-review draft is not blocked by stale OCR-only warnings.
  - evidence: the review card can remain pending for the host, and approval applies the structured draft instead of the original noisy OCR rows.
- Updated the visible UI mapping and public docs so demo wording uses plain-language review text instead of source/mode/model/debug terms.
  - evidence: tracked source/docs scan returned zero hits for old source, model, mock, harness, local machine path, and Codex attachment wording.
- Updated Mermaid/architecture docs with explicit nodes and permissions for local OCR, Codex/Gemini/local-model visual review, authorized local bridge, WebMCP page tools, Zeabur runtime, host, and members.

Validation evidence:

- `npm run check`: passed.
- `node --check scripts/prepare-codex-ocr-llm-demo.mjs`: passed.
- `node --check scripts/webmcp-local-review-bridge.mjs`: passed.
- `node --check scripts/stress-member-release.mjs`: passed.
- `node --check scripts/stress-image-matrix.mjs`: passed.
- `npm run verify:adaptive-contracts`: passed.
- `npm run audit:tasks`: passed with code release blocking gaps `0`; one submission-only gap remains for the final YouTube demo URL.
- `git diff --check`: passed.
- Guided local OCR+LLM accept smoke passed: `/private/tmp/webmcp-codex-ocr-llm-local-accept-final/codex-ocr-llm-demo-2026-09-03T18-44-39-400Z.json`. OCR produced 7 draft rows, Codex visual review prepared 18 structured rows, test-only host accept applied 18 rows, and member release stayed closed.
- Guided local OCR+LLM pending demo smoke passed: `/private/tmp/webmcp-codex-ocr-llm-local-pending-final-2/codex-ocr-llm-demo-2026-09-03T18-44-40-257Z.json`. Same evidence path remained pending for host approval.
- Local Member-Visibility Release smoke passed `4/4`: `/private/tmp/webmcp-codex-ocr-llm-member-release-final/member-release-stress-2026-09-03T18-46-59-817Z.md`.
- Local contract smoke passed `20/20`: `/private/tmp/webmcp-codex-ocr-llm-contracts-final/local-contract-stress-2026-09-03T18-47-01-301Z.md`.
- `release-boundary-safety-gate`: PASS, blocking `0`; evidence `/private/tmp/webmcp-release-boundary-codex-ocr-llm-final/release-boundary-report-2026-09-03T18-46-14-169Z.json`.
- `ai-security-rules rules-check`: pass, blocking `0`, P0 `0`, P1 `0`, P2 `0`; evidence `/private/tmp/webmcp-ai-security-rules-check-codex-ocr-llm-final/local_security_design_gate_rules_check.md`.
- `ai-security-rules deploy-gate`: pass, blocking `0`, P0 `0`, P1 `0`, P2 `0`; evidence `/private/tmp/webmcp-ai-security-deploy-gate-codex-ocr-llm-final/local_security_design_gate_deploy_gate.md`.
- `npm audit --audit-level=high`: passed, `0 vulnerabilities`.
- `npm audit --audit-level=moderate --omit=dev`: passed, `0 vulnerabilities`.

NOT_RERUN:

- The 115-case image-matrix runner was not rerun in the current checkout because the external PNG artifact directory `fixtures/image-matrix/generated` is absent. The runner failed closed with `ENOENT` and must be repeated with `IMAGE_MATRIX_ROOT` restored before it can be cited as current evidence.

Next resume point:

- Commit and push the guided OCR+LLM review flow, deploy the resulting commit to Zeabur, then rerun live `/healthz`, hosted member-release smoke, and one pending guided Codex review room for recording.

## 2026-09-04 01:57 Plain-Language OCR UI Closeout Governance

Scope:

- Owner project: `<project-root>`
- Changed artifacts: `public/index.html`, `server.js`, `scripts/webmcp-local-review-bridge.mjs`, `logs/decisions/log_20260904_webmcp_local_review_bridge.md`
- Latest validation evidence:
  - `npm run check`: passed.
  - `node --check scripts/webmcp-local-review-bridge.mjs`: passed.
  - `git diff --check`: passed.
  - Local browser UI wording smoke against `http://127.0.0.1:3214/?room=918b8ba3&_t=plain-language-ui`: passed. The rendered page no longer showed old source, OCR-count, model, candidate, schema, number-type, audit, review-gate, image-zone, or detected-type labels.
  - Local Member-Visibility Release smoke: passed `4/4`; evidence `/private/tmp/webmcp-ui-language-member-release-final/member-release-stress-2026-09-03T17-56-56-850Z.md`.
  - Frontend local HTTP smoke: passed; evidence `/private/tmp/webmcp-frontend-ui-smoke-20260904-plain-ui/local_plain_ui.md`.
  - `release-boundary-safety-gate`: PASS, blocking `0`; evidence `/private/tmp/webmcp-release-boundary-scan-20260904-plain-ui/release-boundary-report-2026-09-03T17-57-06-319Z.json`.
  - `ai-security-rules deploy-gate`: pass, blocking `0`, P0 `0`, P1 `0`, P2 `0`; evidence `/private/tmp/webmcp-ai-security-deploy-gate-20260904-plain-ui/local_security_design_gate_deploy_gate.md`.

DONE_CONFIRMED:

- Replaced user-visible OCR/review engineering terms with plain-language UI text while preserving API and stored data keys.
  - evidence: `public/index.html` now applies a visible-term mapping before rendering old proposal summaries, rationale text, parse-quality blockers, item review gates, and structural review blocks.
- Fixed the contradictory status where a room could display `List looks ready` while still carrying review blockers.
  - evidence: `roomNeedsVisibleHostCheck()` now forces the visible status to human-review wording whenever pending item checks, pending rule checks, parse blockers, or anti-pollution blocks exist.
- Removed debug details from item review panels.
  - evidence: item review rendering no longer prints bounding zone, detected type, severity labels, or field lists; it shows only host-facing reasons and evidence clues.
- Changed new bridge proposal copy so future cloud proposals do not store visible source, OCR-character-count, or local-model debug labels in summary/rationale.
  - evidence: `scripts/webmcp-local-review-bridge.mjs` summary/rationale wording now uses photo review and host comparison language only.
- Changed server-side blocker messages to plain-language text before they reach the UI.
  - evidence: member-open blockers now reference read items, fee/rule notes, evidence clues, and host edit/removal decisions without parser/rule-audit wording.

DO_NOW:

- Commit and push the plain-language UI changes, then redeploy Zeabur and rerun live `/healthz` plus hosted UI smoke.
  - action: next stage in the same turn.

PRIORITY_INDEX:

- Final YouTube demo URL still must be inserted after the accepted recording is uploaded.
  - next action: update README/submission docs with the final URL.
  - risk if ignored: Devpost submission remains incomplete even if code and Zeabur are ready.

WATCH_LATER:

- The WebMCP tool input schema still exposes stable enum values such as `semantic_repair_draft`.
  - trigger to revisit: only if the visible Codex WebMCP panel starts showing raw enum values to reviewers instead of tool titles/descriptions. The runtime contract should not be renamed for copy-only cleanup.

INTENTIONALLY_NOT_DO:

- Did not rename internal data keys such as `parserCandidates`, `calculationRules`, `sourceMode`, or WebMCP tool names.
  - reason: those are API/storage contracts, not user-facing copy. Renaming them would expand release risk without improving the visible demo surface.

Next resume point:

- After push, run `zeabur deploy --service-id 6a96fb0bd72bd6309d74fb9b --environment-id 69d93c5c474db8a99d6de959 --json --interactive=false`, then verify the live home page and current test room no longer render engineering copy.

## 2026-09-04 02:11 Final Plain-Language UI Deployment

Scope:

- Owner project: `<project-root>`
- Runtime commit pushed to GitHub: `782653f`
- Zeabur service: `shared-room-mcp-next`
- Zeabur service ID: `6a96fb0bd72bd6309d74fb9b`
- Zeabur production environment ID: `69d93c5c474db8a99d6de959`

DONE_CONFIRMED:

- Plain-language OCR/review UI deployed to Zeabur.
  - evidence: live HTML fetched with cache buster `_plain_ui=782653f` contained the new subtitle, `Calculate Here`, short evidence-photo hint, WebMCP plain descriptions, and count helpers.
- Legacy visible engineering wording was removed from the shipped HTML source.
  - evidence: live HTML scan returned zero hits for old item-count, source, OCR-count, draft, math, thumbnail, number-type, audit, review-gate, image-zone, and detected-type labels.
- Live deployment health is still aligned with the local-review bridge boundary.
  - evidence: `/healthz` returned `providerOrder=["local_vision","gemini","openai"]`, `localVisionConfigured=false`, `allowRemoteVisionFallback=false`, `roomPersistenceEnabled=true`, and `roomStorePath=/data/rooms.json`.
- Low-rate Zeabur room flow still works after the UI wording changes.
  - evidence: `npm run stress:member-release -- --base-url https://shared-room-mcp-next.zeabur.app --rounds 1 --fail-fast --output-dir /private/tmp/webmcp-live-plain-ui-member-release-final` passed `4/4`.
- Pending host-review room blocker copy is plain-language.
  - evidence: live sample room `bc682343` had `itemsOpenForMembers=false` and blocker details `1 photo row needs host review before members can use the list.` and `1 fee, total, discount, or threshold note needs host review.`; JSON scan returned forbidden hits `0`.

WATCH_LATER:

- In-app browser hidden-tab navigation intermittently timed out or showed stale empty-room state during Zeabur reloads.
  - trigger to revisit: if the user-visible right panel shows the same stale state after a manual refresh. HTTP `/api/rooms`, live HTML, and Socket.IO stress were used as the authoritative gates for this closeout.

PRIORITY_INDEX:

- Final YouTube demo URL still must be inserted after upload.
  - next action: update README/submission docs with the final URL.
  - risk if ignored: code and deployment are ready, but Devpost submission remains incomplete.

INTENTIONALLY_NOT_DO:

- Did not rename WebMCP tool names or JSON enum values.
  - reason: those are compatibility contracts. Visible titles, descriptions, proposal summaries, blocker messages, and review UI text were changed instead.

Next resume point:

- Open `https://shared-room-mcp-next.zeabur.app/` for the final demo room, then insert the YouTube demo URL after upload.
- Deploy the committed changes to Zeabur and recheck the live `/healthz` plus hosted room flow. The repository is push-prepared, but the current Zeabur production URL must not be described as updated until that deployment check passes.

## 2026-09-04 03:31 Route Lock, Draft-Only Evidence, And Owner Bootstrap

Scope:

- Owner project: `<project-root>`
- Changed artifacts: `server.js`, `public/index.html`, `scripts/prepare-codex-ocr-llm-demo.mjs`

Direct cause:

- The recording room could still show OCR parser candidates as full member rows before a Codex/Gemini/local-model visual review draft was approved.
- The prepared recording URL did not rejoin the browser as the original host, so the right-side Approve/Reject buttons could appear locked even though a host draft existed.
- Visible OCR review panels exposed too much engineering language and repeated warning copy.

Root cause:

- Evidence upload, local OCR parsing, LLM visual draft creation, host approval, and member-visible list release were not fully separated as distinct route states.
- The UI had mapping for legacy terms, but some review warnings and item audit panels still rendered internal parser detail instead of human-facing review status.

DONE_CONFIRMED:

- Added a draft-only evidence route for photo uploads used by the guided OCR+LLM flow. It stores the evidence image and OCR metrics, locks the selected task route, and leaves `room.items` empty until a host approves a valid structured visual-review proposal.
- Added short-lived owner bootstrap support for demo URLs. The server stores only a hash, expires the token after 30 minutes, and only registers it for the current owner participant.
- Updated the demo runner so generated room URLs include `_owner_bootstrap`, and the upload registers the matching owner participant id.
- Updated the browser upload path to stage evidence as a host-reviewed draft instead of directly opening OCR-only rows to members.
- Reduced item review noise: normal accepted items no longer show a large yellow audit panel; risk copy is shown only when the row needs attention.
- Updated visible labels from engineering terms to plain language, including cost type, selectable item, photo review draft, and draft-ready status.

Validation evidence:

- `npm run check`: passed.
- Inline browser script parse: passed, one script.
- `node --check scripts/prepare-codex-ocr-llm-demo.mjs`: passed.
- `npm run verify:adaptive-contracts`: passed with contracts `13`, prompt nodes `17`, guardrails `19`, scenarios `12`.
- Guided pending demo passed locally against `http://127.0.0.1:4187`: uploaded item count `0`, structured draft count `18`, proposal status `pending_host_confirmation`.
- Guided accept demo passed locally against `http://127.0.0.1:4187`: uploaded item count `0`, accepted item count `18`.
- Owner bootstrap socket check passed: token URL rejoined as the original host and kept `items=0`, `proposals=1`.
- Browser UI smoke passed: the pending demo room showed `Draft waiting`, `Draft ready on the right`, no left-side member items, and enabled `Approve Draft` / `Reject Draft`.
- Local contract smoke passed `20/20`; evidence `/private/tmp/webmcp-owner-bootstrap-regression/local-contract-stress-2026-09-03T19-28-00-475Z.md`.
- Local Member-Visibility Release smoke passed `4/4`; evidence `/private/tmp/webmcp-owner-bootstrap-regression/member-release-stress-2026-09-03T19-28-02-066Z.md`.
- `release-boundary-safety-gate`: PASS, blocking `0`; evidence `/private/tmp/webmcp-release-boundary-owner-bootstrap/release-boundary-report-2026-09-03T19-30-37-933Z.json`.
- `ai-security-rules deploy-gate`: pass, blocking `0`, P0 `0`, P1 `0`, P2 `0`; evidence `/private/tmp/webmcp-ai-security-deploy-gate-owner-bootstrap/local_security_design_gate_deploy_gate.md`.
- `npm audit --audit-level=high`: passed, `0 vulnerabilities`.
- `npm audit --audit-level=moderate --omit=dev`: passed, `0 vulnerabilities`.
- `git diff --check`: passed.

Next resume point:

- Commit and push these three runtime changes, deploy the pushed commit to Zeabur, then rerun live `/healthz`, live guided pending room, live guided accept smoke, and a hosted browser UI check before telling the user to record.

## Zeabur Post-Deploy Recheck

Completion timestamp: 2026-09-04 01:38 Asia/Taipei

Deployment and evidence recheck:

- Deployed local project to Zeabur service `shared-room-mcp-next` with explicit service ID `6a96fb0bd72bd6309d74fb9b` and production environment ID `69d93c5c474db8a99d6de959`.
- Updated non-secret runtime variable `AI_PROVIDER_ORDER=local_vision,gemini,openai`.
- Deployment `6a99af6bc3fffb61baebf183` reached `RUNNING`; previous deployment was removed.
- Live `/healthz` confirmed current code and env: `providerOrder=["local_vision","gemini","openai"]`, `localVisionConfigured=false`, `allowRemoteVisionFallback=false`, `roomStorePath=/data/rooms.json`, and no provider key flags.
- Live low-rate Member-Visibility Release smoke passed `4/4` against generated test rooms. Evidence: `/private/tmp/webmcp-live-postdeploy-member-release/member-release-stress-2026-09-03T17-35-53-670Z.md`.
- Live authorized local bridge proposal smoke passed. Evidence: `/private/tmp/webmcp-live-postdeploy-bridge/webmcp-local-review-bridge-2026-09-03T17-37-16-139Z.json`; generated room `3b62ab55`, proposal `proposal_d46949ef`, `structuredItemCount=2`, status `pending_host_confirmation`.

Documentation correction:

- README and validation evidence now separate `current_live_smoke`, `current_local_regression`, `historical_local_regression`, and `deterministic_oracle`.
- Large repeat counts such as `400/400`, `240/240`, `200/200`, and `120/120` are labeled historical/local regression evidence, not live production capacity claims.

Remaining before public submission:

- Insert the final uploaded YouTube demo URL.
