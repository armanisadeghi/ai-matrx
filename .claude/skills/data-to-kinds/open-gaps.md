---
type: Reference
title: "data-to-kinds — Open gaps"
description: "The SDK wishlist and the dated friction logs from every replication run, each carrying the rule it earned; every stage reads ALL of it before its first step (most items bind a stage without naming it), and appends new friction here. Companion to the data-to-kinds skill."
tags: [data-to-kinds, skills, open-gaps]
timestamp: 2026-09-10T00:00:00Z
---

# Open gaps (SDK wishlist — replication agents append friction here; the SDK build consumes it)

## Contents

- Items 1–5 — SDK wishlist (top of file, before the first friction heading)
- Friction from replication run 1 — scraper family (2026-08-23, ledger `operations/scraper-kinds-run.md`)
- Friction from replication run 1, round 2 — building the models (2026-08-23)
- Friction from replication run 1, round 2 — the gate itself was wrong (2026-08-24)
- Friction from replication run 2 — rank / SERP-landscape family (2026-08-24, ledger `operations/rank-kinds-run.md`)
- Friction from running rows 2, 3 and 4 back to back (2026-08-24)
- Friction from replication run 3 — RAG retrieval + citation family (2026-08-24, ledger `operations/rag-kinds-run.md`)
- Friction from replication run 4 — tabular family (2026-08-25, ledger `operations/table-kinds-run.md`)
- Friction from the first joint Stage V+D pass — rank / RAG / table (2026-08-26)

