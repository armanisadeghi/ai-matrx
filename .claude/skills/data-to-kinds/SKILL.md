---
name: data-to-kinds
description: The end-to-end pipeline that turns any structured data source (an API response, a provider payload, a computed result) into registered platform kinds with pydantic models, generated TypeScript types, kind components, and a live end-to-end demo — through staged human approval with Arman. Use when asked to "create kinds for X", "distill X into kinds", "put X through the data-to-kinds process", or when you are Stage A/B/C of a running data-to-kinds pilot. NOT for consuming kinds that already exist (that's workflow-io-kinds in aidream / shape-system docs in matrx-frontend).
---

<!-- SYNCED COPY — do not edit here.
     Canonical: common-docs/skills/data-to-kinds/SKILL.md
     This file is distributed to every consuming repo by
     common-docs/meta/scripts/sync_skills.py. Edit the canonical, run the
     sync, and commit each repo. Edits made here are overwritten and lost. -->

# data-to-kinds — from raw data to a fully-rendered platform kind

> **This skill is SELF-IMPROVING and that is a standing instruction, not a nicety.**
> Every agent running a stage works interactively with Arman. When he gives you an
> instruction that generalizes beyond your current data family ("always do X",
> "never include Y", a rule about required fields, a naming preference), you edit
> THIS skill in the same session — canonical copy at
> `common-docs/skills/data-to-kinds/SKILL.md`, then run
> `python3 common-docs/meta/scripts/sync_skills.py` to redistribute (this skill is
> mirrored into aidream and matrx-frontend; NEVER edit a repo copy — it is erased
> by the next sync). Task-specific decisions go in the pilot's state doc, not here.

## Why this exists (Arman, 2026-08-20, condensed from his words)

Content IR is the uniform language every part of the system speaks. When data is
derived programmatically, emitting a kind is the easiest thing in the world — the
function just spits out the object in exactly the shape we want — and then every
surface (web, mobile, desktop), every workflow node, and every agent can count on
that shape: no type errors, universal rendering, no custom code. The mistake that
poisoned workflows was confusing the INTERNAL wrapper (runtime recognition of a
step) with the DATA it holds. Both are kinds; they are different kinds; they nest
and never merge.

## The layer model (shared vocabulary for every stage)

1. **Data kinds** — pure, portable shapes (`website`, `web_search_results`). No
   runtime info, no provider mess. These travel anywhere and render anywhere.
   Registry metadata `category: data`.
2. **Runtime wrapper kinds** — the canonical envelopes carrying instance context
   (which workflow, which node, which run, timing, verdicts) with the data kind
   NESTED inside as a typed payload field. One canonical set, reused everywhere,
   never re-invented per feature. Registry metadata `category: runtime`.
3. Rules: a wrapper never absorbs payload fields; a payload never carries runtime
   fields. If data inside a wrapper is anything more than plain text, it is an
   object that should itself be a kind.

## The three stages and the human gates

Every stage works WITH Arman in-session. Every decision about what data is kept,
merged, required, or dropped is HIS. Bring him proposals he can read in one look
(markdown tables), never walls of JSON, never questions without the material to
answer them (the page/action/question rule).

### Stage A — Distill (Python repo: aidream)

1. **Study the real data.** Call the live source(s) (real API calls, real
   credentials from the platform's existing config — never fabricate samples).
   Capture representative raw responses into the pilot's scratch area.
2. **Propose the shapes as simple markdown tables** — one table per proposed
   kind: field · type · required/optional · source path in the raw payload ·
   kept-or-dropped-and-why. Plus one table listing DROPPED top-level sections
   and why. Multiple related sources stay SEPARATE at first — do not bastardize
   one to fit the other's mold. After separate agreement, present a merge
   analysis: what can share a kind without losing provenance identity, what
   stays provider-specific.
3. **Iterate with Arman until he agrees on every table.** Only then write code.
4. **Build the pydantic models in a parallel path** (new module; do not modify
   the live node/service path yet). Kind models declare the discriminator as a
   real field (Stripe-style: part of the data, never injected/stripped). Nested
   kinds are nested models. Check whether the kind SDK (`@kind` decorator /
   `KindModel` base in matrx-graph's content_ir package) exists yet — use it if
   so; if not, follow the registration recipe in aidream's `workflow-io-kinds`
   skill (seed SQL + ledger + cache invalidation + live verify) and record the
   friction points in this skill's "SDK wishlist" section below.
5. **Register the kinds** (system org, `visibility='public'`, canonical examples
   validated BEFORE seeding, `kind_edge` rows for nesting) and **verify TS type
   generation picks them up** (the generated-types artifact both apps consume).
6. **Gate: Arman approves the registered set.** Then update the pilot state doc
   (mark Stage A DONE with the registered slugs) and **fire the Stage B chip**
   with a fully standalone prompt (name the kinds, the demo endpoint, the pilot
   doc). If you cannot create a background task/chip from your session, write
   the exact Stage B prompt into the pilot state doc and tell Arman it is ready
   to launch.

### Stage B — Render (frontend repo: matrx-frontend)

1. **Survey what already exists** for this data family — the platform has
   usually built renderers for it several times under different names. Inventory
   them (the Inventory Law), take the best of the best, and design ONE canonical
   component per kind. The goal is convergence: many bespoke displays collapse
   into the kind's component.
2. **Build the kind components** (web platform first), register them in
   `content_ir.kind_component`, and wire the shapes per the Shape System doc
   (`features/content-ir/docs/SHAPE_SYSTEM.md`). Nested kinds render by
   recursion — the parent's component delegates each nested kind instance to the
   registry, never reimplements it.
3. **Build the end-to-end demo** Arman can open: a demo page that triggers a
   REAL action on the aidream server via API, receives the kind-carrying
   response, and renders it entirely through kind components. No mocks, no
   pasted fixtures — the demo proves the whole pipe: server model → registry →
   generated types → component.
4. **Gate: Arman approves the rendering and the demo.** Iterate with him on the
   shapes' look using the demo. Then update the pilot state doc (Stage B DONE,
   demo URL recorded) and **fire the Stage C chip**.

### Stage C — Review and generalize (any repo; owns this skill)

1. Review the entire run start-to-finish: what the skill said vs what actually
   happened, every place an agent needed information the skill didn't carry,
   every Arman instruction that should have been standing law.
2. **Rewrite this skill** so the next run needs no explanation from anyone.
3. **Trigger the replication run**: pick the next data family from the pilot
   state doc's queue and fire a Stage A chip that references ONLY this skill.
   The replication run is the test — its friction is your failure list.

## Standing rules (all stages)

- **Every keep/drop/merge/require decision is Arman's.** Propose; never decide.
- **Content IR alignment binds you.** `common-docs/systems/content-ir-system/UNIFICATION.md`:
  this is ONE system — XML/markdown/fence arrival surfaces stay first-class, frozen block-type
  values never change, and kinds-as-JSON is the internal form, never a forced wire format.
  Check `NOMENCLATURE.md` and the lexicon before any name; check the registry before any mint.
- **Provenance survives merging.** A shared kind keeps source identity (e.g. a
  `source` field or provider-specific companion kinds) — merge shapes, never
  origins.
- **Specific kinds, without going overboard.** A repeated, reusable structure
  gets a kind; a one-off blob does not. When unsure, ask with a table.
- **Reuse before minting.** Check the registry and the well-known kinds first;
  a near-duplicate slug is a defect. Naming per
  `common-docs/systems/content-ir-system/NOMENCLATURE.md` (short snake_case
  noun, no provider prefixes on shared kinds, no hashes, no node names).
- **Parallel path until approval.** Live nodes/services/routes are repointed
  only after Arman approves the registered set (Stage A) or the components
  (Stage B).
- **Completion signaling.** Each stage ends by updating the pilot state doc
  (status line + artifacts produced) AND firing the next stage's chip. The
  state doc is the durable signal the orchestrating session watches.
- **Commit and push as you go.** Docs, models, seeds, components — small
  commits to origin/main; the state doc row is only true once pushed.

## Distillation laws (Arman, 2026-08-20, ratified during the first run)

- **A drop is a loss of data we paid for.** Never inherit a drop from the existing
  code — past code dropping a field may have been the mistake this pipeline exists
  to fix. Every drop is justified on its own merits. Drop freely ONLY provider
  plumbing: request echoes, tracking/redirect links, pagination endpoints, the
  provider's own UI chrome. Real-world data defaults to KEPT, as structure.
- **Provider asymmetry is never a drop reason.** One provider carrying a field the
  other lacks → optional field on the shared kind; map both providers' variants
  onto the same field wherever the underlying data is the same thing.
- **Known string formats become structured data.** Parse hours, dates, ratings,
  addresses into typed structure. Retain the original string alongside only when
  the parse is lossy or relative ("2 weeks ago"); never synthesize precision the
  source didn't give. Datetimes/URLs stay scalar JSON-Schema formats, not kinds.
- **Recurring small structures are core-primitive candidates.** When the same
  small shape shows up across sections or providers (rating, opening hours,
  postal address, geo coordinates), propose it as a system-wide primitive kind —
  small kinds held by bigger kinds. Check the registry first; never mint a
  primitive that exists.
- **Layer where identification helps; never a wrapper that carries nothing.**
  Every level whose identification helps downstream handling gets a kind (the
  collection, the item, the primitive). But a wrapper whose only content is its
  payload is over-layering — self-identifying item kinds (discriminator as a
  real field) already make any single item portable to any surface.
- **Embedded HTML is judged by what's inside.** Pre-rendered UI with no unique
  data → discard. Unique data wearing HTML formatting → convert to structure
  (text + extracted links); never store raw provider HTML in a kind.
- **One copy of everything.** Kinds reference canonical entities rather than
  duplicating them; merged kinds keep provenance (a `source`/provider field),
  never duplicate records per provider.

## THE MERGE + TRANSLATION LAW (Arman, 2026-08-20 — platform-level, unbreakable)

- **Provider-named kinds are BANNED.** `brave_search_results` next to
  `google_search_results` next to `bing_search_results` is the death of the kind
  system — 100 kinds is the same as no kinds. Things of the same kind, type, or
  purpose get ONE merged kind; the provider is a `source` field, never a slug.
  Adding a provider means writing one adapter, never minting a kind.
- **Every provider gets a TRANSLATION ADAPTER, modeled on the AI request
  system.** Exactly as any provider's model config translates into any other
  provider's call (configuration equivalence), each raw payload translates INTO
  the shared kind: value vocabularies map ("US" ↔ "United States"), equivalent
  concepts land in one field however each provider spells them, and a field one
  provider lacks is DERIVED when an honest derivation exists (rank from array
  order, `published_at` parsed from a date string, an approximation when the
  source is relative). Use code to unify — the fewer optional fields, the more
  every downstream can count on, the more valuable the data.
- **The pipeline is never lossy by accident.** An adapter declares every raw key
  in exactly one of two sets: MAPPED (raw path → kind field) or DROPPED (named
  key + reason, approved by Arman, visible in code). Any key in neither set is
  UNKNOWN and must scream loudly (log + ops record) — that is how a provider
  adding a field gets noticed instead of silently discarded. This is the
  configuration-equivalence lesson (`on_unmapped='drop'` silently discarded
  1,139 combinations) applied at every data boundary.

## SDK wishlist (Stage A agents append friction here; the SDK build consumes it)

- (empty — first run pending)

## Active pilots

| Pilot | State doc |
|---|---|
| Search results (Brave + SerpAPI Google) | `common-docs/systems/content-ir-system/SEARCH_KINDS_PILOT.md` |
