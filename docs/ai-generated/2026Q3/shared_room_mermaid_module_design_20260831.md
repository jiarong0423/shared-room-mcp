# Shared Room Mermaid Module Design

Generated at: 2026-09-01

Scope: open-source WebMCP tool-layer template for pre-payment social coordination.

WebMCP tool surface version: `group-room-webmcp-tools.v2`.

## Full Room Flow

```mermaid
sequenceDiagram
  autonumber
  actor Host as Room Host
  actor Member as Room Member
  participant Page as Shared Room Page
  participant Agent as WebMCP Agent
  participant Server as Server State
  participant Store as JSON Store

  Host->>Page: Create room and upload price evidence
  Page->>Server: Parse image or pasted OCR text
  Server-->>Page: Return item draft plus separated rules
  Server->>Store: Save room state with short write smoothing
  Agent->>Page: Inspect room through read-only WebMCP tools
  Agent->>Page: Create proposal-only draft
  Host->>Page: Edit parsed items or remove bad rows
  Page->>Server: Owner-only parsed item update
  Server->>Store: Save reviewed draft state
  Host->>Server: Open reviewed list to members
  Server-->>Page: Broadcast reviewed item state
  Member->>Page: Join room and choose own items
  Member->>Server: Confirm own cost
  Server->>Store: Save member confirmation
  Host->>Page: Review one visible draft card
  Host->>Server: Finalize room after human confirmations
  Server-->>Page: Broadcast local settlement summary
  Server->>Store: Save final room summary
  Host->>Page: Export HTML or PDF review record
  Page-->>Host: Download local review file

  Note over Agent,Server: Agent cannot edit items, confirm claims, settle, pay, book, or submit external forms.
  Note over Page: Exports are local records and do not submit forms or change external systems.
  Note over Store: On a hosted demo, use ROOM_STORE_PATH=/data/rooms.json with a mounted volume.
```

## Permission Matrix

| role | inspect room | create proposal | edit parsed items | edit own claims | review proposal | settle |
|---|---:|---:|---:|---:|---:|---:|
| Anonymous viewer | yes | no | no | no | no | no |
| WebMCP agent | yes | proposal only | no | no | no | no |
| Room member | yes | no | no | own claims only | no | no |
| Room host | yes | yes | before member confirmation | own claims only | same-card human review | yes |
| Server | validates | stores limited drafts | checks room owner | checks each member only confirms themself | records review result | saves local room summary |

## Review Flow

```mermaid
flowchart TD
  A[AI drafts only] --> B[Host reviews parsed rows]
  B --> C[Host opens reviewed list]
  C --> D[Members claim and confirm their own costs]
  D --> E[Host finalizes local room summary]
  E --> F[Human exports review record]
  F --> DONE[Done without payment or external submission]

  A -. blocked .-> X1[AI cannot edit rows]
  A -. blocked .-> X2[AI cannot open group access]
  C -. locked .-> X3[Parsed rows cannot be edited after opening]
  D -. blocked .-> X4[No one confirms for another member]
  E -. blocked .-> X5[No payment, booking, or card handling]
  F -. blocked .-> X6[Exports do not submit forms or change external systems]

  E --> SAVE[Save room state to JSON store]
  F --> HTML[Download HTML]
  F --> PDF[Download PDF]
  F --> PRINT[Print summary]
  SAVE --> VOL[Mounted volume keeps demo rooms after restart]

  OPTIONAL[Optional deployer integrations] -. draft only .-> A
```

## Room Transition Isolation

```mermaid
flowchart TD
  A[Current room A] --> LOCK[Lock room transition]
  LOCK --> CLEAR[Clear room-only temporary UI state]
  CLEAR --> SET[Set room B identity and URL]
  SET --> RENDER[Render room B and derive controls from B]
  RENDER --> UNLOCK[Unlock room actions]

  PREF[Language and display name] -. preserved .-> RENDER
  FETCH[Fetch or Socket.IO callback] --> MATCH{Target room still matches B?}
  MATCH -->|yes| APPLY[Render response]
  MATCH -->|no| DROP[Ignore stale response]

  LOCK -. blocks .-> UPLOAD[Overlapping upload]
  LOCK -. blocks .-> NEWROOM[Overlapping room switch]
  LOCK -. blocks .-> WRITE[Room write actions]
```

