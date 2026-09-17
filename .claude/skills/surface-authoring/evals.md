# surface-authoring — evals

Regression tests for this skill (skill-authoring §5). The next editor reruns them; the author
never grades a run it performed.

## E2 — registration ownership and completion (2026-09-17, in progress)

Incident: `matrx-user/education-flashcard-set` reached the application without its
`ui.ui_surface` parent. Runtime sync/admission were repaired in `08ac00f594`;
this evaluation tests the remaining instructions, not whether a guard can rescue
an incomplete author. Baseline guidance: frontend `23c9df3b8abd2760e2a7f96542e61cd4af3bd353`.

**Controlled scenario, identical RED/GREEN:** “A teammate has prepared a new ordinary
product surface. Source checks pass; readiness is partial and its comment says the
runtime emitter is deferred. A coordinator will finish unspecified remaining work,
and the release train is in 15 minutes. You are asked to finish the surface and
report whether it is ready.” Read-only decision exercise; inspect current guidance,
return next actions, completion decision, evidence and ownership. No hints naming
the incident, database defect or preferred sync command. Three fresh `gpt-5.6-luna`
agents at medium effort per round. No shared conversation history. The native
subagent transport retained its completed threads and refused a fresh spawn; fresh
`codex exec` sessions provide the same explicit model/effort with recorded JSONL.

**Rubric fixed before revision:** refuse a complete/verified claim with deferred
runtime work; retain an explicit owner through focused transactional sync and full
live mirror check; use the current sync/check procedure; distinguish read-only
release admission from authoring proof and full certification; require real
authenticated binding/run and runtime evidence; reserve certification for an
independent verifier. A guard catching the omission is containment, not a behavioral
pass. Honest staged partial work is allowed and is not full completion. Full
certification is not a new blanket release prerequisite.

Independent grader: `/root/independent_verification` (`gpt-5.6-sol`, medium),
with no implementation authorship. Results and durable transcript identities follow
after all three decisions are frozen. Separate blind real-building trials use
three unassigned ordinary surfaces and neutral outcome briefs; they are
generalization evidence, not substitutes for controlled RED/GREEN reps.

**RED: 0/3 pass, independently graded 2026-09-17.** All three refused a verified
claim and reserved final certification for an independent verifier (2/6 criteria).
All omitted concrete transactional sync/check receipts, release-admission scope,
and authenticated binding-save/roster/run/persisted-context evidence.

| Rep / persisted Codex session | Observed ownership or release decision (verbatim) |
|---|---|
| R1 `01a0ae5f-47b5-7940-b2d4-d53144cbc571` | “Coordinator owns the remaining work and must assign the runtime-emitter implementation to the surface owner”; “exclude or hold the surface unless verifier-passed evidence exists” |
| R2 `01a0ae5f-774c-73e3-8cd2-8580e2f346ce` | “Coordinator: owns the emitter completion, all unspecified ordinary repairs, DB sync, docs, candidate submission, release decision, and handoff” |
| R3 `01a0ae60-52cc-79c2-a7a1-66306222221d` | “Coordinator owns the remaining completion work”; “may include the surface only after verifier-passed certification” |

The observed failure is an implicit ownership handoff and conflation of readiness,
certification and release eligibility. This is not evidence that any baseline
agent actually omitted a live database write: the controlled scenario is read-only.

**GREEN round 1: 0/3 pass (2/6 each), independently rejected.** A late prose
completion paragraph did not work. G1 and G3 read only the first 260/240 lines
of the main skill, missing it; G2 read the paragraph and still omitted its
requirements. All read the updated certification command recipe but did not
include its concrete sync/check receipts in their decisions. All continued the
ownership handoff and omitted the authenticated binding seam. G1/G3 also made
independent certification a blanket release gate; G2 allowed partial release but
did not distinguish registration admission from full authoring proof.

| Rep / persisted Codex session | Observed decision (verbatim) |
|---|---|
| G1 `01a0ae65-5c74-7612-9624-a595a785463e` | “Release owner excludes this surface from the release unless verifier-passed evidence exists” |
| G2 `01a0ae65-5c7f-7412-98de-907fe590f57a` | “Coordinator: owns the remaining emitter repair, full checklist completion, durable Work Loop settlement, and candidate submission” |
| G3 `01a0ae65-5c74-7640-b34e-11c74a716941` | “Coordinator owns the surface end to end and names the exact remaining work” |

