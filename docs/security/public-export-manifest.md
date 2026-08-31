# Public Export Manifest

Evidence date: 2026-09-01

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
- `scripts/task-gap-audit.mjs`
- `scripts/stress-menu-parser.mjs`
- `docs/submission/WEBMCP_SUBMISSION.md`
- `docs/security/`
- `docs/ai-generated/2026Q3/shared_room_mermaid_module_design_20260831.md`
- `docs/ai-generated/2026Q3/shared_room_task_gap_decoupling_audit_20260831.md`
- `docs/decisions/2026Q2/DEVELOPMENT_LOG.md`

## Excluded From Public Export

- `.env`
- `.env.*`
- `node_modules/`
- `logs/`
- `data/`
- `dist/`
- `archive/`
- `docs/ai-generated/**/*.json`
- local screenshots, raw receipt images, raw OCR samples, private room data, provider keys, Google credentials, cookies, and payment data

## Export Decision

Public export is allowed only after the current-file secret scan, Git-history secret scan, dependency audit, and WebMCP submission smoke checks pass.