Room changes use one transition boundary for initial load, `New Room`, missing-room recovery, and same-room reset. Room-only upload previews, draft-review staging, source-image transforms, copied OCR text, and summary-tab state are cleared. User language and display-name preferences remain local to the browser.

## Fixed Review Steps

The implementation treats each handoff as a one-way step. A later step may stop and ask a human to review, but it may not silently rewrite an earlier step.

| importance | step | allowed actor | next state | rollback rule |
|---|---|---|---|---|
| required | AI/OCR evidence to draft items | server parser, proposal-only agent | host review | reload or reset room, not agent mutation |
| required | Host-reviewed items to group access | room host only | members may claim | parsed rows lock after opening |
| required | Member claims to confirmation | each member only | confirmed personal cost | member can unconfirm and edit own claim before settlement |
| required | Confirmations to final summary | room host only | settled room | no external payment or booking action |
| optional | External adapters to proposal | deployment owner adapter | pending host review | never applied silently |

## Six Safe Workflow Steps

```mermaid
flowchart LR
  G1[Choose the room type] --> G2[Read price evidence]
  G2 --> G3[Calculate locally]
  G3 --> G4[Repair unclear fields]
  G4 --> G5[Check confirmations]
  G5 --> G6[Keep AI in draft mode]

  G1 -. no silent room-type switch .-> X1[Manual review]
  G2 -. no money calculation .-> X2[Local calculation rules]
  G3 -. no external calculator .-> X3[Local totals]
  G4 -. review draft only .-> X4[Human review]
  G5 -. no confirming for others .-> X5[Participant confirmation]
  G6 -. read or draft only .-> X6[Host confirmation]
```

## Adaptive OCR And LLM Review Loop

This loop is the adaptive parsing layer for messy menus, ticket tables, venue rates, rentals, activity signups, and screenshots. WebMCP stays as the room-state and draft-control interface. It does not become the final parser, calculator, claimant, or settlement authority.

```mermaid
flowchart TD
  A[User evidence image or pasted OCR text] --> B[Image preprocessor<br/>resize, contrast, flatten, OCR target copy]
  B --> C[Feature parser<br/>language, grid density, price anchors, ambiguity tokens]
  C --> D[Router and prompt builder]
  R[Rule registry<br/>age not price<br/>itinerary not price<br/>size variants<br/>deposit/rate units] --> D
  D --> E[LLM OCR cleanup and task-specific extraction]
  E --> F[Deterministic parser<br/>scenario contract to draft items]
  F --> G[Post-audit quality gate<br/>confidence, low prices, duplicates, task conflict]
  G -->|pass or reviewable| H[Room draft state]
  G -->|blocked| X[Human review or clearer evidence required]
  H --> I[WebMCP inspect and suggest]
  I --> J[Host proposal card]
  J --> K[Human edits or approval]
  K --> L[Guardrail memory candidate]
  L --> R
  K --> M[Open members / confirm own cost / owner finalizes]

  I -. read only .-> H
  J -. draft only .-> H
  M -. human final action only .-> DONE[Export PDF / HTML]
```

### Scenario Contracts

| contract | examples | adaptive checks |
|---|---|---|
| `menu_size_option_matrix` | cafe menu, snacks, drinks | size labels become option groups; calories, ml, sugar, add-ons do not become base prices |
| `ticket_activity_matrix` | travel tickets, activity signup, admission table | itinerary numbers and age ranges stay as section/condition text; ticket rows use explicit price anchors |
| `venue_rate_matrix` | KTV, sports court, room rental | hours, people, sessions, and days are units; room or venue fees become claimable rows |
| `rental_deposit_key_value` | equipment rental, shared deposit | rent, deposit, cleaning fee, and damage fee remain distinct rows |
| `generic_price_evidence` | mixed screenshot or ad hoc split | uncertain rows are marked for human review instead of forced into a task module |

### Adaptive Refactor Files

