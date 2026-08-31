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
| `AutoRunBar.tsx` | P14. "Run instantly", live only while the map leaves nothing to ask, narrating the four sentences as the map changes. The FACT is the shared `evaluateBindingAutoRun`; this file owns only the many-source → one-mapping translation. Its own sentences are the PRE-SAVE preview; `serverNotes` (`BindingResult.notes`) is what the write actually did, verbatim. |
| `consumption-writer.ts` | 🚨 **THE ONE WRITER.** Nothing else builds a `ConsumptionEntry` or mutates a `ConsumptionMap` — the manual row, the many-to-one strip and the AI map's accept all go through it. |
| `offered-adapter.ts` | `OfferedValue` → `SurfaceValue`, so the shared picker reads a mandate's inventory. |
| `useHolderInputs.ts` | `buildBindingTargets` for an agent, `useServedRunForm` for a workflow — one hook, no holder-type branch upstream. |
| `WorkflowHolderPicker.tsx` | Lifted from the wizard; now retries instead of dead-ending on a read failure. |
| `described-offer.ts` | What a job offers when no code declared it (D18.1). ONE derivation, shared by both modes. |
| `words.ts` | The four sources' names and the fill-down limits sentence — one vocabulary, so no two controls name one thing differently. |
| `BindingOptionsDrawer.tsx` | The folded **OPTIONS** stack (P16). See below. |
| `treatment-shape.ts` | 🚨 **THE ONE CODEC** for `mandate.treatment.config` — a job's presentation. |
| `treatment-writer.ts` | 🚨 **THE ONE WRITER** for that row, as `consumption-writer` is for the map. |
| `batch/` | **Batch mode** — the same middle transposed. See below. |

## Batch mode — the same screen, many places

`[ Map one place ][ Map many places ]` sits under the scope + holder bar, and that
is the whole difference: **one rung and one holder apply to every row**. Places
(jobs) are rows, the holder's inputs are columns.

