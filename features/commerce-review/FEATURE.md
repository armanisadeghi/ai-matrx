# Commerce Review (the two human gates + attention)

**Routes:** `/commerce/triage` · `/commerce/drafts` · `/commerce/attention` ·
`/commerce/stores/connect` (admin map `/commerce/review/admin`)
**Owner workstream:** W11 of the ebay-store-management build
(`common-docs/projects/ebay-store-management/BUILD.md`, UX.md §5.2/§5.5/§6).

## What it is

The human side of the commerce pipeline, over the C1 `commerce` schema:

- **Warehouse triage (gate 1)** — `awaiting_triage` assets, one per screen, image-first,
  keyboard-driven (1–5 = bucket, Enter = confirm the AI's call, J/K move). A decision writes
  `value_bucket` + the next `pipeline_state` (`no_value` → `recycled`, else → `drafting`) — the
  status write IS the pipeline trigger (W4's policy 3 applies at both gates).
- **Drafts review (gate 2, lister craft)** — `in_review` assets with their LIVE `listing_draft`
  mandate result (non-superseded, succeeded). Evidence pane (source photos + the draft's
  reasoning), confidence-gated fields (low-confidence drafts open expanded and warn), edit-in-place,
  Enter/R/X verdicts at the ~15s/item bar. approve → `ready_to_publish`, revise → `drafting`,
  reject → `rejected`.
- **Attention queue** — open `recall_audit` disagreements (`is_disagreement`, no `human_verdict`),
  escalations (`escalated_at` set), and high-impact open `asset_unknown` rows, one list; inline
  recall verdicts; every row opens its asset (no dead ends).
- **Onboarding + store connect shell** — `/commerce/stores/connect`; the Connect button is the
  registered Coming-Soon promise `commerce.store-connect-oauth` until W6's OAuth routes land.

## 🚨 THE LEARNING-TAP LAW

A human decision NEVER destructively overwrites an AI output row. `asset_mandate_result` and the
evidence columns of `recall_audit` are read-only here forever. Every human change lands as:

1. a `human_correction` row carrying the AI's `before_value` (`gate_1` bucket diffs, near-miss
   flagged when a `no_value` is promoted; `gate_2` per-field diffs with `field_path`
   `title`/`description`/`aspect:<Name>`/…), and
2. an ASSET write (`value_bucket` / `attributes.listing.<path>` / `pipeline_state`) via the
   guarded CAS — so W10's learning taps can diff human vs AI.

## Files

| File | What |
|---|---|
| `types.ts` | Hand-declared rows for `asset_mandate_result`, `recall_audit`, `human_correction`, `asset_review` + the `CommerceReviewSchema` cast (DELETE when `commerce` lands in the generated types). Intake rows are imported from `features/commerce-intake/types.ts` (W4 owns them — never re-declared). |
| `service.ts` | Complete queue reads (`readAllRows`), live-result resolution (`superseded_by IS NULL AND run_status='succeeded'`), `decideValueBucket`, `reviewDraft`, `listAttentionQueue`, `recordRecallVerdict`, guarded CAS asset writes. Photos read through W4's exported `listArtifactsForAssets` — one canonical path. |
| `components/TriageQueue.tsx` · `DraftReviewQueue.tsx` · `AttentionQueue.tsx` · `StoreConnectShell.tsx` · `ConfidenceChip.tsx` | The surfaces; `ConfidenceChip` is the one confidence rendering/banding for both gates. |

## Agent disclosure

These surfaces review AI output but launch no agent from the client, and the pipeline's mandates
(valuation, listing_draft — W2/W5's side) do not yet exist as bindable mandate rows with stable
`mandateKey`s. When they land, register them via a manifest `agentRole` per the `agent-disclosure`
skill — never invent keys to satisfy disclosure early.

## Change Log

- 2026-08-29 — Created (W11): both gate queues, the attention queue, the store-connect shell,
  the learning-tap-lawful write path, admin map.
