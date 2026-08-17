# Finish the Mandate rename in matrx-frontend when the DB half lands

**Why this exists:** the "agent slot" → **Mandate** rename (Arman, 2026-08-16, Vocabulary Law 4)
is DONE in this repo for everything the client owns — code, routes, components, UI copy, docs, and
the `matrx-admin/mandates` surface contract. The half that is deliberately NOT done is every name
the SERVER owns, because this client reads those tables directly with supabase-js. Renaming them
here before the server renames them would 404 every read on `/agents/mandates`, the admin console,
and every mandate resolution in the product.

**Blocked on:** the parallel cross-repo chip renaming aidream + the DB:

```
agent.slot_definition → agent.mandate     slot_key → mandate_key
agent.slot_binding    → agent.mandate_binding   slot_id  → mandate_id
agent.slot_exemplar   → agent.mandate_exemplar
```

## Check first

```sql
select table_name from information_schema.tables
where table_schema = 'agent' and table_name like '%mandate%';
```

Empty → still blocked; do nothing. Non-empty → do the work below **in the same session** and push,
so a deploy pass never picks up half of it.

## The exact list of held names

| Where | Held name | Becomes |
|---|---|---|
| `features/agents/mandates/service.ts`, `service.server.ts`, `overrides.ts` | `.from("slot_definition")`, `.from("slot_binding")` | `.from("mandate")`, `.from("mandate_binding")` |
| same + `features/admin/mandates/service.ts` | `.select`/`.eq` on `slot_key`, `slot_id`, and every `row.slot_key` / `row.slot_id` read | `mandate_key` / `mandate_id` |
| `features/admin/mandates/service.ts` | `.from("slot_exemplar")`, `Database["agent"]["Tables"]["slot_exemplar"]` | `mandate_exemplar` |
| `features/admin/mandates/service.ts`, `overrides.ts`, `TryItNowPanel.tsx`, `contract-compare.ts` docblocks | aidream paths `/agent-slots/{slot_key}/binding`, `/agent-slots/code-truth`, `/agent-slots/{slot_key}/tests`, `/agent-slots/{slot_key}/test`, `/agent-slots/{slot_key}/variable-verdicts` | whatever aidream renames them to — read the new OpenAPI, do not guess |
| `features/admin/mandates/service.ts` `isMandateCodeTruthReport` **and** its fixture in `__tests__/service.test.ts` | the wire field `slots` on the code-truth report | rename **both together**, or the guard silently accepts a shape the server never sends (this exact bug shipped once — see the console FEATURE.md change log) |
| `features/admin/mandates/service.ts` | `components["schemas"]["SlotCandidate" \| "SlotTestResult" \| "SlotTestRequest" \| "SlotCodeTruth" \| …]` | regenerate types (`pnpm sync-types`) and use the new schema names — never hand-edit `types/python-generated/api-types.ts` |
| aidream module path in comments | `services/agent_slots/client_slots.py` | its renamed path |

## NOT part of this — do not touch

- `context_slots` / `required_context_slots` on an agent (**a different concept**; 364 references,
  unchanged by the campaign and must stay unchanged).
- Mandate KEY VALUES (`podcast.deep_research`, `chat.default_new_chat`, …) — those never change.
- React slot props (`rightSlot`, `createSlot`, `triggerSlot`, `iconSlot`), agent-app layout slots
  (`compile-slot`, `SlotRenderer`), transcripts-cleanup `custom_slots`, and kind-instance /
  agent-usage "repin" — all unrelated senses.

## Finish

`pnpm db-types`, `pnpm type-check`, `npx jest features/admin/mandates features/agents/mandates`,
then browser-verify BOTH `/agents/mandates` (lists Mandates from the live DB) and
`/administration/agents/mandates` (loads with no "Code truth is unavailable" banner, health driven
by live code truth, detail drawer resolves). Delete this handoff and its row in
`common-docs/operations/unassigned-handoffs.md` in the same commit.