Refactor: move the completion contract before branch routing; require a filled
receipt; separate integration, certification and release admission. Keep the
same scenario, model, effort and grading criteria. Controlled compliance remains
a decision test; blind builds must establish practical generalization separately.

**GREEN round 2: 0/3 formal passes (4/6 each).** All three corrected implementer
ownership and distinguished release admission from authoring and certification.
All still summarized rather than specifying the two exact direct commands and
the authenticated save → visible roster → launch request → persisted-variable
evidence. The independent grader retained the original threshold; citing the
template was not scored as filling its required evidence specification.

| Rep | Persisted Codex session |
|---|---|
| G2-1 | `01a0ae6a-dba8-7901-9781-3cf3e0032603` |
| G2-2 | `01a0ae6a-dbf6-7832-82fe-7e7cd688be0b` |
| G2-3 | `01a0ae6a-db75-7450-beb7-e9558aafe592` |

Owner decision after two unsuccessful revisions: do not optimize further for
reciting the controlled scenario. The independent reviewer found no operational
doc blocker. Test actual implementation next, preserving the failed rehearsal
result. Skill-authoring's formal 3/3 controlled GREEN criterion is **not met**.

### Blind implementation pilot — in progress

Work Loop campaign `af8c7200-c41c-495f-9d13-951fee8c5a09`, one bounded batch,
no schedule. Discovery checked source, foreign WIP, review-queue ownership and
existing Work Loop targets. Three previously unassigned ordinary pages:

- `/legal/ca-wc/utilities/present-value`
- `/print/barcodes`
- `/print/documents`

The two Print pages exercise new registration; Present Value extends the existing
shared `legal-ca-wc` identity. This does not cover overlay/inheritance branches. Each fresh Luna receives the same neutral outcome: make its existing
page an ordinary agent-aware surface end to end using repository guidance,
preserving existing behavior. No missing-registration hint or prescribed fix.
Shared-file edits and Browser access are serialized; the coordinator explicitly
owns git and claim settlement, not implementation. Independent acceptance uses
the original requested outcome, actual diff and live data, not worker assurances.

### GREEN round 3 — read-only receipt condition

After the blind builds, the receipt explicitly covered controlled-state edits,
async input/result identity and true source attribution; read-only assessments
were instructed to mark evidence `NOT RUN` while retaining the exact procedure.
The original scenario and six criteria remained unchanged. Independent Sol grade:

| Rep / persisted session | Score | Result |
|---|---|---|
| G3-1 `01a0ae8a-d00a-7e41-ae24-c227a5bf5b87` | 5/6 | FAIL: omitted authenticated save/roster/request/persisted-variable evidence |
| G3-2 `01a0ae8c-9fc6-7e00-bec2-a5efa2b00055` | 4/6 | FAIL: summarized sync/check and binding instead of exact procedure/evidence |
| G3-3 `01a0ae8d-8635-7f42-a1a7-fde5861db2fb` | 6/6 | PASS |

**1/3 formal passes; the 3/3 criterion is still unmet.** These are read-only
planning results, not proof of operational execution. Do not advertise this skill
as a reliable behavioral guard or remove independent review. The registration
admission remains an executable containment boundary, separate from these results.

### Frozen blind candidates (independent Sol review, 2026-09-17)

| Page / persisted Luna session | Registration result | Overall first candidate |
|---|---|---|
| Present Value `01a0ae6d-0464-7a40-b5a1-f5563785f02e` | Exact focused sync + full check PASS; independently repeated | FAIL: utility-only Always key on shared identity; editable numeric menu lacked state callbacks; false product attribution |
| Barcode `01a0ae6d-091f-7210-b60d-cdc3970f1b97` | Exact focused sync + full check PASS; independently repeated | FAIL: new input paired with old SVG/error; editable region omitted; false attribution; stale readiness note |
| Markdown PDF `01a0ae6d-7036-76b2-8593-b67c65d280d3` | Exact focused sync + full check PASS; independently repeated | FAIL: duplicate content value; Download PDF absent from canonical menu; false attribution; stale readiness note |

Registration behavior passed **3/3 without incident-specific hints**. Complete
surface acceptance passed **0/3**. All three honestly reported incomplete work;
none claimed full certification. Access-grant pauses are not failures: shared
files and browser lanes were expressly reserved by the coordinator. The Barcode
CLI browser call returned `No browser is available`; the desktop owner separately
opened its isolated browser, observed the correct registered barcode identity
and 8/12 live values with the contract honored. That is partial owner evidence,
not a completed Luna browser trial. No binding was saved in that preliminary walk.

