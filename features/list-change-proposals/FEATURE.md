# Proposed changes to a list

**The primitive: an agent proposes changes to a list, and the person accepts or rejects them
inside the message.** Any agent, any list, any scope. A repository's known defects is the first
customer, not the feature — nothing here knows what a defect is.

Kind: `list_change_proposal_v1` (+ `list_change_proposal_item_v1`, `list_change_target_v1`).
Registered in [`features/content-ir/kinds/list-change-proposal.ts`](../content-ir/kinds/list-change-proposal.ts);
that file's header carries the schema doctrine. This directory is the reviewer and the port.

## The three pieces

| File | What it is |
|---|---|
| [`applyListChange.ts`](./applyListChange.ts) | **THE PORT.** `readListTarget(target)` and `applyListChange(target, proposal)`, one implementation per kind of list. The only module that knows what a list IS. |
| [`ListChangeProposalView.tsx`](./ListChangeProposalView.tsx) | **THE ONE component** for the kind. One row per proposal: what, why, Accept, Reject. |
| [`decisions.ts`](./decisions.ts) | Where a decision lives: `chat.message.metadata` via `mergeJsonColumn`. |

Chat reaches the component through the thin adapter
[`components/mardown-display/blocks/list-change-proposal/ListChangeProposalBlock.tsx`](../../components/mardown-display/blocks/list-change-proposal/ListChangeProposalBlock.tsx)
and the `list_change_proposal` entry in `block-dispatch.tsx`.

## Invariants

- **The port is the only seam.** `{kind:"scope_dataset"}` writes `workbench.udt_dataset_rows`
  through `udt_bulk_write` under the person's own authority; `{kind:"table"}` — a Table homed in
  a Record in the unified record store — refuses BY NAME until that store lands. Swapping the
  target changes this one module and nothing else: not the kind, not the component, not the
  skill agents were taught, not a conversation already on screen.
- **What the STORE says is read from the store.** An accepted `add` shows as settled because
  the row is there, for every viewer on every device. Only the rejection — which leaves no trace
  in the store at all — and the store's own refusal sentence are remembered beside the message.
  Losing that data loses the record of a rejection, never a row.
- **No new table was invented.** `chat.message.metadata` is the platform's existing durable
  per-message place, writable by a conversation editor under RLS (`std_update`), merged through
  the canonical optimistic-concurrency primitive. There is no generic message-interaction store
  to use instead — this is it.
- **Accepting a removal DESTROYS the row.** `udt_bulk_write`'s delete op issues a real
  `DELETE FROM workbench.udt_dataset_rows` even though the table carries `deleted_at`, so the
  confirm says exactly that rather than a generic "cannot be undone". Tracked in
  [FOUND_DEFECTS.md](../../FOUND_DEFECTS.md).
- **A control that would do nothing is ABSENT with the reason in words** — no message id, a
  store that refuses to be read, or a read-only host each say so.

## The agent side

The kind is taught by the render-block skill `kind_list_change_proposal` (a `skill.definition`
row, opt-in per agent — agents are never auto-attached) plus four content blocks under **Agent
Skills** (`list-change-proposals-*` in `skill.render_definition`). Both ship in
`migrations/list_change_proposal_kind.sql`. **Never author or modify an agent's prompt to use
this** — the block is offered, the owner decides.

## The first customer's data

A platform table template **"Known defects"** (title, detail, area, severity, status,
first_seen) in `workbench.udt_dataset_templates`, owned by the system organization. A context
item whose `reference_source` is `{container_type:"dataset_template", template_id, dimension:
"whole", provision:"per_scope"}` gives every scope of its type its own copy, provisioned by
`context.provision_scope_dataset`, delivered to the agent as a
`directive_v1_reference_table` fence that the server expands to one line per row.

## Change log

- **2026-09-18** — Built. Kind, port, component, decisions, skill + content blocks, "Known
  defects" template. Proven live as `admin@admin.com`: accept adds a row, accept removes one,
  reject records without touching the store, and all three survive a reload.
