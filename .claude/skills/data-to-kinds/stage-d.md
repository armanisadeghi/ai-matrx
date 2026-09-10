---
type: Reference
title: "data-to-kinds — Stage D (Cutover)"
description: "The Stage D (Cutover) procedure: field-read proof, emitter repoint, hidden consumers, history plan, legacy convergence, guard; read it when you are Stage D of a run. Companion to the data-to-kinds skill."
tags: [data-to-kinds, skills, stage-d]
timestamp: 2026-09-10T00:00:00Z
---

# Stage D — Cutover (convert what emits and consumes the family)

> 🚨 **BEFORE YOU CUT OVER, RUN THE PROOF: the `safe-cutover` skill.** Arman's bar (2026-08-23):
> a cutover ships only when tests guarantee it "cannot cause errors from any of the many paths
> that it can be triggered from." That skill owns the general discipline — enumerate every
> trigger path with evidence, close every gap, derive tests from live definitions, stage on a
> branch, report a plain safe-or-not verdict. The steps below are the KIND-SPECIFIC additions to
> it, not a replacement for it.


0. **MEASURE THE FIELD READS — a consumer list is not a breakage surface** (learned the hard
   way, search family, 2026-08-25). `kind_consumers.py` answers **who** consumes a kind. It
   cannot answer **which fields they read**, and field reads are the ENTIRE breakage surface of a
   shape swap. A workflow stores `{"items": "results"}` in an edge mapping and
   `"- {title} ({url}) [{age}]"` in a template: rename a field and it still parses, still runs,
   still reports success — and silently renders nothing. Nothing fails. That is the worst
   possible failure mode, because no error ever appears.
   - Read every field reference out of the LIVE `workflow.definition` rows (all spellings of
     every producing node), plus templates, edge mappings, accessors and agent prompts, and judge
     each against the POST-cutover model. Verdicts are `SAFE` / `BREAK` / `UNPROVABLE` — and
     **`UNPROVABLE` blocks the cutover exactly like `BREAK`**. There is no "probably fine", and
     no fuzzy name matching (`description` → `snippet` is a BREAK, not a rename you can assume).
   - Worked pattern: `aidream/scripts/check_search_cutover_safety.py`. Its first measured verdict
     was **23 references · 7 safe · 13 BREAK · 3 unprovable across 3 ACTIVE workflows** — a
     cutover that every consumer-level check had called ready.
   - Ship this as a committed guard for your family, and put the verdict in the ledger. **A
     cutover with any BREAK or UNPROVABLE row does not ship; it becomes the fix list.**
1. **Repoint the emitters**: the graph actions / tools / services that produced the raw
   passthrough now call the ONE engine → adapter → kind (`output_kind=<slug>`), with
   `include_raw=` for projection 2 and the AI view made at the tool boundary (projection 3).
   Live nodes verify `output_kind` against the registry schema every run (`output_kind_ok`), so
   a collection-schema supersede MUST ride the same change as the repoint (the search pilot gates
   it behind `seed_search_kind_family.py --cutover`). Delete the passthrough models
   (`extra="allow"` raw bags) — no shims.
2. **Convert the consumers grep cannot see.** Walk the Stage A step 0 list and tick every one:
   `agent.mandate` rows declaring the old slug (246 mandates declare an `output_kind` — they live
   in DATA, not code); stale ACTIVE `source='db'` `kind_component` rows, which silently OVERRIDE
   the new canonical component (this bit the search pilot — deactivate with a note, never delete);
   `workflow.trigger` rows that fire on the kind. A cutover that only changed code is not done.
3. **State the history plan — mandatory, never silent.** Superseding a schema can invalidate rows
   already persisted under the old shape and can break Hindsight REPLAY of past runs. Choose and
   record one in the ledger: backfill the old rows, version-pin them to the superseded schema, or
   accept-and-record the loss with the measured row count. Silence here is how we lose the past.
4. **Converge the legacy displays** onto the kind components (the data-event blocks the survey
   found) and delete what they replace; regenerate `.gen.ts` for the now-live collection.
5. **Leave a guard behind (this is what makes it permanent).** A passing adversarial sweep proves
   the past; a committed guard prevents the future. Add `scripts/check_<family>_kinds.py` on the
   house pattern — `scripts/check_kind_marker_law.py` is the reference (static leg over source +
   live leg over the DB + a blessed allowlist) — so a new raw-passthrough consumer fails the
   build. The platform has 67 of these; yours is not special.
6. **Gate: Arman approves cutover.** One real run through the converted node, rendered on the run
   page; ledger updated; **conversion board row moved to G5**; push.