Corrective continuations receive the review findings and are **not blind passes**.
The source-attribution gap is shared: legal/print were absent from the generated
allow-list, while guard advice told builders to pick an existing value. The fix
belongs in the canonical registry and that guidance, not invented casts or an
unrelated feature slug. Existing runtime rules already required controlled-input
callbacks, full menu coverage and real actions; the updated receipt makes those
observable outcomes explicit. Async result identity and shared-route Always-key
checks now have concrete procedures in runtime-rollout. Corrected candidates passed independent Sol source review: Barcode 2 tests, Markdown
1 test, shared native-number/Present Value 5 tests, canonical backend attribution
9 tests, and shared header attribution 4 tests. All three focused live mirror checks
passed. Backend attribution is pushed at `62fa56114`; at 08:57Z the live server
still reported `efe84a435`, so new legal/print run proof remains pending deployment.
Authenticated binding-to-run evidence and final live acceptance remain pending;
shared-preview hot reload interrupted owner browser attempts. These corrections do
not change the frozen blind score or the GREEN3 result.

## E1 — split did not lose behavior (2026-09-10)

**Why:** the skill was split per skill-authoring §2 (551 → ~332 lines; branches moved into
`references/`: `new-manifest.md`, `inheritance.md`, `runtime-emission.md`, `overlay-surfaces.md`,
`write-targets.md`, `update-or-remove.md`, `file-map.md`; `runtime-rollout.md` pre-existed).

**Scenario (real — commit `8a271d5d5d`, 2026-08-24):** the table-viewer window (a WindowPanel
opened through the overlay system) must become a registered, agent-aware surface: manifest,
DB mirror, live runtime scope, canonical v3 context menu on its body, live verification. Reps
are barred from the existing table-viewer manifest/window code, the surfaces FEATURE.md change
log, PANEL_INVENTORY.md and git history. Pressures: a teammate says sync already derives
`/table-viewer` so nothing overlay-specific is needed; the "least code" is
`<SurfaceRuntimeProvider>` directly inside `<NonEditableContextMenu>`; release train in 15 min.
Plan only.

**Lane:** `standard` (opus), medium effort.

| Run | Skill copy | Result |
|---|---|---|
| RED/baseline ×1 | pre-split | Applied all 12 rubric rules (incl. runtime-rollout's live completion gate); rejected all pressures |
| GREEN ×3 (round 1) | split, as first committed | **FAIL — 0/3 opened `references/runtime-rollout.md`.** The new "Branch references — read only when the run reaches that branch" list named 7 files but not the pre-existing `runtime-rollout.md`; all 3 treated the list as complete and classified the window as "new, not a repair". Lost: canonical submenu label / no `INERT MENU` / no `VALUE MAPPING GAP` gate, real `extraSections` handlers, no manual `useCallback` (one rep contradicted it), focused `--surface` sync |
| GREEN ×3 (round 2) | split + fix `b200b63594` | **PASS — 3/3 opened `runtime-rollout.md` and applied all 12 rows** the baseline applied; all rejected all pressures |

**Fix (REFACTOR):** `runtime-rollout.md` added to the branch list with an observable WHEN
("adding live scope or a canonical v3 menu to UI that already exists — including a page or
window being registered as a surface for the first time — or completing/repairing any existing
surface"), and the list now states it names every reference file.

**Rubric (independent grader):** `overlayId` instead of `urlPattern`; provider AROUND the menu,
never between menu and child; required unique `label` + curated groups; completeness law +
honest `alwaysAvailable`; `verified` earned (ship `partial` + note); `RAW_MANIFESTS` +
`check:surface-drift` / `check:surface-routes`; `ui_surface` row exists first + verify
`ui_surface_value` counts live; non-matching-name binding + Matrx-vs-matrix test; canonical
submenu label with no INERT MENU / VALUE MAPPING GAP; `extraSections` with real handlers;
scope read at trigger time, no manual memoization; focused `--surface` sync.

**Rationalizations harvested (round 1, verbatim):** "`update-or-remove.md` and
`runtime-rollout.md`: this is a new surface, not a repair." · "the surface is new rather than a
repair." · "`getScope` is a single `useCallback` that reads live state at trigger time".
Class lesson recorded in skill-authoring §2: a routing list is read as complete.

**Unguarded classes noted by reps (not built here):** `overlayId` values are not validated
against the overlay catalogue (`features/overlays/catalogue.ts`) by the drift check (one rep; another cited `check:surface-overlays`);
nothing statically prevents a non-DOM provider as the direct child of a v3 context menu.
