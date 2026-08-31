# Group Room Mermaid Module Design

Generated at: 2026-09-01

Scope: open-source WebMCP tool-layer template for pre-payment social coordination.

WebMCP tool surface version: `group-room-webmcp-tools.v2`.

## Full Module Overview

```mermaid
flowchart TD
  U[Human user opens live web app] --> R[Create or join group room]
  R --> T{Task selector}
  T -->|Manual choice| TR[Task Router Contract]
  T -->|Auto detect| TR
  TR --> E[Evidence / OCR Contract]
  E --> L[Local-first parser]
  L --> Q{Quality gate}
  Q -->|Pass| F[Deterministic Formula Engine]
  Q -->|Low confidence or conflict| AR[AI Repair Gate]
  AR --> HR[Human review]
  HR --> F
  F --> CA[Claim Audit Ledger]
  CA --> S[Room sync and summary UI]
  S --> H[Host final confirmation]

  A[Right-side Agent] --> WM[Page-side WebMCP tools]
  WM --> RO[Read-only inspection tools]
  WM --> PO[Proposal-only draft tool]
  RO --> S
  PO --> D[room.agentProposals JSON draft]
  D --> H

  H -->|Accept draft| AS[accepted_by_host marker only]
  H -->|Reject draft| RS[rejected_by_host marker only]
  H -->|Finalize manually| O[Human-owned settlement summary]

  AR -. cannot change formulas .-> F
  PO -. cannot mutate final room state .-> S
  PO -. cannot pay or submit orders .-> H
```

## Six Atomic One-Way Gates

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
