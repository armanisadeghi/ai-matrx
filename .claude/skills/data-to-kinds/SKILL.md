---
name: data-to-kinds
description: The end-to-end pipeline that turns ANY structured data source — an API, a provider payload, a scraper/crawl result, a computed result, any aspect of our system — into registered platform kinds with @kind pydantic models, generated TypeScript types, canonical kind components, a live demo against the real server, a verification pass, and cutover of the nodes/tools that emit it — through staged human approval with Arman. Use when asked to "create kinds for X", "distill X into kinds", "put X through the data-to-kinds process", "point yourself at API X", or when you are Stage A/B/V/D/C of a running data-to-kinds run. NOT for consuming kinds that already exist (aidream workflow-io-kinds / matrx-frontend Shape System docs).
---

<!-- SYNCED COPY — do not edit here.
     Canonical: common-docs/skills/data-to-kinds/SKILL.md
     This file is distributed to every consuming repo by
     common-docs/meta/scripts/sync_skills.py. Edit the canonical, run the
     sync, and commit each repo. Edits made here are overwritten and lost. -->

# data-to-kinds — point an agent at a data source; get a fully-rendered platform kind family

**Entry point.** Someone names a source — an API, a provider, a graph action family, a system
aspect — and this skill carries it the whole way: distill shapes with Arman via tables → `@kind`
pydantic models → publish to the registry → generate TS types → canonical components by
converging the displays we already built → a live demo calling the real server → verification →
cutover of the nodes/tools that emit it. **No step needs an explanation from anyone.** If you hit
one that does, that is a defect in THIS skill: fix it here in the same session (canonical copy
`common-docs/skills/data-to-kinds/SKILL.md`, then `python3 common-docs/meta/scripts/sync_skills.py`;
never edit a repo mirror — the sync erases it). Run-specific decisions go in the run's ledger,
not here. Arman's instructions that generalize beyond your family ("always X", "never Y") become
standing law here the day he says them.

## Why (Arman, 2026-08-20/21, condensed)

Content IR is the one language every part of the system speaks. When our own code derives data,
emitting a kind is the easiest thing in the world — the function spits out the object in exactly
the shape we want — and then every surface (web, mobile, desktop, extension), every workflow node,
and every agent can count on that shape: no type errors, universal rendering, no custom code. The
search pilot was *"the most incredible proof we could ever have"*: two providers with different
raw shapes became ONE kind family with nested kinds and primitives, rendered by ONE set of
components from a real server call. The bar now: *"skills that teach agents how to do this end
to end — point them at an API or some aspect of our system and ensure all of this gets done."*

## Vocabulary you must hold

- **Data kinds** (`category: data`) — pure portable shapes, no runtime/provider mess. **Runtime
  wrapper kinds** (`category: runtime`: `node_outcome`, `run_result`, `agent_result`,
  `tool_result`) carry instance context with the data kind NESTED as a typed payload. A wrapper
  never absorbs payload fields; a payload never carries runtime fields. You build DATA kinds.
- **Family** — one source's kind set: a collection kind + item kinds + the system-wide
  primitives they hold (search: `web_search_results` → `web_result`, `news_result`, … →
  `rating`, `postal_address`, …). **Sectioned, never flattened**: heterogeneous sections stay
  typed arrays of typed item kinds; a collection is never a bag of loose keys.
- **Maturity** (`kind_definition.metadata.maturity`, machine-readable, never a vibe):
  `placeholder` (outer structure honest, data NOT studied — the fast-fire tier and the `@kind`
  default) → `distilled` (real data studied, shape designed — what Stage A produces) →
  `verified` (distilled AND proven end-to-end: registered → typed → rendered → exercised —
  awarded ONLY by the verification pass; `@kind` refuses to declare it). Registering a basic
  FE route promotes nothing. Over-engineering guard: a boring flat result whose placeholder
  shape already tells the truth is promoted `simple-is-correct` as-is — richness in the DATA
  (arrays of structures, recurring sub-objects, heterogeneous sections) earns the full treatment.
- **The three projections of one result**: (1) the KIND — canonical, what travels/persists/
  renders; (2) the RAW payload — on demand (`include_raw=`), off by default; (3) the AI VIEW —
  a context-trimmed projection made at the TOOL boundary, never in the engine, never in the kind.
  One core engine per source; the engine's result gets its kind at that boundary.

