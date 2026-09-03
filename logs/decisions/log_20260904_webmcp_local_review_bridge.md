# WebMCP Local Review Bridge

Completion timestamp: 2026-09-04 00:48 Asia/Taipei

## Scope

Owner project: `/Users/sunjiarong/Developer/webmcp`

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
- Fixed the image-matrix runner to validate full parser candidates instead of member-selectable candidates only.

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
- Deploy the committed changes to Zeabur and recheck the live `/healthz` plus hosted room flow. The repository is push-prepared, but the current Zeabur production URL must not be described as updated until that deployment check passes.

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
