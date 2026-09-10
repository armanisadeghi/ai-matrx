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
   - Ship this as a committed guard for your family by adding a `FAMILIES` entry to the
     parameterized `aidream/scripts/check_kind_cutover_safety.py --family <family>` (`--self-test`
     plants a BREAK and a SAFE) — never a per-family copy of the search script (gap #52). A
     whole-output passthrough still comes back UNPROVABLE and must be human-read; record the read
     and its verdict in the ledger (gap #52). Put the verdict in the ledger. **A
     cutover with any BREAK or UNPROVABLE row does not ship; it becomes the fix list.**
> 🚨 **UNRESOLVED CONFLICT — `CFL-054`. Do not build against this section until Arman rules.**
> **This document says:** the repointed emitters serve a result's second view as the raw provider payload, returned only when a caller asks for it (`include_raw=`).
> **[`SKILL.md`](/skills/data-to-kinds/SKILL.md) (vocabulary, "the three projections") says:** the same — the raw payload on demand, off by default.
> **[`open-gaps.md`](/skills/data-to-kinds/open-gaps.md) (the item on the second projection) says:** the second view should be what the current live path produces from the same input, shown beside the kind, going quiet once the cutover lands.
> **Why it matters:** it decides what the repointed emitters must serve — the untouched provider data for inspection, or the old output for comparison that disappears after cutover.
> **Your move:** bring Arman these two readings and the consequence, get his ruling, then build.
> Register: [`/operations/conflicts.md`](/operations/conflicts.md) · `CFL-054`

1. **Repoint the emitters** — on the staged change; nothing below reaches main, the registry, or a
   deploy before step 6.2: the graph actions / tools / services that produced the raw
   passthrough now call the ONE engine → adapter → kind (`output_kind=<slug>`), with
   `include_raw=` for projection 2 and the AI view (projection 3) declared ON THE KIND as
   `@kind(..., ai_view=(...))` and applied at the one prompt door `matrx_ai.config.prompt_values` —
   never made at the tool boundary (SKILL.md Vocabulary: Arman's 2026-08-24 ruling supersedes it).
   Live nodes verify `output_kind` against the registry schema every run (`output_kind_ok`), so
   a collection-schema supersede MUST ride the same change as the repoint (the search pilot gates
   it behind `seed_search_kind_family.py --cutover`). Delete the passthrough models
   (`extra="allow"` raw bags) — no shims.
2. **Convert the consumers grep cannot see.** Walk the Stage A step 0 list and tick every one:
   mandate rows declaring the old slug — they live in DATA, not code. `agent.mandate` no longer
   exists; query `mandate.definition` (output side) joined to `mandate.provision` (input side):
   `select d.mandate_key, d.output_kind, p.derived_input_kind from mandate.definition d left join
   mandate.provision p on p.provision_key = d.provision_key and p.deleted_at is null where
   d.deleted_at is null and (d.output_kind = '<slug>' or p.derived_input_kind = '<slug>');`
   (measured 2026-09-10: 299 of 689 live mandates declare an `output_kind`); stale ACTIVE `source='db'` `kind_component` rows, which silently OVERRIDE
   the new canonical component (this bit the search pilot — deactivate with a note, never delete);
   `workflow.trigger` rows that fire on the kind. A cutover that only changed code is not done.
3. **State the history plan — mandatory, never silent.** Superseding a schema can invalidate rows
   already persisted under the old shape and can break Hindsight REPLAY of past runs. Choose and
   record one in the ledger: backfill the old rows, version-pin them to the superseded schema, or
   accept-and-record the loss with the measured row count. Silence here is how we lose the past.
4. **Converge the legacy displays** onto the kind components (the data-event blocks the survey
   found) and delete what they replace — on the staged change. Regenerate `.gen.ts` for the
   collection once step 6.3's registry publish has made it live.
5. **Leave a guard behind (this is what makes it permanent).** A passing adversarial sweep proves
   the past; a committed guard prevents the future. Add `scripts/check_<family>_kinds.py` on the
   house pattern — `scripts/check_kind_marker_law.py` is the reference (static leg over source +
   live leg over the DB + a blessed allowlist) — so a new raw-passthrough consumer fails the
   build. The platform has 67 of these; yours is not special.
6. **Gate: Arman approves cutover — on STAGED evidence, before anything goes live.** The order is
   fixed by rules this skill already holds: `safe-cutover` law 5, *"Stage, don't ship. The cutover
   lands on a branch, fully green, and waits for the human"*, and its step 6, *"The branch merges
   only on their word"*; SKILL.md standing rules, *"live nodes/services/routes repointed only in
   Stage D after approval."* Run it as this sequence, each step observable:
   1. **Staged, NOT live.** Steps 0–5 are done on the staged change: D.0 verdict with zero BREAK
      and zero UNPROVABLE; the `safe-cutover` proof (inventory, per-path tests, a real end-to-end
      run with the cutover applied on the branch, outputs diffed); the publisher's DRY-RUN plan for
      the supersede (no `--apply`); the guard green. Check: main carries no repoint commit and the
      family's `content_ir.kind_definition` rows still show their pre-cutover `version`.
   2. **Arman approves on that staged evidence** — the `safe-cutover` step 6 report in chat, ending
      "safe to cut over" or "not yet, because X". Record his words and the date in the ledger's
      decisions section. "Not yet" sends you back to the fix list.
   3. **Only then: merge/push the repoint to main AND run the registry publish** (`--apply`, with
      `--breaking` / `--cutover` where step 1 requires) — as the one change step 1 demands — then
      regenerate `.gen.ts` (step 4) and wait for the deploy to carry the repoint live.
   4. **One real run through the converted node, rendered live on the run page.**
   5. **Ledger updated; conversion board row moved to G5; push.**

   **No registry `--apply` / `--breaking` publish, no merge to main of the breaking repoint, and no
   deploy of it happens before 6.2.** The only pushes allowed before approval change nothing live:
   the D.0 guard's `FAMILIES` entry (step 0, *"Ship this as a committed guard"*) and ledger records
   (SKILL.md standing rules, *"a ledger row is only true once on origin/main"*).
