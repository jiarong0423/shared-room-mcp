# Package Reputation Evidence

Evidence date: 2026-09-04

## Scope

Repository: public WebMCP Challenge submission package.

## Required Checks

- `npm audit --audit-level=moderate --omit=dev`
- lockfile diff review for dependency changes
- no unreviewed package-runner commands in runtime scripts

## Current Result

Status: passed.

Dependency and lockfile evidence:

- `npm audit --audit-level=high`: passed on 2026-09-04 with `0` vulnerabilities.
- `npm audit --audit-level=moderate --omit=dev`: passed on 2026-09-04 with `0` vulnerabilities.
- Lockfile reviewed after the earlier `npm audit fix` and `sharp@0.35.4` update; this commercial UI/WebMCP pass did not add a runtime dependency.
- Runtime package scripts are explicit: `start`, `dev`, `check`, `audit:tasks`, `stress:menu`, `stress:contracts`, `stress:customer-publishing`, `stress:member-release` as a compatibility alias, and `demo:codex-ocr-llm`.

Runtime dependencies are intentionally small: Express, Socket.IO, Multer, Sharp, and Google GenAI as an extension-only repair adapter. The WebMCP Challenge demo does not require provider keys.