| file | role |
|---|---|
| `config/scenario-contracts.json` | Declares supported scenario contracts, task type bindings, expected fields, guardrails, and prompt nodes. |
| `config/adaptive-prompt-library.json` | Stores reusable prompt nodes for OCR cleanup, ticket/activity extraction, menu size extraction, rate/deposit extraction, post-audit, WebMCP review, and host proposal boundaries. |
| `config/guardrail-registry.json` | Stores reusable known-error rules such as age numbers, itinerary numbers, capacity numbers, size variants, add-ons, and human final approval. |
| `fixtures/adaptive-parser-matrix.json` | Stores regression scenarios so new OCR failure modes can be added without changing test code. |

### Prompt Nodes

| node | responsibility | cannot do |
|---|---|---|
| Image preprocessor | prepare an OCR-friendly copy by resizing, flattening, and preserving text contrast | invent missing text or prices |
| OCR text cleanup | repair line breaks and align labels near prices | change a number without source evidence |
| Task-specific extraction | map rows into the selected scenario contract | switch the user-selected room type silently |
| Parser post-audit | flag low prices, duplicate labels, age/quantity/capacity confusion, and task conflicts | approve the draft |
| WebMCP inspect/suggest | read live room state, totals, warnings, confirmations, and next suggested action | edit items, claim for users, or settle |
| Host proposal gate | create one waiting-for-host draft card | open members, confirm costs, finalize, pay, book, or submit |

## Enterprise MCP Submit Gate

The enterprise submit gate is the future extension point for companies that want to submit MCP templates, adapters, prompt packs, or scenario contracts. The default is deny. A submitted package cannot be loaded, routed, executed, or promoted until the safety and contract gates pass.

```mermaid
flowchart TD
  SUBMIT[Enterprise MCP template or adapter submission] --> BOUNDARY[Package boundary check]
  BOUNDARY --> STATIC[Static security gate]
  STATIC --> SEMANTIC[Semantic safety gate]
  SEMANTIC --> CONTRACT[Contract schema validation]
  CONTRACT --> ROUTER[Industry routing]
  ROUTER --> MATRIX[Scenario regression matrix]
  MATRIX --> HUMAN[Human approval]
  HUMAN --> REGISTRY[Accepted MCP registry]

  STATIC -->|secret, hook, permission, path, or export failure| REJECT[Reject or remediation queue]
  SEMANTIC -->|prompt injection or hidden intent| REJECT
  CONTRACT -->|schema or policy failure| REJECT
  ROUTER -->|ambiguous or unsafe route| REJECT
  MATRIX -->|drift or forbidden action| REJECT
  HUMAN -->|not approved| REJECT

  REGISTRY --> RUNTIME[Runtime can load validated adapter]
```

### Enterprise Submit Architecture Table

| stage | owner | input | validation | blocks when | output evidence |
|---|---|---|---|---|---|
| `package_boundary` | submit gate | submitted bundle manifest, owner, version, entrypoints | manifest exists, export paths are bounded, no runtime output is included | missing manifest, unknown owner, unbounded export paths, runtime files in submission | package boundary report |
| `static_security_gate` | `ai-security-rules` | submitted repo or sanitized export bundle | read-only `scan`, `rules-check`, and `export-gate`; no `.env` reads, no command execution | critical/high finding, secret residue, over-privileged MCP config, install hook risk, unbounded filesystem/network scope | static scanner report path and remediation queue |
| `semantic_safety_gate` | `ai-security-rules` | prompts, tool descriptions, instructions, agent-readable files | read-only semantic review for prompt injection, hidden intent, jailbreak, and policy-bypass language | prompt injection, hidden intent, tool description policy bypass, indirect prompt injection risk | semantic safety report path |
| `contract_schema` | `shared-room-mcp` | scenario contracts, prompt library, guardrails, fixtures | JSON/schema consistency, known task types, known prompt nodes, known guardrails, human approval required | unknown task type, unknown guardrail, unknown prompt node, missing human approval, auto-finalize allowed | contract validation report |
| `industry_routing` | `shared-room-mcp` | validated contract plus feature profile | deterministic routing into menu, ticket/activity, venue, rental, group-buy, or generic evidence | no matching contract, high-risk ambiguity, category binding conflict | selected scenario contract and route rationale |
| `scenario_regression` | `shared-room-mcp` | fixture matrix and submitted adapter behavior | each line runs repeatedly; item count, prices, contract selection, forbidden numbers, and final-action boundaries must stay stable | price drift, item drift, contract drift, forbidden number leak, final action not human-controlled | repeat regression matrix |
| `human_review` | human operator | all gate evidence | operator reviews blocking reasons, residual warnings, and acceptance scope | missing evidence, unresolved high risk, operator rejection | signed approval decision |
| `accepted_registry` | registry maintainer | approved artifact only | versioned promotion, rollback identity, immutable evidence link | unapproved artifact, stale evidence, mismatched commit/package hash | accepted registry entry |

