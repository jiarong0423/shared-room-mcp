# Adaptive Contract MCP Architecture

Shared Room MCP is the reference application. Adaptive Contract MCP is the reusable contract, router, prompt, review-gate, and guardrail layer underneath it.

Adaptive Contract MCP is not a blockchain smart contract and not an autonomous execution engine. It means adaptive room terms drafted from evidence, validated by strict schemas, reviewed through WebMCP/Codex, and executed only after human approval.

The product boundary is a form-based async private task room. It is not a chatroom, messaging app, payment gateway, booking bot, or browser-control agent. A host defines the evidence and service boundary; members fill only their own selectable or assigned parts; final release and settlement stay behind explicit human review.

OCR plus LLM-assisted parsing and text-block recognition produce a draft. WebMCP/Codex reviews the draft against room state and evidence. The human edits, confirms, overrides advisory warnings, and releases the commitment. Threshold conditions such as group size or minimum spend are warnings until a host decides; AI never commits a booking, group formation, payment, or settlement.

Zeabur is the hosted state storage, MCP protocol host, HITL approval gate, guardrail runtime, member release surface, and export surface. Zero required ML/OCR workload is processed on the Zeabur server in the default WebMCP Challenge path.

## Runtime Loop

```mermaid
sequenceDiagram
  autonumber
  actor Host as Host / Service Owner
  actor Member as Member / Guest
  participant Local as Authorized Local Bridge
  participant Vision as Local OCR + Vision LLM
  participant Page as Shared Room MCP Page
  participant WebMCP as WebMCP State Reader
  participant Contract as Adaptive Contract MCP
  participant Review as ReviewGate
  participant Guardrail as Guardrail Registry
  participant Store as Room Store

  Host->>Page: Create room and provide evidence
  Page->>Store: Save uploaded evidence image
  Local->>Vision: Read local image, run OCR, correct with visual model
  Vision-->>Local: Structured draft plus review notes
  Local->>Page: Write semantic_repair_draft proposal
  WebMCP->>Page: Inspect room state through page-local tools
  WebMCP->>Page: Summarize draft-only next action
  Host->>Review: Review the draft card
  Review->>Contract: Convert approved draft into parser candidates
  Contract->>Contract: Route scenario and apply prompt contract
  Contract->>Guardrail: Check forbidden numbers, formulas, sparse evidence
  Guardrail-->>Review: Emit warning or structural gate
  Review-->>Page: Show parser candidates for host review
  Host->>Review: Accept warning, edit value, or remove candidate
  Review->>Contract: Mark resolved_warning or require edit/remove
  Contract->>Store: Save reviewed state and audit trail
  Host->>Page: Member-Visibility Release
  Page->>Store: Publish reviewed selectable rows
  Member->>Page: Select assigned or visible options
  Member->>Page: Confirm own cost
  Host->>Page: Finalize reviewed summary
  Page->>Host: Export HTML or PDF evidence record

  WebMCP-->>Host: State summary and draft recommendation
  Vision-->>Review: OCR-only output remains blocked
  Review-->>Host: Human approval remains required
  Guardrail-->>Host: Structural risk requires edit or removal
```

## Contract Pipeline

```mermaid
flowchart TD
  L0[Image-backed EvidenceAsset] --> B0[Authorized Local Bridge]
  B0 --> B1[Local OCR Candidate Text]
  B1 --> B2[Local or Visual LLM Correction]
  B2 --> B3[Structured Draft Proposal]
  B3 --> L1[Host Draft Review]
  L1 --> L2[Scenario Router]
  L2 --> L3[Prompt Contract]
  L3 --> L4[ParserCandidate Layer]
  L4 --> L5[Canonical Number Normalizer]
  L5 --> L6[Negative Pattern Registry]
  L6 --> L7[ReviewGate]
  L7 --> L8[Host Review Decision]
  L8 --> L9[Member-Visibility Release]
  L9 --> L10[Member Confirmation]
  L10 --> L11[Owner Finalized Summary]
  L11 --> L12[HTML or PDF Review Export]

  L7 --> W[Declarative Warning]
  W --> RW[Host Accepts as resolved_warning]
  RW --> L9

  B1 --> OB[OCR-only Blocker]
  OB --> HR[Local vision or human repair required]
  HR --> B3

  L7 --> S[Structural Gate]
  S --> ER[Edit or Remove Required]
  ER --> L8

  S -. blocks .-> RISK[Phone, date, address, tax id, business hours]
  S -. blocks .-> RISK_NON_CURRENCY[Non-currency numbers near forbidden context]
  S -. blocks .-> RISK_FORMULA[Unresolved tax, deposit, service fee, tier formula]
```

## Semantic Visual Anchor

Adaptive Contract MCP currently uses Semantic Visual Anchors rather than pixel-level bounding boxes:

- `boundingZone`: a logical zone such as `header_top_right`, `footer_bottom`, or `table_row_3_col_2`.
- `auditAnchor`: a short surrounding text snippet that explains why the value was extracted or blocked.
- `detectedTypeHint`: a semantic hint such as `price_amount`, `phone_number`, `date`, `address_number`, `tax_identifier`, or `time_range`.
- `bbox`: reserved for future pixel-level crop overlays.

This is enough for the current demo because the host needs a stable review reason and source context, not a fragile crop coordinate that may drift after resizing.

## Guardrail Memory Rule

Guardrail memory stores negative patterns, not corrected answers.

Correct:

```json
{
  "patternScope": "CONTRACT_LOCAL",
  "matcherRule": {
    "type": "REGEX_CONTEXT",
    "regex": "(?i)(TEL|Phone|電話|电话|聯絡|地址|Addr|Tax ID|統編|營業時間)",
    "targetField": "SelectableItem.price"
  },
  "matcherStrength": "HARD_BLOCK",
  "actionOnMatch": "ROUTE_TO_REVIEW_GATE"
}
```

Incorrect:

```json
{
  "badAnswer": "2711 is never a price"
}
```

The first form prevents repeated known error patterns without poisoning future rooms with one historical answer.

## Public Benchmark Scope

The image matrix is a deterministic contract-driven integration benchmark. It verifies artifact integrity, scenario routing, schema adherence, member-visible masks, anti-pollution gates, and HITL state transitions under paired image and evidence text.

It is not a provider accuracy benchmark and not a claim that arbitrary real-world images always parse correctly. The release claim is limited to deterministic image-plus-oracle integration, optional operator-machine OCR canaries, and the WebMCP plus Codex plus human-review loop. Zeabur is the hosted room/runtime/HITL surface; it is not the OCR engine unless a deployment owner explicitly installs and configures such an extension.