| File | What it is |
|---|---|
| `batch/ModeToggle.tsx` | The two-word toggle and the sentence that says what carries over. |
| `batch/BatchMode.tsx` | The orchestrator: which places, the cascade, the fill-down, the requirement gate, Apply. |
| `batch/PlacesSelector.tsx` | Which jobs are in the batch, each priced before it is picked, each saying whether this rung already answers it. |
| `batch/InputCascade.tsx` | P17.1 — every input is `Keep each place's own \| Set for all places \| Per place`. Per place is the default. |
| `batch/PlacesBatchGrid.tsx` | The grid. Health dot, ADD/UPD badge and fill-down come from `agent-shortcuts/.../BatchGridParts` — shared with the shortcut grid, never copied. |
| `batch/PlaceBindingCell.tsx` | One cell: `InlineBindingEditor` (the shortcut grid's own) in this domain's words, with **Advanced opening `BindingMiddleRow` — map mode's full card**, many-to-one included. |
| `batch/batch-model.ts` | Pure: row health, the copied-mapping rule over a whole map, and the Apply refusal's words. |
| `batch/usePlaceOffers.ts` | Each place's offer, read lazily per row through the two paths the single-place screen already has. |

Four rules batch mode keeps, each proven in `__tests__/batch-model.test.ts`:

1. **The same validation.** A row is red exactly when map mode would refuse to
   save it — `consumptionMapProblems` is the judge in both, so a dot and a
   sentence one screen apart can never disagree.
2. **A copied mapping is reconciled against THAT place** — keep · re-bind on a
   name match · clear and go red (`reconcileCopiedTarget`, the same function the
   shortcut cell calls). An extra source of a many-to-one target is never
   re-bound by name; it is kept or dropped, because re-binding it would join one
   value to itself.
3. **Apply is refused in words, with the count, ON THE PAGE** — *"1 required
   input is still unmapped. Fix the red cells first."* The shortcut grid used to
   answer the same refusal with a `toast.error` fired from inside its click
   handler; that defect is fixed at its class rather than merely avoided here.
   `ApplyRefusal` in `agent-shortcuts/.../BatchGridParts` is now the ONE
   renderer both grids use, and in both the refusal is a DERIVED fact that
   disables Apply with its reason already visible — never a live button that
   scolds you afterwards.
4. **N places are N ordinary binding writes.** There is no batch endpoint and no
   second write path: each place goes through `consumption-writer` →
   `buildBindingSavePayload` → `putMandateBinding`, and each keeps its own stored
   settings and its own auto-run promise (batch never makes that promise — it is
   a fact about ONE map, and the footer says so).

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
7. **A selection closes before its confirmation opens.** The shared `confirm()` boundary
   calls `afterCurrentLayerCloses`, so every Select/Menu caller waits for the current body
   lock to remain released for two consecutive paints before AlertDialog opens. Neither a
   caller opt-in, fixed delay, nor the first unlocked paint is treated as proof of close.

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

**One asymmetry, stated rather than hidden:** a literal or a question can be
source **0** of a target (the shared row owns that pick), and the server will happily
join either into a many-to-one target. The "also feed this input…" picker offers only
OFFERED values, so sources 1..n are offered values today. Nothing on screen claims
otherwise and nothing is dead — it is simply not offered yet.

## Auto-run (P14)

`mandate.binding.auto_run` (added 2026-08-31, nullable) closes the auto-run
inversion: a job bound through a mandate can finally promise what the same job bound
to a surface has promised for months. Three answers, and `null` is a real one — "this
binding has no opinion; the layer below decides".

The promise is a FACT about the mapping, never a preference, and it is re-checked at
three points rather than trusted once: the bar refuses to offer it, `set_binding`
refuses to store it (down to `false`, loudly), and `resolve_mandate` refuses to honour
it against the map that actually won — because a later layer's map wins outright, so a
promise can go stale without anyone touching the binding that carries it. When the middle
one fires, its refusal comes back as prose on `BindingResult.notes` and the bar prints it
verbatim — a `logger.warning` is a scream only the server hears.

## OPTIONS — the folded drawer (P16)

Last on the page, folded shut, and its trigger says how many options this job
has actually answered, so nobody opens it out of curiosity. Four sections, every
one of them a component the Gen-A shortcut editor renders, at a new call site:

| Section | Composed of | Stored at |
|---|---|---|
| **Display** | `WidgetPicker` + `SettingsSection` (`omitAutoRun`) | `display_mode`, `allow_chat`, `variables.*`, `reveal.*`, `gate.*` |
| **Visibility** | `CategoryPicker` | `menu.category_id` |
| **Write access** | `WritePolicyEditor` | `write_policies` |
| **Advanced** | `AdvancedSection` (`omit: ["description"]`) | `seeds.*`, `menu.sort_order`, `icon_name`, `keyboard_shortcut`, `json_extraction`, and the row's `is_enabled` |

**Every reveal is caused.** Write access is ABSENT unless this job names a
surface whose manifest declares write targets — a panel that can only say
"nothing here" is a reveal nobody asked for. The gate cascade appears only while
the binding's auto-run fact makes it meaningful. Advanced's raw-JSON fields
parse on every keystroke and never propagate invalid JSON upward.

**Three things are deliberately NOT in the drawer**, each because it already has
one home: *Run instantly* (the `AutoRunBar` — on a job it is a fact about the
mapping, not a preference, which is what `omitAutoRun` exists for), the
*mapping* (the middle), and the job's own *description* (the job, not its
presentation — hence the `omit`).

### Where these options live, and who they cover

`mandate.treatment` — tier `widget`, `is_default`, one row per job, the exact
natural key `mandate.vw_shortcut` joins on. This is not a new home: the 208
migrated shortcuts have served their presentation out of this table since the
cutover (`SHORTCUT_WRITE_POLICIES_ON_TREATMENT`), and `treatment-shape.ts` is a
client codec for the SAME `schema_version: 1` object that
`mandate.shortcut_treatment_config` builds — nine jest cases pin every key and
default against the view's own SQL, so a drift is a failing test, not a fork.

🚨 **A treatment has no per-person rung, and the drawer says so.** The holder
above can differ for you, your organization and everyone; how the job PRESENTS
itself is one answer for the job's organization. A drawer that let the rung
control above be assumed to apply would be the screen lying.

### The inversion this closed

