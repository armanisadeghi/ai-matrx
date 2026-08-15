# Output Feedback — "was this AI output good?"

**Status:** Live (2026-08-15). Phase 0.4 of the Dynamic Agent Graph plan
(`common-docs/projects/matrx-dynamic-agent-graph/05-sequenced-plan.md`).

**One destination: `platform.output_feedback`.** Every thumbs button, every
"this is wrong" affordance, and every corrected-output capture writes there.
There is no second feedback store, and adding one is a defect.

---

## Why this exists — the trace that preceded it

A 2026-08-15 audit found thumbs UI in three places and could not name a
consumer. It was worse than "no consumer": there were three different
behaviours and two of them wrote nothing at all.

| Surface | What it did before | Verdict |
|---|---|---|
| `features/agents/components/messages-display/assistant/AssistantActionBar.tsx` (the live `/chat` route) | `setMessageReaction` thunk → `cx_message_set_reaction` RPC → `chat.message.metadata.user_reaction` = `like`/`dislike`. **4 rows in production.** Read back only by the same bar. No prose, no correction, chat-only, no consumer anywhere. | Persisted, but a dead end |
| `features/cx-chat/components/messages/AssistantActionBar.tsx` | `useState` only. The thumb lit up and the signal died with the component. | Wrote nothing |
| `features/rich-document/actions/handlers/feedback.ts` | Registered `thumbs-up`/`thumbs-down` actions that called `ctx.callbacks.onThumbsUp/onThumbsDown`. **No callsite in the repo ever supplied those callbacks**, and `visible` gated on them — so the actions never rendered. | Wrote nothing, showed nothing |

Reuse was considered and rejected for `agent.cmp_response_feedback` (real, but a
**component of a comparison set** — `comparison_set_id`, `rank`, `overall`;
battle-mode semantics, not general output judgement) and `users.user_feedback`
(the product bug/feature tracker behind the matrx-feedback MCP — feedback about
*the app*, not about an output).

The four existing reactions were backfilled, `metadata.user_reaction` was
stripped from every row, and `public.cx_message_set_reaction` was dropped. One
authority, no silent second store.

---

## The table

`platform.output_feedback` — canonical entity, token `output_feedback`,
`iam.apply_rls(...,'entity')`, `iam.canonical_certify_ok` = true.

- **Subject:** `subject_type` (FK → `platform.entity_types.token`) + `subject_id`.
  Polymorphic by token, so a workflow deliverable or an artifact needs no schema
  change — only a registered entity.
- **Verdict:** `positive` | `negative` | `mixed`. Thumbs map to the first two.
  `mixed` is what a correction with no explicit thumb means.
- **Prose:** the human's words.
- **Replay handle:** `request_id` (the agent request that produced the output)
  and `surface_name` (the capturing UI).
- **The corrected-output pair:** `original_content` / `corrected_content` /
  `corrected_ref_type` / `corrected_ref_id` / `corrected_at`. **This is the
  point of the table.** The pair is frozen at capture time on purpose — the
  referenced row keeps changing, and the signal must not. `original_content` is
  written once and never overwritten; later edits only move
  `corrected_content`. It is the reference point Level‑1 replay ranks candidate
  outputs against.
- One live row per `(subject_type, subject_id, created_by)`. Retracting is a
  real `DELETE` — a retracted opinion is not trash to be restored.

**Writes go through two SECURITY INVOKER RPCs**, never a bare table write, so
"the original is written once" and "a correction must not clobber an explicit
verdict" live in the DB rather than in each caller:

- `platform.upsert_output_feedback(...)` — `p_verdict` NULL leaves an existing
  verdict alone; a fresh row with no verdict lands as `mixed`.
- `platform.clear_output_feedback(subject_type, subject_id)`.

Reads are a direct RLS-filtered `.schema("platform").from("output_feedback")`
select, per the data-flow law (pure UI↔DB — never through the Python server).

---

## Using it

```tsx
const { verdict, setVerdict, captureCorrection } = useOutputFeedback({
  subjectType: "message",
  subjectId: messageId,
  requestId: record?._streamRequestId ?? null,
  surfaceName: surfaceKey ?? null,
  originalContent: content,   // frozen on the first write
});
```

- `setVerdict(v)` is optimistic with rollback; passing the active verdict retracts it.
- **Reads are coalesced automatically** (`batchLoader.ts`): every bar on the page
  asks for its own subject, and the loader issues ONE `in (...)` query per tick.
  A 200-message conversation is one read, not 200. `useHydrateOutputFeedback`
  is the optional up-front form for a list that already knows all its ids.
- State lives in a module-scoped store read through `useSyncExternalStore`
  (`store.ts`), not Redux: the subject is polymorphic so it belongs to no
  existing slice, and a parallel slice for a two-field cache is the sprawl the
  doctrine forbids. Every bar showing the same subject stays in sync.

### Live wiring

| Callsite | Subject | Notes |
|---|---|---|
| `/chat` `AssistantActionBar` | `message` | thumbs + `request_id` for replay |
| `cx-chat` `AssistantActionBar` | `message` | surface `cx-chat` |
| `rich-document` `thumbs-up`/`thumbs-down` | resolved by `features/rich-document/outputFeedbackSubject.ts` | hidden when the source has no registered entity token — a thumb that writes nowhere is worse than no thumb |
| `editMessage` thunk (assistant messages) | `message` | **corrected-output capture**: fire-and-forget after a successful edit, loud on failure |

### Adding a new subject type

1. Register the entity in `platform.entity_types` (the `subject_type` FK enforces this).
2. Map it in `outputFeedbackSubjectForSource` if it flows through rich-document.
3. Call `useOutputFeedback` with the token. Nothing else.

---

## Consumers (why the signal is no longer a dead end)

- **aidream** reads the table via the generated ORM model
  (`db/managers/platform/output_feedback.py`).
- **Phase 1.1 Level‑1 replay** ranks re-issued outputs against
  `corrected_content`.
- **Phase 3.1 drill-down review** enters from the thumbs-down affordance; the
  row is the head of the descent.

---

## Change Log

- **2026-08-15** — Created. Traced the three pre-existing thumbs paths, landed
  `platform.output_feedback` + its two RPCs, backfilled the 4 legacy reactions,
  dropped `cx_message_set_reaction` and `metadata.user_reaction`, wired all
  three surfaces, and added corrected-output capture on assistant-message edit.
