# Shared Room Mermaid Module Design

Generated at: 2026-09-01

Scope: open-source WebMCP tool-layer template for pre-payment social coordination.

WebMCP tool surface version: `group-room-webmcp-tools.v2`.

## Full Module Overview

```mermaid
sequenceDiagram
  autonumber
  actor Host as Room Host
  actor Member as Room Member
  participant Page as Shared Room Page
  participant Agent as WebMCP Agent
  participant Server as Server State

  Host->>Page: Create room and upload price evidence
  Page->>Server: Parse image or pasted OCR text
  Server-->>Page: Return item draft plus separated rules
  Agent->>Page: Inspect room through read-only WebMCP tools
  Agent->>Page: Create proposal-only draft
  Host->>Page: Edit parsed items or remove bad rows
  Page->>Server: Owner-only parsed item update
  Host->>Server: Open reviewed list to members
  Server-->>Page: Broadcast reviewed item state
  Member->>Page: Join room and choose own items
  Member->>Server: Confirm own cost
  Host->>Page: Two-step approve or reject agent draft
  Host->>Server: Finalize room after human confirmations
  Server-->>Page: Broadcast local settlement summary

  Note over Agent,Server: Agent cannot edit items, confirm claims, settle, pay, book, or submit external forms.
```

## Permission Matrix

| role | inspect room | create proposal | edit parsed items | edit own claims | review proposal | settle |
|---|---:|---:|---:|---:|---:|---:|
| Anonymous viewer | yes | no | no | no | no | no |
| WebMCP agent | yes | proposal only | no | no | no | no |
| Room member | yes | no | no | own claims only | no | no |
| Room host | yes | yes | before member confirmation | own claims only | two-step human review | yes |
| Server | validates | stores bounded drafts | enforces owner gate | enforces self-claim gate | records review marker | executes local settlement state |

## Priority Design

```mermaid
flowchart TD
  P0A[P0<br/>AI draft boundary] --> P0B[P0<br/>Host review boundary]
  P0B --> P0C[P0<br/>Group access boundary]
  P0C --> P0D[P0<br/>Member claim boundary]
  P0D --> P0E[P0<br/>Host final decision boundary]
  P0E --> DONE[Local room summary]

  P0A -. proposal JSON only .-> B1[No direct item edit]
  P0A -. proposal JSON only .-> B2[No group open]
  P0B -. owner only .-> B3[Fix/remove parsed rows before members claim]
  P0C -. lock after open .-> B4[No late parsed-item mutation]
  P0D -. self only .-> B5[No claimant impersonation]
  P0E -. local only .-> B6[No payment, booking, card, or external submit]

  P1[P1 optional adapters<br/>OCR / Sheets / booking draft / trust] -. draft or read-only .-> P0A
```

## Atomic One-Way Boundaries

The implementation treats each handoff as a one-way step. A later step may stop and ask a human to review, but it may not silently rewrite an earlier step.

| priority | one-way step | allowed actor | next state | rollback rule |
|---|---|---|---|---|
| P0 | AI/OCR evidence to draft items | server parser, proposal-only agent | host review | reload or reset room, not agent mutation |
| P0 | Host-reviewed items to group access | room host only | members may claim | parsed rows lock after opening |
| P0 | Member claims to confirmation | each member only | confirmed personal cost | member can unconfirm and edit own claim before settlement |
| P0 | Confirmations to final summary | room host only | settled room | no external payment or booking action |
| P1 | External adapters to proposal | deployer-owned adapter | pending host review | never applied silently |

## Six Safe Workflow Boundaries

```mermaid
flowchart LR
  G1[Gate 1<br/>Task Router] --> G2[Gate 2<br/>Evidence / OCR]
  G2 --> G3[Gate 3<br/>Formula Engine]
  G3 --> G4[Gate 4<br/>AI Repair Gate]
  G4 --> G5[Gate 5<br/>Claim Audit]
  G5 --> G6[Gate 6<br/>Agent Drift Guard]

  G1 -. no silent task override .-> X1[Manual review]
  G2 -. no money calculation .-> X2[Formula contract]
  G3 -. no external formula target .-> X3[Local formulaResults]
  G4 -. schema repair only .-> X4[Human review]
  G5 -. no claimant impersonation .-> X5[Participant confirmation]
  G6 -. read-only or draft-only .-> X6[Host confirmation]
```

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
  DRAFT --> HOST[Host Draft Review UI]
  HOST --> ACCEPT[accepted_by_host marker]
  HOST --> REJECT[rejected_by_host marker]

  ACCEPT -. does not apply orders .-> SAFE[Final state unchanged]
  ACCEPT -. does not calculate money .-> SAFE
  ACCEPT -. does not submit booking or payment .-> SAFE
```

## Task And Formula Matrix

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

  subgraph FormulaModules[Deterministic formula modules]
    F1[sameItemMerge]
    F2[participantSubtotal]
    F3[grandTotal]
    F4[averageSplit]
    F5[thresholdRemaining<br/>manual input]
    F6[optionDelta]
    F7[sharedFeeSplit<br/>P1 manual input]
    F8[depositGate<br/>P1 manual input]
    F9[tierDiscount<br/>P1 manual input]
    F10[extraPersonalClaim]
  end

  T1 --> F1
  T1 --> F2
  T1 --> F3
  T1 --> F5
  T1 --> F10
  T1 -. P1 .-> F9
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
  T4 -. P1 .-> F7
  T5 --> F2
  T5 --> F3
  T5 --> F10
  T5 -. P1 .-> F7
  T6 --> F2
  T6 --> F3
  T6 --> F10
  T6 -. P1 .-> F9
  T7 --> F2
  T7 --> F3
  T7 --> F10
  T7 -. P1 .-> F8
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
  HumanSettlement --> [*]
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