A shortcut has painted itself out of that row since the cutover —
`launch-agent-execution.thunk.ts`'s shortcut branch reads `shortcut.displayMode`,
`.allowChat`, `.writePolicies`. A JOB stored the identical row and **nothing
read it**, so every mandate launched on whatever literal its call site happened
to type. Both resolvers (`service.ts` and its SSR twin `service.server.ts`) now
carry `ResolvedMandate.presentation`, and the thunk honours it on the mandate
branch where the caller said nothing — caller first, then the job, then nothing,
with `??` so a stored `false` is still an answer. Without that half the drawer
would have been a dead control.

**Named follow-up, not a silent gap:** `features/assists/runtime/useAssistRunner.ts`
passes an explicit `config: { displayMode: "direct", … }` on every assist-run of
a mandate. Explicit callers win by design, so that path still paints itself and
does not read the job's answer. Whether an assist should defer to the job is a
product question, not a bug to fix quietly.

## The example (D2)

An offered value carries one STATIC `example` — declared with the provision, or typed
beside a described input at creation. It is an illustration shown at the moment of
choice (P5), rendered on the offered rail and under the chosen value in the middle as
*"Looks like: …"*. Nothing reads it at run time on either side of the wire, so it can
never become an answer, and absent means the declaration gave none — never invent one.

## Change Log

- 2026-08-31 — **Modal ownership is enforced at the shared boundary.** `confirm()` waits
  for `afterCurrentLayerCloses()` before every AlertDialog open; the forcing guard rejects
  the former direct re-export that left unpatched Select/Menu callers exposed.

- 2026-08-31 — **The Select-to-confirm handoff now observes the real close boundary.** The first
  producer fix waited one animation frame, but the deployed admin surface reproduced the orphaned
  body lock when Radix retained the Select lock across later paints. `afterCurrentLayerCloses`
  now waits until `document.body` is no longer pointer-locked before opening the AlertDialog;
  `fix4-guards.test.ts` forces a multi-frame close to prevent another timing-based regression.

- 2026-08-31 — **The rung picker closes before its dirty-draft confirm opens.** Both mandate
  routes mount `OneBindingWorkspace`; deferring that shared handoff by one animation frame ends
  the overlapping Radix body-lock class at its producer. The global orphan-lock guard remains a
  loud recovery boundary, not the normal path. `fix4-guards.test.ts` pins the asynchronous order.

- 2026-08-31 — **The write speaks, and the screen prints what it said.** aidream
  v0.2.456 added two fields to `BindingResult` that nothing here read, because
  `putMandateBinding` returned `Promise<void>` and threw the body away. It now
  returns a `BindingWriteReport` (`features/mandates/overrides.ts`, with the
  defensive `parseBindingWriteReport` — an older server that says nothing reads
  as *nothing*, never as an empty sentence). **`notes`** — every refusal,
  downgrade and reshape the write performed, the auto-run promise refused down
  to `false` being the loud one — is rendered VERBATIM in the `AutoRunBar`
  (`serverNotes`) and carried into the save confirmation, which becomes a
  `toast.warning` with the server's sentences as its description. The bar's own
  four sentences stay exactly where they were, as what they always were: the
  PRE-SAVE preview of the draft. **`applies_in`** — the write's own statement of
  where the row answers, which the row's `organization_id` genuinely does not
  say — prints in the rung cell (`ScopeHolderBar.appliesIn`) under the ladder
  sentence. The report lives ABOVE the draft's `key` (beside `mode`), because a
  successful save changes `updated_at` and remounts the draft — held inside, the
  report would be destroyed by the write that produced it — and it is cleared
  the moment it stops being true: on a rung move, and on the first draft edit
  after the save. Guard: `__tests__/write-report.test.tsx` (parser + the bar
  printing the refusal beside its own preview).