**Citing an item — some numbers occur twice.** Items 14–19 appear in both the 2026-08-23 *building
the models* section and the 2026-08-24 *the gate itself was wrong* section, and item 20 appears in
both that 2026-08-24 gate section and the rank run 2 section. Numbers are never reassigned (ledgers
already cite them). Cite a duplicated number with its section: `#14 of 2026-08-23` / `#14 of
2026-08-24` (through #19), `#20 (gate)` / `#20 (rank run 2)`. Existing citations resolve as: this
skill's `gap #14 of 2026-08-24` and `gap #16 of 2026-08-24` → the gate section;
`operations/scraper-kinds-run.md` "Open gap 14 / 15 / 16 / 18 / 19" → the 2026-08-23 section;
`operations/rag-kinds-run.md` "gap #20" and `operations/table-kinds-run.md` "Open-gaps #20" →
`#20 (rank run 2)`. A new item takes the next unused number (53 at this writing), never a reused one.

1. **Codegen after publish — GUARDED 2026-08-23; one gap left.**
   *Closed:* a stale `.gen.ts` can no longer merge unnoticed. `pnpm check:kind-types` is a
   matrx-frontend release gate in both lanes of `scripts/run-release-gates.sh` (blocking under
   `--strict`; 12/12 files clean, so there is no backlog to grandfather), it diffs every
   committed file against live `content_ir.kind_definition`, and the fix it prints is
   `pnpm shape:types <kind>` — never an edit to a generated file.
   `scripts/shape/activate-kinds.ts --apply` regenerates immediately after it bumps `version`,
   and `publish_kind_catalog.py --apply` prints the regeneration command plus the gate it will
   trip whenever it writes.
   *matrx-extend is a different problem than this item claimed.* It needs no generated `.gen.ts`
   files: it has zero kind references in `src`, and it already pulls aidream-generated API types
   automatically at release (`release.sh` step 3 → `pnpm update-api-types`). What it actually does
   is RECEIVE kind data and throw it away — `render_block` envelopes land in the "log only" branch
   at `src/hooks/use-chat-stream.ts:569` and `metadata.__ir` is never read. So the fix is adopting
   `@ai-matrx/content-ir` + `@ai-matrx/content-ir-react`, and it is **blocked on publishing the
   render layer**: the kernel is on npm at 0.2.0, `@ai-matrx/content-ir-react` 0.1.0 is not (404),
   and matrx-frontend's own repoint waits on the same tag. Gate verified green 2026-08-23. Tracked
   as item 3 of `operations/kind-conversion-board.md`; never re-implement a reader in the client.
   *Still open:* the gate runs at RELEASE, not pre-merge. matrx-frontend has no CI at all, and
   the generator authenticates over Supabase REST (`NEXT_PUBLIC_SUPABASE_URL` +
   `SUPABASE_SECRET_KEY`), which aidream's CI does not hold — its `kinds-parity` job already
   checks out matrx-frontend and could run this too if those two secrets were added. That is
   Arman's call, not an agent's.
2. **Compiled `KindSchema` mirrors are hand-written** (Stage B.3) — the SDK should emit them from
   `emitted_json_schema` like the `.gen.ts` files.
3. **No `kind_component` pre-flight in the publisher** — the stale-override sweep (Stage B.1) is a
   manual SQL step. Publisher should diff-and-report slug collisions and active db overrides.
4. **The search family still rides its legacy seed script** (`seed_search_kind_family.py`,
   `SearchKindModel` predates `KindModel`) — fold into `@kind` + `publish_kind_catalog.py` at
   cutover.
5. **Demo page + endpoint are copied by hand** from the search pilot — a scaffold
   (`<family>` → router, service, page.dev.tsx) would make Stage A.9/B.7 a command.

## Friction from replication run 1 — scraper family (2026-08-23, ledger `operations/scraper-kinds-run.md`)

6. **Stage A.0 never says the consumer script's code leg is a substring grep.** `kind_consumers.py
   scraped_page` returned **91 blocking** consumers; hand-classified, **7** were real and ~81 were
   the unrelated identifier `scraped_pages` (a research-resource variable), plus 8 hits inside a
   scratch dump at `aidream/tmp/code_context_output/*.txt` that the walker does not exclude.
   **Rule now: paste the script output, then hand-classify the code hits into true consumers vs
   substring collisions and record BOTH numbers.** A raw blocking count is not a blast radius.
   (Script fixes owed: word-boundary matching, and skip `tmp/`.)
7. **`category` is a decorator argument, not a column — say so.** `@kind(..., category="data")`
   exists and accepts `data`|`runtime` only; it lands in `metadata->>'category'`, and
   `content_ir.kind_definition` has **no `category` column**. Measured live: `data`, `pure` and
   `null` all occur, so a registry query cannot filter on it reliably.
8. **A.3 "check what already exists" ships no query** — every other step gives a command. Use:
   ```sql
   select kind, label, is_active, version, metadata->>'maturity' as maturity,
          metadata->>'family' as family
   from content_ir.kind_definition
   where deleted_at is null and (metadata->>'family' = '<family>' or kind ~ '<regex of your nouns>')
   order by 6 nulls last, 1;
   ```
   Expect `maturity` and `family` to be **null** on most curated kinds — the tier vocabulary
   covers the SDK-minted rows only, so "check the registry" cannot be done by maturity alone.
9. **The additive supersede is the most valuable move available and is unwritten.** Superseding a
   live ACTIVE slug where **every legacy field stays untouched and every new field is
   optional-with-default** passes the BACKWARD gate, ships with `--evolve`, and needs **no cutover
   gate** — because live node verification still passes. The skill only describes cutover-gated
   supersede and `--breaking`. **Standing rule: when distilling a slug a live consumer already
   holds, try the additive supersede FIRST and only escalate if a legacy field must change
   meaning.** It turned a 91-consumer blast radius into a no-op for this family.
10. **Fixtures: no naming rule and no size rule for a FIRST-PARTY engine.** The template
    `fixtures/<provider>_<archetype>.json` assumes an external provider; our own engine has none
    (used `scraper_<archetype>.json`). And real captures of a rich engine are **megabytes** — 12
    fixtures = 3.1 MB committed, one Wikipedia page = 1.5 MB. The skill must say whether that
    belongs in git and what may be trimmed (it must NOT be the sections under test).
11. **Engine results are not JSON.** "Save each raw response as a test fixture" assumes a JSON
    API. A first-party engine returns live objects (`organized_data`), `bytes` (`raw_body`), and
    ints past `Number.MAX_SAFE_INTEGER` (`hashes.simhash` = 19 digits — it **must** become a
    string in the kind or every JS consumer corrupts it). **Rule: capture through a declared
    encoder and record in the ledger what could not be serialized and why.**
12. **No capture harness.** Stage A.1 was a throwaway script written from scratch (as Stage A.9's
    demo page was, per wishlist #5). One `scripts/capture_kind_fixtures.py <module:callable>
    <archetypes.json>` would make A.1 a command instead of an invention.
13. **Nothing says what to do when the thing you are distilling is BROKEN.** This run found
    `scraper.crawl_site` failing 100% of the time (it passes three kwargs the engine does not
    accept). "Parallel path until approval" says do not touch live nodes; defect-ownership says
    fix what you find. **Rule now: file it with evidence, name it in the ledger's findings, and
    hand the repair to Stage D so the node is edited exactly once — do not fix a live emitter in
    Stage A.**

## Friction from replication run 1, round 2 — building the models (2026-08-23)

14. **The source can change UNDER YOU mid-run, and a stale measurement becomes a false drop
    reason.** A peer landed a parser fix (AD192) between the capture step and the adapter step
    here, turning a measured "this field is always null on 7 of 7 captures" into a lie that was
    already written into the DROPPED register as its justification. **Rule: re-verify every
    measured finding against LIVE code immediately before it becomes a drop reason, and
    re-capture the fixtures if the engine moved.** In a shared checkout this is normal, not
    exceptional.
15. **FIXED 2026-08-23 — the compatibility gate no longer refuses a `default` on `__kind`.**
    It used to: `_field_compatible` compared non-`$ref` fields by literal equality after stripping
    only `description`/`title`/`examples`. Every `@kind` model emits `{"const": …, "default": …}`
    for `__kind`; a live row patched by the `__kind` campaign has `{"const": …}` with no default,
    so the gate reported "changes the type/constraints of field '__kind'" when nothing about
    validation had changed — and forced every distillation of such a slug through `--breaking`,
    which hid any REAL break behind a flag the author already had to pass. The fix
    (`matrx-graph/matrx_graph/content_ir/sdk.py`) adds `_ANNOTATION_KEYS = {"default"}` and a
    `_compat_normalize` used ONLY by `_field_compatible` / `compatibility_verdict`: `default` is a
    pure annotation (JSON Schema 2020-12 §9.2), so it cannot make an old payload stop validating
    in either direction. Deliberately NOT folded into `_COSMETIC_KEYS` — drift detection
    (`_structurally_equal`) still sees a changed default, so the update is still planned and never
    silent. `required` membership is untouched and exactly as strict as before. Measured on
    `scraped_page`: 11 phantom "type/constraints" reasons before, 0 after, while the genuine
    `additionalProperties:false` tightening is still reported. Tests: `test_kind_sdk.py`
    (`test_kind_marker_default_no_longer_forces_a_breaking_publish` plus a planted failure proving
    a re-slugged const and a type change are still refused).
16. **Stage A publishing BREAKS matrx-frontend's release gate, and the skill puts the fix in
    Stage B.** The publisher re-versions rows, and `pnpm check:kind-types` fails from that moment
    — a red gate in a repo Stage A never opens. **Rule: Stage A finishes with
    `pnpm shape:types` + commit `features/content-ir/kinds/generated/kinds.generated.ts` in
    matrx-frontend.** The publisher already prints this; the skill should too.
17. **Arman will ask to SEE the data before approving the shape — and Stage A has no page.** The
    stages assume he rules on tables, then Stage B renders. In practice the sane order is the
    reverse, so Stage A needs a data-review page: kept / hidden / raw as tabs, no canonical
    components. Three undocumented things stand between you and a working link:
    `/demos/*` is PARKED unless the preview server runs as
    `MATRX_PREVIEW_PROFILE=user pnpm preview:start`; the frontend calls PRODUCTION aidream unless
    `localStorage["matrx.apiConfig.v1"]` sets `{"activeServer":"localhost"}`; and the browser
    needs a session from `/api/dev-login?token=$DEV_LOGIN_TOKEN&next=/demos/<family>`.
18. **THE SHOW-WHAT-YOU-HIDE LAW (Arman, 2026-08-23 — standing, all families).** *"On anything at
    all that you choose to remove or ignore, on the first demo that I see, you still have to
    capture them, and you have to render them for me in a separate tab so that I can see exactly
    what we are hiding from the user."* A DROPPED register that lists key names cannot answer
    "should this be dropped?" — only the data can. **Every adapter's DROPPED register must record
    the VALUE (bounded preview + honest full size) beside the reason, and every family's first
    demo must have a tab that renders them.** The mechanism is NOT yours to write:
    `matrx_graph.content_ir.audit` holds the ONE `KeyAudit`/`DroppedValue`, and
    `audit.check(section, raw, MAPPED, DROPPED, path_prefix=…)` does both legs — unknown keys
    scream, present drops are captured with value + bounded preview + honest size. Generic
    string→structure helpers are `matrx_graph.content_ir.translate`. **Never copy either into a
    family**: the search and scraper copies had already drifted when they were promoted
    (2026-08-24). Consumer reference: `aidream/services/search_kinds/FEATURE.md`.
19. **A drop is not the only way to lose data — and the thing our own pipeline strips can be the
    most valuable thing on the page.** Arman on the scraper's noise remover: *"in some cases we
    have good stuff that ends up in here… when we're trying to analyze an 'owned' site for SEO,
    the things the scraper hides or considers noise are the things YOU MUST see because they're
    your call to action."* **Rule: when a source reports what IT discarded, that report is
    first-class data for a power-user/admin surface, never plumbing to drop.**

## Friction from replication run 1, round 2 — the gate itself was wrong (2026-08-24)

14. **THE STAGE A GATE IS WRONG, AND THIS IS THE BIGGEST FINDING OF THE RUN.** The skill ends
    Stage A at *"Arman approves the registered set"* — tables, models, a JSON-returning endpoint.
    He cannot rule on that. Arman, 2026-08-24: *"when I look at the data structure, what I look
    for is to see what UI we can build from it. Without a UI, it's hard for me to know if what
    we're getting is useful or not. The usefulness of it comes from what we're able to display."*
    **Rule now: there is ONE approval gate, and it is on the RENDERED demo.** Stage A still
    distills, registers and endpoints; it does NOT stop to collect an approval on tables. Ship
    Stage B's components, then bring him the demo. Tables are how you show your work when he
    asks, not the thing he signs.
15. **The demo's primary tab must render through `KindInstanceRender` from the FIRST showing.**
    A JSON inspector is not a demo — the search pilot's demo was *"a beautiful and masterful
    display of kind components"* and the scraper's first showing was *"a bunch of garbage JSON
    fields that are just spitting data out."* The comparison is the standard.
16. **The activation chicken-and-egg is undocumented and cost a full cycle.** `GeneratedKindSlug`
    contains only ACTIVE kinds, so `pnpm shape:types` does not emit types for a family you just
    published — but activation needs a `kind_component` row, and the components need the types.
    **The real order, which the skill must state:** publish INACTIVE → land the `kind_component`
    rows (they need only a `component_key`, never compiled code) → re-run the publisher to
    ACTIVATE → `pnpm shape:types` → now write the components against real types. Stage B's
    current step order (types first) only works for a family that is already active.
17. **`generic_structured` blocks activation and must be retired in the same migration.** A slug
    whose only active `role='output'` row is the generic viewer fails the render gate with a
    message saying so. The component migration deactivates it (never deletes) before inserting
    the real row — the fallback law, applied.
18. **A DROP REASON MUST BE VERIFIED AGAINST THE PRODUCING CODE, never inferred from
    measurements.** This run wrote *"ai_content is a strictly narrower slice of
    ai_research_content"* from comparing string lengths across captures. The extraction rules say
    otherwise: `ai_content` allows `code` and strips anchors, `ai_research_content` forbids `code`
    and keeps them. **Neither contains the other**, and the field was nearly dropped. Read the
    code that PRODUCES a field before writing why you do not need it.
19. **Run the duplicate proof BEFORE proposing the drops.** Arman had to ask: *"I just wanna make
    sure that this stuff is already captured in full elsewhere, and you've done a side by side
    comparison… if it's not, then we obviously would have a very serious problem on our hands."*
    It found three non-duplicates out of twelve. **Rule: every DROPPED path ships with a runnable
    assertion that its content is recoverable from what the kind carries — a test, not a claim —
    and the drop table quotes the result.**
20. **A peer agent may rewrite your in-progress files on a stale premise.** Mid-run, another
    session rewrote this family's registry-typed reads as untyped `Record<string, unknown>`,
    commenting that the slugs were *"not independently registered Shape slugs"* — true when it
    looked, false ten minutes later. Shared-checkout normality; re-assert your typing after any
    unexplained reformat, and check what the comment CLAIMS against the registry.

## Friction from replication run 2 — rank / SERP-landscape family (2026-08-24, ledger `operations/rank-kinds-run.md`)

20. **FIXED 2026-08-24 — Stage B.6 "re-run the family's publish and the dual gate now passes" DID NOT ACTIVATE ANYTHING.**
    `publish_kind_catalog.py` wired activation into the CREATE path and the EVOLVE
    path only. A kind that lands INACTIVE in Stage A (by design — the gate needs a
    frontend `kind_component`) has an UNCHANGED schema by the time Stage B lands
    that component, so it plans as **`match`**, and the match path did maturity +
    example sync and nothing else. Measured: `provider_run_receipt`,
    `seo_rank_reading` and `serp_placement` all had ACTIVE components and stayed
    `is_active=false` across a full `--evolve --apply` run that reported no
    problem. The whole Stage A → Stage B handoff ran through this hole. Fix:
    `_sync_activation` (aidream `9ee104c5a`) re-evaluates a matching-but-INACTIVE
    row through the ONE authority (`evaluate_kind_activation` →
    `set_kind_activation`); an already-active row is untouched. **Standing rule:
    Stage B ALWAYS ends by asserting activation with SQL, never by trusting the
    publisher's exit code** — `select kind, is_active from
    content_ir.kind_definition where kind in (…)`.
21. **A discriminated union over kinds is `union`, not `object` — the skill never
    says how to mirror one.** Stage B.3 says "`object/kind` + `array/itemKinds`
    for nested kinds", which covers a single ref and a homogeneous array and
    nothing else. A field whose payload is any of N registered kinds (the whole
    point of a placement/slot kind) is
    `{type:"union", scalars:[], kinds:["web_result", …]}` in `KindSchema`; the
    refs externalize to `kind_edge` exactly like `array.itemKinds`.
    `{type:"object", kind}` takes ONE slug and `itemKinds` is not a legal key on
    it, so the obvious guess fails to compile.
22. **THE SECOND FAMILY'S NESTING SEAM IS A NEW PROBLEM THE SKILL DOES NOT NAME.**
    Stage B.4 says the collection delegates "via a static sibling map with a
    db-override seam (pattern: `search-kinds/SearchKindNested.tsx`)". That
    describes ONE family. A convergence family nests kinds from ANOTHER family,
    and copying the seam would duplicate the resolution rule (and would re-render
    a search result through a second component — the exact defect the canonical-
    component law forbids). **Rule: the new family's seam owns ONLY its own slugs
    and DELEGATES every foreign kind to that family's seam, one-way** (rank →
    search; the search family knows nothing about rank). Reference:
    `blocks/rank-kinds/RankKindNested.tsx`.
23. **`pnpm shape:types` EXCLUDES INACTIVE KINDS, so Stage B's step order in the
    skill cannot be followed literally.** The generator emits one interface per
    ACTIVE row, and Stage A's kinds are inactive by design — so running B.2
    (generate types) before B.5/B.6 (component rows + activation) produces an
    artifact with no type for the very kinds you are about to write components
    for. **The real order is: land the `kind_component` rows → activate → THEN
    `pnpm shape:types` → then write the components against the generated types.**
    The component_key is just a string, so the rows can land before any React
    exists.
24. **Stage B has no answer for "the shared preview server is on the wrong
    profile".** One dev server is machine-wide; `/demos/*` needs
    `MATRX_PREVIEW_PROFILE=user`, which PARKS `(admin)` and makes the admin kind
    preview (`/administration/utilities/kind-registry/<slug>`) 307 to production
    — and the reverse is true for `core`. With a concurrent session holding the
    server, ONE of the skill's two required browser checks is unreachable, and
    flipping the profile breaks the other session mid-verification. **Rule until
    a better mechanism exists: do the DEMO leg first (it is the one that proves
    real data end-to-end), record explicitly in the ledger which kinds the demo
    could NOT exercise, and hand the admin-preview leg to Stage V.** A demo
    endpoint that emits a collection does not exercise the family's sibling kinds
    — plan for that when choosing what the Stage A endpoint returns.
25. **`type-check must be green` is not a usable gate in a shared checkout.** The
    tree carried 84 errors from a concurrent family's in-flight work, none of them
    reachable from this stage's files. **Rule: run the gate, then attribute — the
    finding is "zero errors in the files this stage touched", with the residue
    named and attributed. Never "fix" a peer's in-flight file to make a gate
    green, and never report a red tree as your own.**

## Friction from running rows 2, 3 and 4 back to back (2026-08-24)

26. **THE MATURITY TIER HAD TWO WRITE PATHS AND ONE GUARD — FIXED.** `@kind` structurally cannot
    declare `verified` (the SDK refuses it), so any declaration syncing onto a verified row erases
    the verification pass. `_sync_maturity` was guarded; **`_apply_evolve` was not**, and an
    additive `--evolve` of the search family demoted all TWELVE verified rows to `distilled` in one
    command. Both paths now call one `_forward_only_maturity()`; the tier moves forward only and
    declining is loud. Pinned by `tests/test_publish_kind_catalog_maturity.py`, which asserts on
    the SOURCE of the write so a future copy of the rule fails the test. **Standing rule for every
    run: after any `--evolve --apply`, re-check `metadata->>'maturity'` on the rows you touched.**
27. **A KIND'S PLAIN SUB-MODELS MUST ACCEPT `__kind` — use `KindSubModel`.** Live registry rows
    declare an optional `__kind` on every nested `$def` (the schema-law campaign put it there), so
    a plain `BaseModel` with `extra="forbid"` is STRICTER than the contract it implements, and the
    compatibility gate correctly reads the missing property as "a field disappeared". Measured:
    six search kinds were refused for that and nothing else. `matrx_graph.content_ir.model`
    now exports `KindSubModel` — accepts the marker, emits none, excluded from every dump. Use it
    for every non-kind sub-structure; never a bare `BaseModel`.
28. **"ADDITIVE" IS A MEASUREMENT, NOT AN INTENTION — and the gate is the only thing that knows.**
    Across these three runs FOUR supersedes were written and documented as additive and were not:
    `seo_rank_history`, `rag_search_result`, `sql_query_result`, `table_rows`. The causes are worth
    memorising because they are invisible by inspection:
    * **Promoting a nested anonymous object to a real KIND is a narrowing.** The new schema declares
      `__kind: {const: …}` where the live one has a free string. Welcome, still a narrowing.
    * **A legacy field must keep its EXACT live type, default and requiredness.** Typing
      `query: str` where the row says `{"type":"string","default":""}` makes it required; typing
      `model: str | None` where the row says `{"type":"string"}` changes the type. Read the live
      `emitted_json_schema` and match it field by field before writing the model.
    * **A row-object item schema can carry properties your `dict[str, JsonValue]` does not
      reproduce** (`sql_query_result.rows` declares an optional `__kind` inside each row).
    **Rule: run the dry-run publish BEFORE writing the docstring that claims additivity, and when
    the gate disagrees, correct the CLAIM.**
29. **Stage B's activation step did nothing for Stage-A-inactive kinds — FIXED.** A kind created
    inactive in Stage A plans as `match` in Stage B, and activation was wired only into the CREATE
    and EVOLVE paths, so "re-run the publish, the dual gate now passes" silently activated nothing.
    `_sync_activation` now re-evaluates matching-but-inactive rows. Always VERIFY activation by SQL
    rather than trusting the command's exit.
30. **REUSING ANOTHER FAMILY'S ADAPTER IS THE HIGHEST-LEVERAGE MOVE IN THE SKILL, and it is not
    written down anywhere.** The rank family's whole SERP translation is `brave_to_kind` /
    `google_to_kind` from the search family plus a thin rank overlay — no second translation of one
    payload, no second place to fix a provider change. It recovered `entity_card`, `faq_item`,
    `news_result` and `local_place` placements the live pipeline discards, with ZERO new
    translation code. **Rule: before writing an adapter, check whether another family already
    translates this payload; if it does, call it and add only what your family adds. Merge the two
    translation reports so the caller never learns that two adapters ran.**
31. **A REUSED ADAPTER WILL SCREAM ON KEYS YOUR FIXTURES DO NOT HAVE — that is the system working,
    and it will happen against LIVE data after your fixtures are committed.** Row 2 hit three:
    `menu_highlights` and `years_in_business` on the committed captures, and `things_to_know` only
    when the endpoint ran against a live snapshot. **Rule: run the demo endpoint against several
    LIVE rows before declaring Stage A done, and capture a fresh fixture for every new key you
    resolve.** Two of those three turned out to be real data we were discarding.
32. **A TYPE THAT LOOKS OBVIOUS CAN SILENTLY DROP 100% OF THE VALUE.** `years_in_business` was
    modelled `int` and measured `None` on every row — Google reports `"10+ years in business"`, a
    floor, not a count. **Rule: after mapping a field, ASSERT ON THE MAPPED VALUE against a real
    capture, not on the field's presence.** The same discipline caught a `truncated` flag that was
    inferred from "we got exactly `limit` rows" and is wrong whenever a table holds exactly that
    many; the fix is to over-fetch by one and MEASURE.
33. **WHEN A DERIVATION IS OUR CONVENTION AND NOT THE SOURCE'S OBSERVATION, THE KIND MUST SAY SO.**
    Brave reports whole-page block order; SerpAPI does not, and its pixel ordering is a separate
    paid endpoint. `seo_rank_serp_landscape.rank_basis` carries `engine_reported` vs
    `platform_convention` so a reader can tell an observation from a convention. Generalise: any
    field a family derives because it must order/rank/classify anyway gets a sibling field naming
    the basis. Never silently present a convention as a measurement.
34. **DO NOT LOSE A SECTION THE SOURCE DID NOT NAME.** Iterating only an engine-reported block
    order silently deleted every section the engine happened not to list. The engine's order LEADS;
    anything left over follows in platform order. Losing data is never the lesser evil, and a
    partial ordering is the normal case, not the exceptional one.

> 🚨 **UNRESOLVED CONFLICT — `CFL-054`. Do not build against this section until Arman rules.**
> **This document says:** a result's second view should be what the current live path produces from the same input, shown beside the new kind on every demo, and it should go quiet once the cutover lands.
> **[`SKILL.md`](/skills/data-to-kinds/SKILL.md) (vocabulary, "the three projections") and [`stage-d.md`](/skills/data-to-kinds/stage-d.md) (repointing the emitters) say:** the second view is the raw provider payload, returned only when a caller asks for it (`include_raw=`).
> **Why it matters:** it decides what every demo's second tab shows and what the repointed emitters must serve — the untouched provider data for inspection, or the old output for side-by-side comparison that disappears after cutover.
> **Your move:** bring Arman these two readings and the consequence, get his ruling, then build.
> Register: [`/operations/conflicts.md`](/operations/conflicts.md) · `CFL-054`

35. **THE SECOND PROJECTION SHOULD BE THE CURRENT BEHAVIOUR, NOT THE RAW PAYLOAD.** The skill says
    projection 2 is `include_raw`. In practice the demo panel that MOVED the argument in all three
    runs was "what the live path produces from this identical input, beside ours": 11 persisted
    rows vs 20 kind placements; 0/6 citations with a URL vs 6/6; a table with no column list vs 28
    typed columns. **Rule: every demo gets a projection-2 tab showing the CURRENT output beside the
    kind, computed from the same input — and it should go quiet when Stage D lands.**

> 🚨 **UNRESOLVED CONFLICT — `CFL-053`. Do not build against this section until Arman rules.**
> **This document says:** a demo route must never be able to spend money or write, and nobody may add a live-call mode to one.
> **[`open-gaps.md`](/skills/data-to-kinds/open-gaps.md) (the later item in this same file, on a demo endpoint that cannot reach the family's headline kind) says:** Stage B should add an opt-in flag to the demo endpoint that makes the same real call, switched off by default when it spends money.
> **Why it matters:** one reading forbids a demo from ever spending, even when asked; the other lets any demo spend whenever someone turns the flag on — the RAG demo's `synthesize=true` already spends model tokens that way.
> **Your move:** bring Arman these two readings and the consequence, get his ruling, then build.
> Register: [`/operations/conflicts.md`](/operations/conflicts.md) · `CFL-053`

36. **A DEMO ROUTE MUST NOT BE ABLE TO SPEND MONEY OR WRITE.** Two of these three demos read stored
    payloads and real rows rather than firing paid provider calls or offering a write path. A demo
    that can spend is a demo that will. Say so in the service docstring so the next author does not
    "improve" it by adding a live-call mode.
37. **THE FIXTURE CAN CARRY THE MEASUREMENT ITS TEST NEEDS.** The tabular captures embed
    `column_types_available_to_the_node` — the ORM field metadata measured off the live registry at
    the moment the node built its result. That is what let a test prove a typed column descriptor
    is honest rather than aspirational, with no DB access. **Rule: when the interesting claim is
    about information the producer HAD, capture that information beside the payload.**

## Friction from replication run 3 — RAG retrieval + citation family (2026-08-24, ledger `operations/rag-kinds-run.md`)

38. **A CUTOVER-GATED COLLECTION STILL NEEDS ITS COMPONENT, AND THE SKILL IMPLIES OTHERWISE.**
    Stage B.2 says "a collection whose registry row is cutover-gated has NO `.gen.ts` until
    cutover", and it is easy to read that as "build nothing for it". Doing so is a defect: the
    collection stays on `generic_structured` while its nested item kinds have real components, so
    the family renders as a JSON dump wrapped around beautiful children — and the demo, whose whole
    job is to show the family, shows the fallback. **Rule: a cutover-gated collection gets its
    `kind_component` row, its compiled mirror and its component, built against the PYDANTIC MODEL
    (the demo endpoint already emits that shape). What it does NOT get is a `.gen.ts`. State the
    three consequences in the component's header: no per-slug `.gen.ts`, `kinds.generated.ts` types
    it at the OLD shape, and the new half is read through ONE documented cast.** Both the rank and
    the RAG runs arrived at this independently; it is the norm, not an exception.
39. **THE PUBLISHER REFUSING A CUTOVER-GATED SLUG IS A PASS, AND NOTHING SAYS SO.** Stage B.6 says
    to re-run the publish and verify activation. For a family with a gated supersede the run exits
    with `🚨 INCOMPATIBLE DRIFT` next to the lines that DID activate, which reads like a failure
    mid-stage. **Rule: quote the whole publisher output in the ledger and label the refusals as the
    gate working. A gated slug you did not intend to move MUST be refused; if it were accepted, the
    gate would be the thing that was broken.**

> 🚨 **UNRESOLVED CONFLICT — `CFL-053`. Do not build against this section until Arman rules.**
> **This document says:** when a demo endpoint cannot reach the family's headline kind, Stage B adds an opt-in flag that makes the same real call, switched off by default when it spends money.
> **[`open-gaps.md`](/skills/data-to-kinds/open-gaps.md) (the earlier item in this same file, "a demo route must not be able to spend money or write") says:** a demo route must never be able to spend money or write, and nobody may add a live-call mode to one.
> **Why it matters:** one reading lets any demo spend whenever someone turns the flag on — the RAG demo's `synthesize=true` already spends model tokens that way; the other forbids a demo from ever spending, even when asked.
> **Your move:** bring Arman these two readings and the consequence, get his ruling, then build.
> Register: [`/operations/conflicts.md`](/operations/conflicts.md) · `CFL-053`

40. **THE DEMO ENDPOINT MAY NOT EXERCISE THE FAMILY'S HEADLINE, AND STAGE B IS ALLOWED TO FIX
    THAT.** Stage A ships one endpoint; a convergence family's most valuable kind is often reached
    by a DIFFERENT call (here `rag_synthesize_result.citations` — the entire point of the run —
    while the endpoint only searched). The skill offers Stage B no move but "record what the demo
    could not exercise". **Rule: when the endpoint cannot exercise the family's headline kind,
    Stage B EXTENDS the Stage A endpoint with an opt-in flag that produces it from the SAME real
    call (never a second engine, never a fixture, never a client-side assembly), and records the
    change in the ledger's Stage B record.** Default it OFF whenever it spends money.
41. **A LOCALLY-RUNNING aidream IS STALE AND WILL 404 THE ENDPOINT YOU ARE VERIFYING.** Stage B
    calls an endpoint Stage A added minutes ago; `python run.py` does not hot-reload new routers,
    and a server another session started hours earlier will return 404 with no hint that the cause
    is staleness. It cost a full debug cycle. **Rule: before blaming the FE, confirm the route
    exists — `curl -s localhost:8000/openapi.json | grep <family>-kinds` — and restart the local
    server if it does not. Budget ~2.5 minutes for boot.** Production is not the fallback: Stage A's
    endpoint is usually not deployed yet either.
42. **THE SHARED BROWSER PANE IS AS CONTENDED AS THE PREVIEW SERVER (gap #24's sibling).** A peer
    session opened its own demo in the same pane mid-verification; screenshots silently retargeted
    to THEIR tab, and the pane then stopped compositing entirely. **Rule: pass `tabId` explicitly on
    every browser call once more than one tab exists, take the screenshot you need the moment the
    result lands, and re-open the pane with `preview_start` rather than fighting a hidden one.
    `javascript_tool` keeps working when screenshots do not — but a Radix tab will not switch from a
    synthetic `.click()`, so it is a reader, not a substitute for the real pointer.**
43. **ONE-WAY DELEGATION NEEDS A CONTEXT CHANNEL, AND #22 DOES NOT MENTION IT.** A nesting seam
    that only forwards `{serverData, className}` cannot tell a nested primitive which POSTURE to
    render (a `source_ref` is a card standalone and a chip inside a chunk), and the temptation is a
    second component. **Rule: the seam forwards a small, optional, advisory context object
    (variant, index/number, parent ids, the query) to the compiled component and NOTHING to the
    db-override path — a DB-authored renderer owns its presentation entirely. A posture is a
    `variant` prop on the ONE component, exactly as `RagHitCard` does compact/expanded.**

## Friction from replication run 4 — tabular family (2026-08-25, ledger `operations/table-kinds-run.md`)

44. **A ONE-KIND FAMILY NEEDS NO NESTING SEAM, AND #22 IMPLIES EVERY FAMILY BUILDS ONE.** Stage
    B.4 and gap #22 both describe a seam as though it were mandatory. A family whose kind nests
    NO other kind (`data_table` — its columns and source are plain sub-structure, not registered
    kinds) has nothing to delegate, and writing a `*KindNested.tsx` for it would be a file that
    routes one slug to one component. **Rule: build the seam only when a kind's field can hold
    another KIND. For a leaf primitive, note in the ledger that delegation runs INWARD — the
    families that will nest it delegate to its slug at cutover, one-way, and it stays ignorant
    of them.**
45. **THE DEMO CAN ONLY EXERCISE WHAT ITS ENDPOINT PRODUCES — SAY SO PER FEATURE, NOT PER KIND.**
    Gap #24 says to record which KINDS the demo could not exercise. This run had ONE kind and
    still could not exercise half of it: every measured defect the component fixes for the
    UNTYPED producers (a CSV cell that is a string whatever it looks like, a ragged PDF row) is
    unreachable from a demo endpoint that reads through a registered ORM model, where every
    column is typed by construction. **Rule: before building, list the DEFECTS the component
    exists to fix and check which ones the Stage A endpoint can actually produce. Anything it
    cannot goes in the ledger as UNVERIFIED with the reason, and Stage A owes a second endpoint
    verb for it — a code path nobody has watched render real data is not shipped, it is
    written.**
46. **A FIELD THE STAGE A ADAPTER ACCEPTS BUT NEVER MEASURES IS AN UNVERIFIABLE FEATURE.** The
    adapter took `total_row_count` and the service never supplied one, so the component's
    "500 of 40,000" branch — the entire reason the field exists — could not fire on real data
    and the run's headline defect fix would have shipped unwatched. **Rule: for every optional
    field whose absence changes what the component SAYS, check at Stage B that some real
    producer populates it, and fix the producer when none does.** (Fixed here: the endpoint now
    counts the source ONLY when rows were actually cut; an uncountable source stays UNKNOWN
    rather than becoming a guess.)
47. **A WIDE TABLE HIDES ITS OWN EMPTY STATE, AND EVERY `colSpan` EMPTY ROW IN THE PLATFORM HAS
    THIS BUG.** A `<td colSpan={n}>` centred inside a horizontally-scrolling table puts its
    message at the centre of the FULL table width — measured on a 32-column empty result, the
    "no rows" explanation sat far off the right edge, invisible exactly when it was the only
    content. **Rule: an empty-state cell inside an `overflow-x-auto` table is `sticky left-0`
    and left-aligned, never centred.**
48. **THE LOCAL aidream SERVER DOES NOT HOT-RELOAD, AND THE SKILL NEVER SAYS IT.** `run.py` sets
    `reload=False`, so a Stage B fix to the Stage A service is invisible to the browser until
    the process is restarted — and the symptom is a demo that keeps rendering the OLD answer
    while the file on disk is correct, which reads as a component bug. **Rule: after ANY edit to
    aidream during Stage B, restart `python run.py` (it runs detached, PPID 1) and re-run the
    demo before concluding anything about the frontend.**
49. **JSX WHITESPACE AROUND A CONDITIONAL SWALLOWS THE SPACE, AND IT ONLY SHOWS IN THE BROWSER.**
    `{cond ? "column" : "columns"} arrived` rendered as `columnsarrived`. It is invisible in the
    source, in `type-check`, and in every test. **Rule: build a sentence that interleaves
    expressions and prose as ONE template literal, and read the rendered text (not the source)
    before calling copy done — `javascript_tool` reading `document.body.innerText` is the check.**

## Friction from the first joint Stage V+D pass — rank / RAG / table (2026-08-26)

50. **FIXED — `verify_kinds.py` fed the leg-3 probe UNORDERED `kind_component` rows and
    false-failed 7 of 18 kinds as `floor_only`.** The resolver keeps the FIRST row per
    (kind, platform, role) and production feeds it `fallback LAST, is_default DESC,
    sort_order ASC` — so a retired INACTIVE `generic_structured` row shadowed the ACTIVE
    canonical component for every kind that ever HAD a floor row (exactly the ones Stage B
    retires one). Kinds with a single row passed, which made the failure look real. The driver
    now mirrors the production loader's order. **Rule: when a verdict splits along
    "had-a-floor-row vs never-had-one", suspect the harness before the components.**
51. **Leg 4 needs a REAL production BEFORE cutover, and the honest path is a captured example
    from the family's own demo engine.** Pre-cutover, no node emits the new kinds, so every
    Stage-B-finished kind reads `exercised_never`. `content_ir.kind_exercise_evidence()`
    counts `kind_example` rows with `source='captured'`; the demo services already RUN the
    real engines. `aidream/scripts/capture_kind_exercise_examples.py` is the harness: it runs
    each family's real production path (live snapshot translation, live retrieval, live table
    read, the committed real grounded-answer capture) and stores the payloads as captured
    examples — extend it per family instead of re-inventing it. **Kinds whose ONLY honest
    producer is a live node that has never run (`seo_rank_target`, …) stay `distilled` with a
    note; their evidence arrives with the Stage D repoint. Never fabricate leg 4.**
52. **Stage D.0 is now a parameterized guard, not a per-family rewrite.**
    `aidream/scripts/check_kind_cutover_safety.py --family <rank|rag|table>` imports the
    search pilot's mechanics (`check_search_cutover_safety.py` stays the one copy) and takes
    (models module, cutover kinds) per family; `--self-test` plants a BREAK and a SAFE. Add a
    FAMILIES entry for a new run instead of copying 550 lines. A whole-output passthrough
    still comes back UNPROVABLE and must be human-read; record the read and its verdict in
    the ledger (worked example: table run, *Certified Blurb Pipeline*).
