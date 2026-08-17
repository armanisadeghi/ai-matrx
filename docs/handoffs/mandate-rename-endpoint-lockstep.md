# Finish the Mandate rename in matrx-frontend when the ENDPOINT half deploys

**Status: the DB half is DONE.** aidream `bfb83326f` renamed the tables, and this repo flipped
with it on 2026-08-17 (`agent.mandate` / `mandate_binding` / `mandate_exemplar`, `mandate_key`,
`mandate_id`). Nothing about the tables is outstanding.

**What is still held: every name that travels over HTTP.** aidream has already WRITTEN the rename
(`8cb4ed463` — routers moved to a `/mandates` prefix with `{mandate_key}` path params, and
`services/agent_slots/client_slots.py` → `services/mandates/client_mandates.py`), but **production
still serves `/agent-slots/*` with the `Slot*` OpenAPI schemas, and there is no compatibility
alias.** So this repo deliberately still calls the old paths. Renaming them before the deploy 404s
the whole Mandates admin console; not renaming them after the deploy does the same.

## Check first

```bash
curl -s https://server.app.matrxserver.com/openapi.json \
  | python3 -c "import json,sys; print([p for p in json.load(sys.stdin)['paths'] if 'mandate' in p])"
```

Empty → still blocked; do nothing. Non-empty → do the work below **in the same session** and push.

## The exact list of held names

| Where | Held name | Becomes |
|---|---|---|
| `features/admin/mandates/service.ts` | `path: "/agent-slots/code-truth"`, `"/agent-slots/{slot_key}/variable-verdicts"`, `"/agent-slots/{slot_key}/tests"`, `"/agent-slots/{slot_key}/test"` + each `pathParams: { slot_key: … }` | the regenerated paths — read them out of `api-types.ts`, do not guess |
| `features/agents/mandates/overrides.ts` | `path: "/agent-slots/{slot_key}/binding"` (PUT and DELETE) + both `pathParams` | same |
| `features/admin/mandates/service.ts` `isMandateCodeTruthReport` **and** its fixture in `__tests__/service.test.ts` | the wire field `slots` on the code-truth report, and `slot_key` on each entry | rename **both together**, or the guard silently accepts a shape the server never sends (this exact bug shipped once — see the console FEATURE.md change log) |
| `features/admin/mandates/service.ts` `isMandateTestResult` / `isMandateTestBatchResponse` + `__tests__/service.test.ts` fixtures | the wire field `slot_key` on test results and batch responses | same rule — guard and fixture together |
| `features/admin/mandates/__tests__/rebind-impact.test.ts` | `slot_key` on the code-truth fixture | follow the regenerated `CodeTruth*` schema |
| generated types | `components["schemas"]["SlotCandidate" \| "SlotTestResult" \| "SlotTestRequest" \| "SlotCodeTruth" \| …]` | run `pnpm sync-types` and use the new schema names — never hand-edit `types/python-generated/api-types.ts` |
| `SlotCandidate.selection` | the value `slot_pinned` | whatever the new enum spells |
| docblocks in `contract-compare.ts`, `MandateAgentPicker.tsx`, `MandateOverrideEditor.tsx`, `TryItNowPanel.tsx`, `MandateDetailPanel.tsx`, both mandate `FEATURE.md`s | prose `/agent-slots/...` paths | the new paths |

## NOT part of this — do not touch

- `context_slots` / `required_context_slots` / Context Policy (**a different lineage**).
- Mandate KEY VALUES (`podcast.deep_research`, `chat.default_new_chat`, …) — those never change.
- React slot props (`rightSlot`, `createSlot`, …), agent-app layout slots, transcripts-cleanup
  `custom_slots` — all unrelated senses.
- `features/surfaces/manifests/mandates.manifest.ts`'s surface VALUE named `slot_key` (and the two
  `slot_key: r.mandateKey` emitters in `MandatesConsole.tsx`). That is a FE-owned surface contract
  whose rename needs a `ui_surface_value` DB sync + `check:surface-drift`, not an HTTP flip. It has
  its own task chip.

## Finish

`pnpm sync-types`, `pnpm type-check`, `npx jest features/admin/mandates features/agents/mandates`,
then browser-verify `/administration/agents/mandates` (loads with no "Code truth is unavailable"
banner, health driven by live code truth, detail drawer resolves) and `/agents/mandates` (a binding
save round-trips). Delete this handoff and its row in
`common-docs/operations/unassigned-handoffs.md` in the same commit.
