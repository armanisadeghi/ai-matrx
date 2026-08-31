# FEATURE — bindings (THE ONE BINDING UI)

**One screen binds a job to whoever runs it**, at any rung, for an agent holder or a workflow
holder. It is the mandate system's binding surface, and it is built out of the components the
agent↔surface workspace, the surface bind panel, the shortcut editor and the batch grid already
share — a fifth CALL SITE, never a fifth implementation.

Arman's sentence is the spine:

> "on one side, they showed you what the mandate (surface) offered and on the other side, they
> showed you the agent and then you were able to match things directly in the middle."

- **Standard it is built to:** `../../../common-docs/projects/workflow-mandate-program/UI-STANDARD.md`
- **Plan:** `../../../common-docs/projects/workflow-mandate-program/PLAN-ONE-BINDING-UI.md`
- **Rulings:** `../../../common-docs/systems/mandates/DECISIONS.md` D18
- **Storage + server truth:** `features/mandates/FEATURE.md`, aidream
  `aidream/services/mandates/bindings.py` + `provisions.py`

## The anatomy

| File | What it is |
|---|---|
| `OneBindingWorkspace.tsx` | The shell. Owns the draft (rung, holder, consumption map, refusals), resolves the offer, runs the agent pre-flight, hosts settings, saves and removes. Every refusal is adjacent to the control it refuses. |
| `ScopeHolderBar.tsx` | RUNG · HOLDER · JOB. The rung is `ShortcutScopePicker`; the holder cell is the agent/workflow picker lifted out of the deleted wizard. |
| `OfferedInventoryColumn.tsx` | The offered side, permanently open. |
| `HolderInputsColumn.tsx` | The consuming side, permanently open: variables then context policies. |
| `BindingMiddle.tsx` | The match. `SurfaceVariableBinding` rendered **VERBATIM**, plus the many-to-one strip and the per-row refusals a job binding needs and a surface binding does not. |
| `consumption-writer.ts` | 🚨 **THE ONE WRITER.** Nothing else builds a `ConsumptionEntry` or mutates a `ConsumptionMap`. |
| `offered-adapter.ts` | `OfferedValue` → `SurfaceValue`, so the shared picker reads a mandate's inventory. |
| `useHolderInputs.ts` | `buildBindingTargets` for an agent, `useServedRunForm` for a workflow — one hook, no holder-type branch upstream. |
| `WorkflowHolderPicker.tsx` | Lifted from the wizard; now retries instead of dead-ending on a read failure. |

## Where it mounts

One component, one section, both routes — the host supplies identity and authority, never a
different UI (`MandateWorkspace.tsx` § "Who fulfils this job"):

| Host | Route | Rungs |
|---|---|---|
| User workspace | `/mandates/[key]` | user · org (the rung control offers both) |
| Admin | `/administration/mandates/[key]` | system · org · user (`allowGlobal`; the server's super-admin gate is the authority) |
| Window panel | `MandateWindow` | same section, same component |

`matrx:open-mandate-pin` (fired by "Bind an agent to this job" and by the admin console's
door) scrolls this section into view. `NewMandatePage` hands a brand-new mandate straight here
with `#bind`.

## The rules this surface must keep

1. **Both inventories stand open, permanently.** Neither side is ever behind a click.
2. **The row is the shared one, verbatim.** If it needs something it does not have, the change
   is made IN `SurfaceVariableBinding` for all five call sites — never forked here.
3. **Many-to-one is real (D18.2).** Several offered values feed one holder input, joined in
   list order with a blank line. Row 0 is the shared row; the strip owns the rest. Multi-source
   targets take scalar kinds only, and every source of one target agrees on `deliver`.
4. **Context slots are targets (D18.3)**, symmetric with variables, and each row says which.
5. **Described inputs ARE the provision (D18.1).** No provision key is not "no inputs" — the
   served input surface answers, and a mandate that offers nothing still renders the map step
   with an honest sentence. The structural skip is what this build exists to end.
6. **Nothing dead, nothing silent.** Every empty, loading, unreadable and refused state is a
   sentence with a remedy. Save is disabled only with its reason printed beside it.

## Known seam — the two sources a job binding cannot carry yet

The shared row offers four sources. A mandate binding stores two of them: the server's
consumption-map validator accepts `offered_value` (and legacy `code_value`) and nothing else
(`aidream/services/mandates/provisions.py`). Choosing **Direct Value** or **Prompt User**
therefore does not write — `refusalForMapping` answers with the reason and the remedy on that
row, and Save states it too.

**When the server learns those branches, `refusalForMapping` returns null for them and this UI
gains both with no other edit.** That is the whole seam.

## Change Log

- 2026-08-31 — Created. Steps 1–3 of PLAN-ONE-BINDING-UI: the workspace shell, the three
  columns over the verbatim row component, the scope + holder bar with `useGuardedRebind` on a
  saved binding's holder swap, mounted at `/mandates/[key]` and the admin host. Deleted with
  it: `features/mandates/workspace/OverrideFlow.tsx` (1,437 lines) and the rebind editor in
  `MandateDetailPanel.tsx` (209 lines). Steps 4–7 (AI map tab, `auto_run`, batch mode, OPTIONS
  drawer) are not built.