## The pipeline at a glance

| Stage | Repo | Produces | Gate (Arman) | Then |
|---|---|---|---|---|
| **A Distill** | aidream | tables agreed → `@kind` models + adapters + tests → published (inactive) → demo endpoint → ledger | approves every table, then the registered set | fire B |
| **B Render** | matrx-frontend | `pnpm shape:types` → compiled mirrors → one canonical component per kind → `kind_component` rows → activation → live demo | approves the rendering on the demo | fire V+D (or C if this is a pilot) |
| **V Verify** | either | four legs per kind; stamps `verified` | — (report) | — |
| **D Cutover** | aidream (+FE consumers) | emitters repointed to the family, collection schema superseded, legacy displays converged | approves cutover | — |
| **C Review** | common-docs (owns this skill) | skill rewrite + replication run | — | — |

Every run has ONE ledger: `common-docs/operations/<family>-kinds-run.md` (type `Register`; the
search pilot's is `operations/search-kinds-pilot.md` — copy its section layout: material · chain
table · decisions (append-only, Arman's) · per-stage build records · artifacts). The ledger row
is the durable completion signal the orchestrator watches; it is only true once pushed.

---

## Stage A — Distill (aidream)

0. **Map the blast radius FIRST — it gates the keep/drop tables.** You cannot ask Arman to
   approve dropping a field without knowing who reads it. Produce the full consumer set for the
   family's existing slugs across **all four surfaces** and paste it into the ledger; the
   enumeration, the live counts, and the reason grep alone returns a clean wrong answer are in
   [`common-docs/operations/kind-conversion-board.md`](../../operations/kind-conversion-board.md)
   § four consumer surfaces — **read it, do not improvise this step**. In short: code (all repos)
   is one surface; the other three are DB rows (`agent.mandate.output_kind`,
   `content_ir.kind_component`, `workflow.trigger.kind`), persisted history
   (`workflow.node_outcome`, `node_data_slot`, `hindsight.replay_step`, `kind_instance`/
   `kind_example`), and generated artifacts (`.gen.ts`, compiled mirrors, matrx-extend). When
   `scripts/kind_consumers.py` exists, run it and paste its output instead of hand-building the
   list. Register the family on the conversion board at G1/G2 before you go further.
1. **Find the source's ONE engine and capture real data.** Locate the live client the nodes use
   (duplicated API clients are a defect — fix on sight, one engine, specialised layers above it).
   Call it with real credentials from platform config across 4–6 query archetypes that exercise
   every section the provider can return; save each raw response as a test fixture in the family
   module (`aidream/services/<family>_kinds/tests/fixtures/<provider>_<archetype>.json`). Never
   fabricate samples. Note measured findings (sections that never appeared, formats) in the ledger.
2. **Complete the source (mandatory, non-blocking).** Survey the provider's full surface vs what
   we call today and fire a recon chip (pattern: `systems/content-ir-system/SEARCH_PROVIDER_RECON.md`
   — endpoints, verticals, params, response sections, plan sizing). Its findings land in the ledger
   as follow-up capability work. Distillation proceeds without waiting.
3. **Check what already exists BEFORE proposing.** Registry (`content_ir.kind_definition`, slugs +
   `metadata.maturity`/`family`), the well-known primitives (`rating`, `opening_hours`,
   `postal_address`, `geo_coordinates`, …), `aidream/kinds/<domain>.py` (the army's `@kind`
   placeholders — your family may already have placeholder rows you will UPGRADE, not re-mint),
   `NOMENCLATURE.md` + the lexicon for names. A near-duplicate slug is a defect; reuse-or-supersede
   is a proposal to Arman, never a silent choice.
4. **Propose shapes as markdown tables — one per proposed kind:** field · type · required/
   optional · source path in the raw payload · kept/dropped + why; plus one table of DROPPED
   top-level sections + why; plus the layer diagram (collection → items → primitives). Multiple
   sources stay SEPARATE at first; after separate agreement, present the merge analysis (what
   shares a kind without losing provenance, what stays source-specific). Follow the distillation
   laws below. Bring him material he can rule on in one look; never JSON walls, never a question
   without its table (page/action/question).
5. **Iterate until Arman agrees on every table.** Every keep/drop/merge/require decision is his.
   Only then write code. Record each ruling in the ledger's decisions section; generalize any
   standing rule into this skill.
6. **Build the models with the SDK** in a parallel path (`aidream/services/<family>_kinds/` or
   the family's `aidream/kinds/<domain>.py` for upgrades; live nodes untouched):
   ```python
   from matrx_graph.content_ir.model import KindModel
   from matrx_graph.content_ir.sdk import kind

   @kind("web_result", label="Web Result", family="search", maturity="distilled",
         example={...translated real capture...})
   class WebResult(KindModel):
       url: str
       title: str
       source: str            # provenance survives merging — a field, never a slug
       rating: Rating | None = None   # nested kinds are nested KindModels → kind_edge rows
   ```
   `KindModel` owns `__kind` entirely (declared `Literal` field, alias on both halves of the
   config); nested kinds are nested `KindModel`s; plain sub-structure that is not a kind is a
   `BaseModel` with `extra="forbid"`. `example=` is validated at import. Every field a distillation
   ADDS to an existing registered kind must be optional-with-default (the compatibility gate).
7. **Build one translation adapter per provider** (`<provider>_adapter.py`:
   `to_kind(raw) -> (Collection, TranslationReport)`) with per-section MAPPED/DROPPED key
   registers at the top of the file, a `KeyAudit` that makes UNKNOWN keys scream (log + ops
   record, never raise), and shared unification code (`translate.py`: date parsing incl.
   relative dates → approximate ISO, HTML → text+links, durations, rank-from-order, site-name
   derivation). Reference implementation: `aidream/aidream/services/search_kinds/`. Tests over
   the real fixtures; the core assertion is every fixture translates **fully accounted** (zero
   unknown keys). `uv run pytest aidream/services/<family>_kinds/tests` green.
8. **Publish — dry-run first, then apply:**
   ```bash
   uv run python scripts/publish_kind_catalog.py aidream.<module.path>            # plan, read-only
   AGENT_USER_ID=<your user id> uv run python scripts/publish_kind_catalog.py aidream.<module.path> --apply
   ```
   Creates definition + canonical example + `kind_edge` rows, system org, `visibility='public'`,
   syncs `metadata.maturity` from the decorator. **Drift never auto-applies:** an existing slug
   whose live schema differs exits 2 — add `--evolve` for additive-optional drift (passes the
   BACKWARD gate, bumps version), `--breaking <slug>` per slug only for a deliberate narrowing
   after you checked what old payloads contain. Kinds land **INACTIVE by design** — the
   activation dual gate (`content_ir.set_kind_activation`) needs an active role=`output`
   `kind_component`, which Stage B supplies; do not promise activation in Stage A. A slug a live
   consumer already holds (`faq_item` was nested under `seo_package`) is merged by the laws
   (fields go optional so both fit), never blind-updated.
9. **Ship the demo endpoint** — a thin router + service that runs the REAL engine and streams the
   kind JSON back (`aidream/api/routers/search_kinds.py` + `services/search_kinds/service.py`:
   `POST /api/<family>-kinds/<verb>` → `create_streaming_response` → `{result, translation}`).
   Deploy (repo release flow) and verify it live with a real call.
10. **Gate: Arman approves the registered set.** Update the ledger (Stage A DONE, slugs, endpoint,
    fixtures, what is cutover-gated), push, and **fire the Stage B chip** with the standalone
    prompt below. If you cannot create a chip, write the exact prompt into the ledger and say so.

## Stage B — Render (matrx-frontend)

1. **Sweep `content_ir.kind_component` for every family slug first.** A stale ACTIVE
   `source='db'` override authored against an old shape silently wins over your bundled
   component — deactivate (never delete) with a note. Then **survey existing renderers** for this
   data family (the Inventory Law — the platform has usually built them several times; search had
   six). Name the best-of-breed, CONSUME its utilities (search: `features/tool-call-visualization/
   renderers/search/parseSearch.ts`), and design ONE canonical component per kind. Legacy D-grade
   displays are converged at cutover (Stage D), not forked now.
2. **Generate the types from the registry:** `pnpm shape:types <slug> [<slug>…]` →
   `features/content-ir/kinds/generated/<slug>.gen.ts` (self-contained, drift-checked by
   `pnpm check:kind-types`; header carries the registry version). Never hand-edit a `.gen.ts`;
   a collection whose registry row is cutover-gated has NO `.gen.ts` until cutover.
3. **Write the compiled parser mirrors** — `features/content-ir/kinds/<family>.ts`: one
   `KindSchema` + `KindDefinition` per kind (`legacyBlockType` = slug, `object/kind` +
   `array/itemKinds` for nested kinds, `json[]` for plain sub-structure), uniform
   `{value, isComplete}` streaming bridge; export `<FAMILY>_KIND_DEFINITIONS` and spread it into
   `features/content-ir/registry/system-kinds.ts`. (Rows whose schema can't be flattened have
   `kind_definition.data` NULL, so the streaming parser has no warm schema without this mirror —
   still hand-written; SDK gap.)
4. **Build the components** in `components/mardown-display/blocks/<family>/` — one per kind,
   defensive readers (a half-arrived value is a NORMAL state), the collection delegating every
   nested instance via a static sibling map with a db-override seam (pattern:
   `search-kinds/SearchKindNested.tsx`), never a per-item `next/dynamic` re-entry, never
   reimplementing a nested kind. Register each in `BlockComponentRegistry.tsx`, the dispatch
   shape table (`block-dispatch.tsx`), the `FeSynthesizedBlockType`/`ShapeBlockType` unions, and
   the pin test `__tests__/component-registry.test.ts`.
5. **Land the `kind_component` rows** as one idempotent migration
   (`migrations/content_ir_<family>_components.sql`, role=`output`, source=`bundled`,
   platform web), apply, ledger it.
6. **Activate:** re-run the family's publish (`publish_kind_catalog.py … --apply`; the search
   pilot's legacy path is `scripts/seed_search_kind_family.py`) — the dual gate now passes — and
   VERIFY by SQL: `select kind, is_active, metadata->>'maturity' from content_ir.kind_definition
   where kind in (…)`. Every family slug `is_active=true` except cutover-gated collections.
7. **Ship the live demo — the standing proof format.** `app/(dev)/demos/<family>/page.dev.tsx`:
   an input, a real call to the Stage A endpoint via `useBackendApi` + `consumeStream`, the
   result rendered through `KindInstanceRender` (the production route path), the translation
   report shown (unknown keys = red banner). ZERO mocks, zero pasted fixtures. Verify in the
   in-app browser against localhost (`MATRX_PREVIEW_PROFILE=user pnpm preview:start`; `/demos/*`
   is parked under the default profile) and on `https://demos.aimatrx.com/demos/<family>` after
   deploy; also render each item kind on the admin preview
   `/administration/utilities/kind-registry/<slug>`. Untested-in-browser = untested.
8. **Gate: Arman approves the rendering on the demo.** Iterate on look there. Update the ledger
   (Stage B DONE, demo URL), push, and **fire V + D** (first run of a pilot: fire C instead, which
   fires them).

## Stage V — Verify (the four legs; stamps `verified`)

Per kind, prove: **registered** (row active, example `validation_status='passed'`, edges
present) · **typed** (`.gen.ts` exists, `pnpm check:kind-types` clean) · **rendered** (component
resolves via the production route path; admin preview renders the canonical example) ·
**exercised** (a REAL payload from the live endpoint rendered end-to-end — the demo, in the
browser). Only when all four hold, set `metadata.maturity='verified'` (SQL; the decorator cannot)
and record the evidence (URL, SQL, date) in the ledger. Board:
`select coalesce(metadata->>'maturity','(untiered)'), count(*) from content_ir.kind_definition
where deleted_at is null group by 1;`.

## Stage D — Cutover (convert what emits and consumes the family)

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

## Stage C — Review and generalize (owns this skill)

Review the whole run — skill-said vs happened, every missing instruction, every ruling — rewrite
THIS skill (tight: instructions, not a memoir), fix the ledger, then **fire the replication run**
from the queue as a Stage A chip that references ONLY this skill. The replication's friction is
the failure list: the replication agent appends it to "Open gaps" below and its ledger links it.

---

## Standing rules (all stages)

- **Every keep/drop/merge/require decision is Arman's.** Propose with tables; never decide.
- **Content IR alignment binds you** (`systems/content-ir-system/UNIFICATION.md`): one system;
  XML/markdown/fence arrival surfaces stay first-class; frozen block-type values never change;
  kinds-as-JSON is the internal form, never a forced wire format. Names per `NOMENCLATURE.md` +
  lexicon (short snake_case noun, no provider prefix, no hashes, no node names).
- **Provenance survives merging.** A shared kind keeps source identity as a `source` field (or
  source-specific companion kinds); merge shapes, never origins.
- **Specific kinds without going overboard.** A repeated reusable structure gets a kind; a one-off
  blob does not. Layer where identification helps (collection, item, primitive); never a wrapper
  whose only content is its payload — self-identifying items are already portable.
- **Reuse before minting; parallel path until approval**; live nodes/services/routes repointed
  only in Stage D after approval.
- **Completion signaling**: each stage ends by updating the ledger row + artifacts AND firing the
  next stage's chip with a standalone prompt. **Commit and push as you go** — a ledger row is only
  true once on origin/main.
- **Ask Arman with the page, the action, the question** — and never hand him the design problem.

## Distillation laws (Arman, 2026-08-20, ratified during the first run)

- **A drop is a loss of data we paid for.** Never inherit a drop from existing code — past code
  dropping a field may be the mistake this pipeline fixes. Every drop is justified on its own
  merits. Drop freely ONLY provider plumbing: request echoes, tracking/redirect links, pagination
  endpoints, the provider's own UI chrome. Real-world data defaults to KEPT, as structure.
- **Provider asymmetry is never a drop reason.** One provider carrying a field the other lacks →
  optional field on the shared kind; map both providers' variants onto the same field wherever the
  data is the same thing.
- **Known string formats become structured data.** Parse hours, dates, ratings, addresses into
  typed structure. Keep the original string alongside only when the parse is lossy or relative
  ("2 weeks ago"); never synthesize precision the source didn't give. Datetimes/URLs stay scalar
  JSON-Schema formats, not kinds.
- **Recurring small structures are core-primitive candidates** (rating, opening hours, postal
  address, geo coordinates): propose system-wide primitive kinds held by bigger kinds; check the
  registry first; never mint a primitive that exists.
- **Embedded HTML is judged by what's inside.** Pre-rendered UI with no unique data → discard.
  Unique data wearing HTML → convert to structure (text + extracted links); never store raw HTML.
- **One copy of everything.** Kinds reference canonical entities rather than duplicating them.

## THE MERGE + TRANSLATION LAW (Arman, 2026-08-20 — platform-level, unbreakable)

- **Provider-named kinds are BANNED.** `brave_search_results` next to `google_search_results` is
  the death of the kind system — 100 kinds is the same as no kinds. Same kind/type/purpose → ONE
  merged kind; the provider is a `source` field. Adding a provider = one adapter, never a kind.
- **Every provider gets a TRANSLATION ADAPTER, modeled on the AI request system's configuration
  equivalence**: value vocabularies map ("US" ↔ "United States"); equivalent concepts land in one
  field however each provider spells them; a field one provider lacks is DERIVED when an honest
  derivation exists (rank from array order, `published_at` parsed, an approximation when the
  source is relative). The fewer optional fields, the more every downstream can count on.
- **Never lossy by accident.** An adapter declares every raw key in exactly one set: MAPPED (raw
  path → field) or DROPPED (named key + reason, Arman-approved, visible in code). Anything else is
  UNKNOWN and screams (log + ops record) — that is how a provider adding a field gets noticed.

## Earned traps (still true — each cost a run-day)

- `KindModel` needs BOTH `populate_by_name` (in) and `serialize_by_alias` (out): a kind nested in
  a plain model otherwise serializes as `kind_` and its own `additionalProperties:false` schema
  rejects it (pinned by `packages/matrx-graph/tests/test_content_ir_model.py`).
- `_touch_row` bumps `kind_definition.version` on every update — re-read before pinning
  `kind_example.kind_version`. `kind_example.source` is CHECK-constrained to
  `authored|captured|migrated|synthetic`; real-payload examples are `captured`.
- Changing an ACTIVE kind's schema changes live node verification on the next run — hence the
  cutover gate (Stage D.1). Use `--evolve` for additive drift; never a publisher overwrite.
- pydantic leaves defaulted fields (incl. `__kind`) out of `required`, so they generate as
  optional in TS — the type tells the truth about validation, the serializer always emits them.
- Brave returns empty-string location fields; Google News dates are relative; a token-only
  `ai_overview` means "no answer" — read the family FEATURE.md's earned traps before touching it.

## Open gaps (SDK wishlist — replication agents append friction here; the SDK build consumes it)

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

### Friction from replication run 1 — scraper family (2026-08-23, ledger `operations/scraper-kinds-run.md`)

6. **Stage A.0 never says the consumer script's code leg is a substring grep.** `kind_consumers.py
   scraped_page` returned **91 blocking** consumers; hand-classified, **7** were real and ~81 were
   the unrelated identifier `scraped_pages` (a research-resource variable), plus 8 hits inside a
   scratch dump at `aidream/tmp/code_context_output/*.txt` that the walker does not exclude.
   **Rule now: paste the script output, then hand-classify the code hits into true consumers vs
   substring collisions and record BOTH numbers.** A raw blocking count is not a blast radius.
   (Script fixes owed: word-boundary matching, and skip `tmp/`.)
7. **`category` is undocumented and unsettable.** The vocabulary section says data kinds are
   `category: data`, but `content_ir.kind_definition` has **no `category` column** — it is
   `metadata->>'category'`, and nothing in `@kind(...)` sets it. Measured live: `data`, `pure`,
   and `null` all occur. Either the decorator gains the argument or the skill stops implying it
   is something you choose.
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

## Chip prompts (standalone — paste as the chip body, fill the ⟨⟩)

**Stage A:** "You are STAGE A of the data-to-kinds run for ⟨family⟩. Read ONLY
`common-docs/skills/data-to-kinds/SKILL.md` (mirrored at `.claude/skills/data-to-kinds/SKILL.md`)
and follow it verbatim. Source: ⟨engine/client path, nodes, provider(s)⟩. Existing placeholders:
⟨`aidream/kinds/<domain>.py` slugs or none⟩. Create the ledger `common-docs/operations/⟨family⟩-
kinds-run.md` from the search pilot's layout. Work with Arman via tables; publish inactive; ship
the demo endpoint; on his approval mark Stage A DONE and fire Stage B. Every instruction the skill
failed to give you goes into its 'Open gaps' section in the same session."

**Stage B:** "You are STAGE B of the data-to-kinds run for ⟨family⟩. Read ONLY the skill above
and the ledger `common-docs/operations/⟨family⟩-kinds-run.md`. Kinds: ⟨slugs⟩. Endpoint:
⟨POST /api/…⟩. Build per Stage B, demo at `/demos/⟨family⟩`, verify in-browser, get Arman's
render approval, mark DONE, fire V + D."

**Stage V / D / C:** same shape — name the family, the ledger, the slugs, and the stage.

## Runs

| Run | Ledger | State |
|---|---|---|
| Search results (Brave + SerpAPI Google) — the pilot | `common-docs/operations/search-kinds-pilot.md` | A+B approved; C done 2026-08-23; V + D pending (cutover gated) |
| Scraper / crawl results (`scraper.*`) — replication run 1 | `common-docs/operations/scraper-kinds-run.md` | Stage A fired 2026-08-23 |

**Campaign doctrine (platform law, applies beyond kinds):** `common-docs/policies/conversion-campaigns.md` — the four consumer surfaces, demo-is-not-a-conversion, a campaign ends in a committed guard, consumer lists are computed not hand-written.

**Tracking spine:** `common-docs/operations/kind-conversion-board.md` — every family in flight, its gate (G1 enlisted → G2 blast radius → G3 shaped → G4 cut over → G5 guarded), and who holds it. A family is DONE only at G5; a demo is not a conversion. Update your row every gate.

**What to run next:** `common-docs/operations/data-to-kinds-queue.md` — the ranked inventory of every remaining candidate, each with a filled-in chip prompt. Fire one at a time; queue rows 1 and 4 mint primitives that later rows nest.