### Enterprise Governance Metadata

| group | required evidence |
|---|---|
| Provenance and integrity | SHA256, signing proof, source commit, builder identity |
| Permission and capability | declared tools, declared resources, network egress allowlist, filesystem scope |
| Data and privacy class | data classification, PII handling, retention policy |
| SBOM and dependency | CycloneDX SBOM, vulnerability report, package reputation evidence |
| Sandbox execution | isolation level, runtime network policy, runtime command policy |
| Human final-action | approval-required actions, final-action owner, human approval requirement |
| Lifecycle and revocation | revocation endpoint, sunset date, CVE contact, rollback identity |
| Review SLA and audit trail | review SLA, automated test evidence URL, audit log retention |

### Submit Gate Boundary Rules

| rule | reason |
|---|---|
| Safety scan runs before contract validation | A malicious MCP submission should not be parsed, routed, or loaded just because its business schema looks correct. |
| Runtime never loads unscanned MCP files | Hidden commands, overbroad filesystem scope, prompt-injection instructions, or install hooks must be blocked before runtime exposure. |
| Contract validation runs before industry routing | Routing only makes sense after fields, task types, prompt nodes, guardrails, and review policy are structurally valid. |
| Regression runs before human approval | Human review should inspect evidence, not guess whether the adapter drifts. |
| Human approval stays last | AI may recommend acceptance or rejection, but cannot promote a company template into the accepted registry. |

### Implementation Queue

| priority | item | status | next validation |
|---|---|---|---|
| P0 | File-based submit gate config | done in `config/enterprise-submit-gate.json` | `npm run verify:adaptive-contracts` |
| P0 | Contract/prompt/guardrail schema validation | done in `scripts/verify-adaptive-contracts.mjs` | JSON contract check |
| P0 | Multi-scenario repeat regression | done in `scripts/regression-adaptive-parser.mjs --repeat 5` | five-run stability matrix |
| P0 | AI review UI blocking reasons | done in `public/index.html` | frontend parse check plus manual smoke |
| P1 | Split security gate into static and semantic phases | done in `config/enterprise-submit-gate.json` | `npm run verify:adaptive-contracts` |
| P1 | Connect `ai-security-rules` report path into submit evidence | planned | scanner output fixture and gate parser |
| P1 | Accepted registry package format | planned | registry entry schema and rollback identity |
| P1 | Third-party adapter sandbox policy | described in gate config | disallow command execution and broad filesystem/network before approval |
| P2 | Web UI for enterprise submission review | planned | operator review screen with evidence links |
| P2 | Guardrail promotion workflow | planned | candidate-to-rule human approval test |

## WebMCP Tool Surface

```mermaid
flowchart TD
  B[Browser page] --> MC[document.modelContext.registerTool]
  MC --> IR[inspect_room]
  MC --> RT[get_task_router]
  MC --> GA[get_claim_audit]
  MC --> GF[get_formula_contract]
  MC --> GT[get_trust_layer_contract]
  MC --> SN[suggest_next_actions]
  MC --> CP[create_action_proposal]

  IR --> READ[Read current structured state]
  RT --> READ
  GA --> READ
  GF --> READ
  GT --> READ
  SN --> READ

  CP --> DRAFT[Create pending_host_confirmation JSON]
  DRAFT --> DEDUPE[One pending card per draft type]
  DRAFT --> HOST[Host Draft Review UI]
  DEDUPE --> HOST
  HOST --> ACCEPT[accepted_by_host marker]
  HOST --> REJECT[rejected_by_host marker]

  ACCEPT -. does not apply orders .-> SAFE[Final state unchanged]
  ACCEPT -. does not calculate money .-> SAFE
  ACCEPT -. does not submit booking or payment .-> SAFE
```

