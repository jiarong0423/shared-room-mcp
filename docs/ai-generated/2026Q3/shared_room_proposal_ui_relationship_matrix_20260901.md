# Shared Room Proposal UI Relationship Matrix

Generated at: 2026-09-01

Scope: duplicate host-review draft cards and confusing confirmation copy.

## Problem

The UI could show two pending draft cards for the same host decision. After the first approval click, extra helper copy also made the same decision look like a second dialog. This made the recording flow unclear.

## Decision

Keep one visible pending draft card per draft type. If the assistant creates a newer draft for the same topic, the newer pending draft replaces the older pending draft. The host reviews one visible card and uses the same card button for the human decision.

## Relationship Matrix

| area | changed | reason | expected result | evidence |
|---|---:|---|---|---|
| Backend draft storage | yes | same-type pending drafts must not stack | one pending proposal per draft type | `server.js`, local contract stress 60/60 |
| Frontend draft list | yes | older persisted rooms may already contain duplicates | visible list hides duplicate pending cards by type | browser screenshot `proposal-single-card-3177.png` |
| Frontend helper text | yes | extra copy looked like a second confirmation dialog | no separate hint line after the first click | stale-text scan returned no hits |
| WebMCP draft tool | contract preserved | agent may still create a bounded host draft | tool creates draft only; it cannot apply final state | security evidence and draft tool contract |
| Host review | behavior clarified | human remains the final reviewer | one card, same-card confirmation | README and submission packet updated |
| Member flow | unchanged | members should not be affected by host draft UI | member claim still opens only after host opens list | open-gate stress 20/20 |
| Settlement/payment/export | unchanged | draft review must not settle, pay, book, or submit | final state remains human-controlled | security export gate passed |
| Deployment state in this historical pass | not changed in this pass | local had to pass before deployment | deployment was still pending at the time of this matrix | superseded by the completed 2026-09-02 Git and retired-host release evidence in `docs/testing/VALIDATION_EVIDENCE.md` |

## Boundary Check

- The fix does not add payment, booking, ordering, card handling, Google Sheets writes, or external submission.
- The fix does not let the assistant edit items, open the member list, confirm for members, or settle the room.
- The fix only changes draft storage, draft rendering, test coverage, and documentation wording.

## Local Evidence

- `npm run check`: passed.
- `npm run audit:tasks`: passed with checks ready `8/8`.
- `npm run stress:contracts -- --base-url http://127.0.0.1:3178 --rounds 3 --output-dir logs/runtime`: passed `60/60`.
- `npm run stress:open-gate -- --base-url http://127.0.0.1:3178 --rounds 5 --output-dir logs/runtime`: passed `20/20`.
- `ai-security-rules export-gate`: passed with blocking `0`, P0 `0`, P1 `0`, P2 `0`.
- Impact matrix: `output/isolation/current_runs/shared_room_proposal_ui_dedupe_20260901_final_latest/impact_evidence_state_gate.md`.