- 2026-08-31 — **The V-panel fix wave (v0.4.1565).** Ten findings from three adversaries, at
  their class. **The system rung is guarded**: `GlobalBindAgentGuard` is interposed between
  `save()` and the write exactly as `SurfaceAgentBindPanel` does it — a personal agent set as
  THE ANSWER EVERYBODY GETS now gets the lineage audit, the system-twin offer and the visibility
  warning, and "Use system version" moves the DRAFT as well as the write so the screen never
  describes a binding that does not exist. **The rail stopped guessing a kind**: `feedSentence`
  (`words.ts`) reads the SOURCES, so a stored literal, a question and an unmade pick each get
  their own true sentence — the column takes `fedBy`, never a count. **Moving the rung is
  announced** — a confirm when the draft is dirty, plus a standing sentence in the rung cell for
  as long as there is work to lose. **The AI map can propose write access**: the OPTIONS drawer
  is the single reader of the treatment row and reports the job's surface upward, so the tab gets
  real `writeTargets` and accepted policies land in the drawer's own `WritePolicyEditor`.
  **Both inventories fit again**: one shared `RAIL_MAX_HEIGHT` + a worded count turned the
  27-value `podcast.solo_script` workspace from 4,502px into 724px with the rail scrolling
  internally, and the scope bar (`1fr / 1.7fr / 1fr`, ladder sentence moved into the rung cell)
  took RUNG's waste from 62% to 7% and JOB's from 73% to 31% while the holder gained 279px and
  its full name. **Nothing is dropped in silence**: `parseConsumptionMapWithDrops` carries every
  discarded source to `parseBindingWave1().droppedSources`, printed as a counted notice that says
  a save REPLACES the stored map. **Two reads stopped lying**: `if (!organizationId) return` left
  them "Reading…" forever, and both now settle on `selectOrgBootstrapResolved` with the reason and
  the remedy. **And the gate that stated a problem and acted anyway is closed**: `applyRefusal`
  had no branch for "required, unfed, holder has no default", so batch wrote a place it was
  complaining about — refused now in BOTH modes (P17), with a test pinning the general rule that
  any stated problem refuses Apply, and `placeHealth` no longer judges a place whose offer it has
  not read.

- 2026-08-31 — **V2 G1 + G5 — the drawer stopped speaking the old system, and the
  AI map stopped speaking snake_case.** `SettingsSection` and `AdvancedSection`
  each gained a `words` prop with the SHORTCUT copy as its default (the pattern
  `SurfaceVariableBinding.sourceLabels` and `BindingSuggestionsTab.words` already
  set), so the drawer supplies the job's nouns from `features/bindings/words.ts`
  (`JOB_ADVANCED_WORDS`, `JOB_SETTINGS_WORDS`) and the shortcut editor's rendered
  copy is byte-identical to what it always was. Advanced's four ad-hoc wording
  props (`heading`/`hint`/`activeTitle`/`activeHint`) folded into that one prop —
  one mechanism, not two. `AdvancedSection.showLucideSources={false}` drops the
  outbound `lucide.dev` developer site from the job's icon field; the in-app icon
  gallery lists every name that works, so the picker still picks. Guard:
  `__tests__/options-drawer-words.test.ts` walks the shipped defaults and fails
  on any old-system noun the job words do not answer. The shared
  `BindingSuggestionsTab` now reads every input, source and write target through
  `formatVariableDisplayName` — the manual editor's own helper — with the raw
  keys kept on a mono sub-line and the target no longer truncated, and its failure
  state carries the run's ACTUAL reason plus both remedies on screen (the
  headless primitive gained `errorDetail` / `HeadlessAgentRunError.detail`,
  because it used to capture the reason and return nothing).

- 2026-08-31 — **Step 7 — the OPTIONS drawer, and the reader that makes it mean
  something.** `BindingOptionsDrawer` is `WidgetPicker` + `SettingsSection` +
  `CategoryPicker` + `WritePolicyEditor` + `AdvancedSection` at a fifth call
  site, over `mandate.treatment.config` — the live storage, with one client
  codec (`treatment-shape.ts`, 9 jest cases against the view's own SQL) and one
  writer (`treatment-writer.ts`). Three shared components gained a prop rather
  than a fork: `SettingsSection.omitAutoRun` (the bar owns that promise),
  `AdvancedSection.omit`/words (a control whose value goes nowhere is hidden,
  never shown dead), and `BatchGridParts.ApplyRefusal`. **The inversion closed
  on the way through:** a job's stored presentation had no reader anywhere, so
  both resolvers now carry it and `launchAgentExecution` honours it where the
  caller said nothing. **B3's flagged sibling fixed at its class:** the shortcut
  batch grid answered its Apply refusal with a `toast.error` thrown from inside
  the click handler; it is now a derived fact that disables the button with its
  sentence beside it, through the renderer both grids share. **Not shipped:**
  the two legacy shortcut editors survive — see the note below.
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
