# Public Export Manifest

Evidence date: 2026-09-03

This repository is intended to be public for the WebMCP Challenge. The public export includes only source code, public documentation, configuration examples, and non-secret security evidence.

## Allowed Public Paths

- `LICENSE`
- `README.md`
- `SECURITY.md`
- `THREAT_MODEL.md`
- `env.sample`
- `.gitignore`
- `.zeaburignore`
- `package.json`
- `package-lock.json`
- `server.js`
- `public/index.html`
- `config/adaptive-prompt-library.json`
- `config/enterprise-submit-gate.json`
- `config/evidence-review-contract.json`
- `config/guardrail-registry.json`
- `config/image-fixture-manifest.schema.json`
- `config/scenario-contracts.json`
- `config/service-blueprint-contract.json`
- `fixtures/adaptive-parser-matrix.json`
- `fixtures/image-fixture-manifest.json`
- `lib/adaptive/pipeline.mjs`
- `scripts/build-image-fixture-manifest.mjs`
- `scripts/regression-adaptive-parser.mjs`
- `scripts/task-gap-audit.mjs`
- `scripts/stress-image-matrix.mjs`
- `scripts/stress-menu-parser.mjs`
- `scripts/stress-local-contracts.mjs`
- `scripts/stress-open-gate.mjs`
- `scripts/verify-adaptive-contracts.mjs`
- `docs/submission/WEBMCP_SUBMISSION.md`
- `docs/security/`
- `docs/testing/VALIDATION_EVIDENCE.md`

## Excluded From Public Export

- `.env`
- `.env.*`
- `node_modules/`
- `logs/`
- `data/`
- `dist/`
- `coverage/`
- `quarantine/`
- `archive/`
- `docs/ai-generated/`
- `docs/decisions/`
- `docs/ai-generated/**/*.json`
- raw development logs, historical AI-generated design drafts, and superseded execution transcripts
- the full 115-image PNG matrix, local screenshots, raw receipt images, raw OCR samples, private room data, provider keys, Google credentials, cookies, and payment data
- image-matrix failure quarantine outputs and production `image-only` OCR run outputs until reviewed and summarized

## Export Decision

Public export is allowed only after the current-file secret scan, Git-history secret scan, dependency audit, WebMCP submission smoke checks, and deterministic image-oracle manifest checks pass. The 115-image benchmark is a checksum-backed integration oracle, not a raw OCR accuracy claim.