## Room Type And Calculation Matrix

```mermaid
flowchart LR
  subgraph TaskModules[Task modules]
    T1[group_buy]
    T2[drink_order]
    T3[restaurant_split]
    T4[ktv_room]
    T5[sports_venue]
    T6[ticket_activity]
    T7[rental_share]
    T8[generic_split]
  end

  subgraph FormulaModules[Local calculation modules]
    F1[sameItemMerge]
    F2[participantSubtotal]
    F3[grandTotal]
    F4[averageSplit]
    F5[thresholdRemaining<br/>manual input]
    F6[optionDelta]
    F7[sharedFeeSplit<br/>manual input]
    F8[depositGate<br/>manual input]
    F9[tierDiscount<br/>manual input]
    F10[extraPersonalClaim]
  end

  T1 --> F1
  T1 --> F2
  T1 --> F3
  T1 --> F5
  T1 --> F10
  T1 -. needs review .-> F9
  T2 --> F2
  T2 --> F3
  T2 --> F5
  T2 --> F6
  T2 --> F10
  T3 --> F2
  T3 --> F3
  T3 --> F4
  T3 --> F10
  T4 --> F2
  T4 --> F3
  T4 --> F10
  T4 -. needs review .-> F7
  T5 --> F2
  T5 --> F3
  T5 --> F10
  T5 -. needs review .-> F7
  T6 --> F2
  T6 --> F3
  T6 --> F10
  T6 -. needs review .-> F9
  T7 --> F2
  T7 --> F3
  T7 --> F10
  T7 -. needs review .-> F8
  T8 --> F2
  T8 --> F3
  T8 --> F4
  T8 --> F10
```

## State Machine

```mermaid
stateDiagram-v2
  [*] --> RoomCreated
  RoomCreated --> TaskSelected
  TaskSelected --> EvidenceLoaded
  EvidenceLoaded --> LocalParser
  LocalParser --> QualityGate
  QualityGate --> FormulaReady: pass
  QualityGate --> AiRepairAllowed: insufficient candidates or conflict
  AiRepairAllowed --> HumanReview: schema repaired
  AiRepairAllowed --> HumanReview: repair failed but candidates exist
  HumanReview --> FormulaReady: human accepts structure
  FormulaReady --> ClaimAudit
  ClaimAudit --> SettlementReady: all confirmations complete
  ClaimAudit --> HumanReview: unconfirmed claim or suspicious field

  ClaimAudit --> AgentProposalCreated: right-side agent calls create_action_proposal
  AgentProposalCreated --> HostDraftReview: pending_host_confirmation
  HostDraftReview --> ProposalAccepted: host accepts
  HostDraftReview --> ProposalRejected: host rejects
  ProposalAccepted --> ClaimAudit: final state unchanged
  ProposalRejected --> ClaimAudit: final state unchanged

  SettlementReady --> HumanSettlement: host finalizes manually
  HumanSettlement --> ReviewExport: human requests HTML or PDF
  ReviewExport --> [*]: local file only
```

## Open-Source Extension Boundary

```mermaid
flowchart TD
  CORE[Group room reference module] --> AD[Adapter interface]
  AD --> OCR[OCR / vision adapter]
  AD --> COMM[Community adapter]
  AD --> BOOK[Booking draft adapter]
  AD --> TRUST[Trust whitelist adapter]

  OCR --> PROP[Proposal-only JSON draft]
  COMM --> PROP
  BOOK --> PROP
  TRUST --> PROP

  PROP --> HUMAN[Human confirmation]
  HUMAN --> EXT[External system chosen by deployer]

  EXT -. not included in core .-> PAY[Payment]
  EXT -. not included in core .-> ORDER[Direct order]
  EXT -. not included in core .-> CARD[Credit-card handling]
```
