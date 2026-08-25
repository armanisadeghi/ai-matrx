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
| **A Distill** | aidream | shapes distilled → `@kind` models + adapters + tests → published (inactive) → demo endpoint → ledger | **none — do NOT stop for a table approval** (gap #14) | fire B |
| **B Render** | matrx-frontend | `kind_component` rows → activation → `pnpm shape:types` → compiled mirrors → one canonical component per kind → live demo | **THE gate: approves the rendering on the demo** | fire V+D (or C if this is a pilot) |
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
   registers at the top of the file, and `KeyAudit` from **`matrx_graph.content_ir.audit`** — the
   ONE shared copy, which makes UNKNOWN keys scream (log + ops record, never raise) and captures
   every present DROPPED value. Identify yourself to it (`KeyAudit(SOURCE, family="<family>",
   adapter_hint="aidream/services/<family>_kinds/{provider}_adapter.py")`) so the scream still
   names the file to edit. Generic unification code (date parsing incl. relative dates →
   approximate ISO, HTML → text+links, durations, site-name derivation) is
   **`matrx_graph.content_ir.translate`**; only translators that touch YOUR models go in a local
   `translate.py`. Reference implementation: `aidream/aidream/services/search_kinds/`. Tests over
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

### Friction from replication run 1, round 2 — building the models (2026-08-23)

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

### Friction from replication run 1, round 2 — the gate itself was wrong (2026-08-24)

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

### Friction from replication run 2 — rank / SERP-landscape family (2026-08-24, ledger `operations/rank-kinds-run.md`)

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

### Friction from running rows 2, 3 and 4 back to back (2026-08-24)

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
35. **THE SECOND PROJECTION SHOULD BE THE CURRENT BEHAVIOUR, NOT THE RAW PAYLOAD.** The skill says
    projection 2 is `include_raw`. In practice the demo panel that MOVED the argument in all three
    runs was "what the live path produces from this identical input, beside ours": 11 persisted
    rows vs 20 kind placements; 0/6 citations with a URL vs 6/6; a table with no column list vs 28
    typed columns. **Rule: every demo gets a projection-2 tab showing the CURRENT output beside the
    kind, computed from the same input — and it should go quiet when Stage D lands.**
36. **A DEMO ROUTE MUST NOT BE ABLE TO SPEND MONEY OR WRITE.** Two of these three demos read stored
    payloads and real rows rather than firing paid provider calls or offering a write path. A demo
    that can spend is a demo that will. Say so in the service docstring so the next author does not
    "improve" it by adding a live-call mode.
37. **THE FIXTURE CAN CARRY THE MEASUREMENT ITS TEST NEEDS.** The tabular captures embed
    `column_types_available_to_the_node` — the ORM field metadata measured off the live registry at
    the moment the node built its result. That is what let a test prove a typed column descriptor
    is honest rather than aspirational, with no DB access. **Rule: when the interesting claim is
    about information the producer HAD, capture that information beside the payload.**

### Friction from replication run 3 — RAG retrieval + citation family (2026-08-24, ledger `operations/rag-kinds-run.md`)

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

### Friction from replication run 4 — tabular family (2026-08-25, ledger `operations/table-kinds-run.md`)

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
| Tabular results (`data_table`) — replication run 4 | `common-docs/operations/table-kinds-run.md` | A done; **B done 2026-08-25** (`data_table` ACTIVE, demo live); V + D pending, 3 slugs cutover-gated |
| SEO rank tracking + SERP landscape — queue row 2 | `common-docs/operations/rank-kinds-run.md` | A + B DONE 2026-08-24; V + D pending |
| RAG retrieval + citations — queue row 3 | `common-docs/operations/rag-kinds-run.md` | A DONE 2026-08-24; B in flight; mints `source_ref` |
| Tabular results — queue row 4 | `common-docs/operations/table-kinds-run.md` | A DONE 2026-08-24; B in flight; mints `data_table` |

**Campaign doctrine (platform law, applies beyond kinds):** `common-docs/policies/conversion-campaigns.md` — the four consumer surfaces, demo-is-not-a-conversion, a campaign ends in a committed guard, consumer lists are computed not hand-written.

**Tracking spine:** `common-docs/operations/kind-conversion-board.md` — every family in flight, its gate (G1 enlisted → G2 blast radius → G3 shaped → G4 cut over → G5 guarded), and who holds it. A family is DONE only at G5; a demo is not a conversion. Update your row every gate.

**What to run next:** `common-docs/operations/data-to-kinds-queue.md` — the ranked inventory of every remaining candidate, each with a filled-in chip prompt. Fire one at a time; queue rows 1 and 4 mint primitives that later rows nest.
