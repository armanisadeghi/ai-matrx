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
| `BindingMiddle.tsx` | The match. `SurfaceVariableBinding` rendered **VERBATIM**, plus the many-to-one strip, the absence answer and the per-row problems a job binding needs and a surface binding does not. |
| `AutoRunBar.tsx` | P14. "Run instantly", live only while the map leaves nothing to ask, narrating the four sentences as the map changes. The FACT is the shared `evaluateBindingAutoRun`; this file owns only the many-source → one-mapping translation. |
| `consumption-writer.ts` | 🚨 **THE ONE WRITER.** Nothing else builds a `ConsumptionEntry` or mutates a `ConsumptionMap` — the manual row, the many-to-one strip and the AI map's accept all go through it. |
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

The middle's header carries the two tabs the surface bind panel carries: **AI map**
(`BindingSuggestionsTab`, the same component and the same
`surfaces_client.binding_mapper` mandate, given this domain's nouns and permission to
propose combinations) and **Map manually**. Accepting fills the manual editor and
switches to it — nothing is ever applied blind, and every line stays editable.

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

## The four sources, all four real

A holder input is fed by exactly one of four things, and the shared row offers all
four by name:

| The pick | What is stored |
|---|---|
| Holder Default | **Nothing.** Absence from the map IS the answer — a job binding has no auto-name-match pass to suppress, so a suppression marker would be a stored fact with no reader. |
| Offered Value | `offered_value` — with `deliver`, the absence answer (`when_absent`) when the value is not guaranteed, and its place in the join order. |
| Direct Value | `direct_value` — a literal written on the binding. |
| Prompt User | `prompt_user` — the question the run form will ask. The mandate's input surface serves that target as a REAL named field (`origin: "binding_prompt"`), so the ask happens and the answer arrives under the holder input's own name. |

Until 2026-08-31 the server accepted `offered_value` alone, and this feature answered
the other two with `refusalForMapping` — a stand-in that screamed in domain words
rather than write something the save would 422 on. `aidream/services/mandates/
provisions.py` now validates AND materializes all three stored sources, so the
stand-in is **deleted, not disabled**.

## Auto-run (P14)

`mandate.binding.auto_run` (added 2026-08-31, nullable) closes the auto-run
inversion: a job bound through a mandate can finally promise what the same job bound
to a surface has promised for months. Three answers, and `null` is a real one — "this
binding has no opinion; the layer below decides".

The promise is a FACT about the mapping, never a preference, and it is re-checked at
three points rather than trusted once: the bar refuses to offer it, `set_binding`
refuses to store it (down to `false`, loudly), and `resolve_mandate` refuses to honour
it against the map that actually won — because a later layer's map wins outright, so a
promise can go stale without anyone touching the binding that carries it.

## The example (D2)

An offered value carries one STATIC `example` — declared with the provision, or typed
beside a described input at creation. It is an illustration shown at the moment of
choice (P5), rendered on the offered rail and under the chosen value in the middle as
*"Looks like: …"*. Nothing reads it at run time on either side of the wire, so it can
never become an answer, and absent means the declaration gave none — never invent one.

## Change Log

- 2026-08-31 — **Steps 4–5, and the seam closed.** The AI map tab (P11/P12) is the
  shared `BindingSuggestionsTab` at a fifth call site, taught this domain's nouns and
  D18.2 combinations (the ONE mapper agent gained a `combination_rule` variable and an
  optional ordered `surface_values`, so the call site decides and the surface path's
  behaviour is unchanged; extras it cannot store are discarded WITH a report).
  `mandate.binding.auto_run` + `AutoRunBar` close the auto-run inversion. `OfferedValue`
  gained a static `example` end to end (declaration → `offer_for` → input surface →
  the rail and the middle). `direct_value` and `prompt_user` became real sources on the
  server, so `refusalForMapping` is deleted. Also fixed at their class on the way
  through: `compareConsumptionAgainstOffer` read a literal's value as an offered-value
  NAME (a false "consumes something this job does not offer" on any valid binding), and
  the input surface read only the single-source map shape, so every value in a
  many-to-one target was served "the Holder does not consume it".
- 2026-08-31 — Created. Steps 1–3 of PLAN-ONE-BINDING-UI: the workspace shell, the three
  columns over the verbatim row component, the scope + holder bar with `useGuardedRebind` on a
  saved binding's holder swap, mounted at `/mandates/[key]` and the admin host. Deleted with
  it: `features/mandates/workspace/OverrideFlow.tsx` (1,437 lines) and the rebind editor in
  `MandateDetailPanel.tsx` (209 lines). Steps 4–7 (AI map tab, `auto_run`, batch mode, OPTIONS
  drawer) are not built.
