---
status: blocked
updated: 2026-07-27
repos: [matrx-frontend, aidream]
vision: []
---

# Platform contact / entity system — design for ratification

> **Not built. Nothing applied.** This is a proposal Arman must ratify. The DDL below is a
> sketch, not a migration.
>
> **Verification caveat:** the Supabase MCP is unauthenticated in this session, so nothing was
> read from the live DB by query. Everything below was read from `types/database.types.ts`
> (generated from live), `scripts/schema-check/current-schema.json` (live snapshot
> 2026-07-25), and the applied migration files in `migrations/`. **Re-verify every table shape
> with `execute_sql` before writing a migration.**

## 1. Vision — Arman's words

> "we also want to start creating a way to manage these 'contacts' which leads to needing a
> full-scale contact management system built into our system, which is already planned but
> this is now the time that proves we need to get it done asap."

> "touches on something else that we have recently been building for our content planning
> system"

Decided already (from the brief): expert **channels** are curated platform-wide through the
existing Industries system, not a new sharing mechanism. Research is the forcing function; the
substrate must not be research-specific.

## 2. What I searched, and what exists today

Searched: `contact|person|people|expert|author|lead|profile|speaker|entity|channel|creator|
influencer` across every schema in the live snapshot; `crm|contact` across `features/`, `lib/`,
`app/`; the full `plan`, `research`, `rag`, `users`, `platform`, `seo` schemas in the generated
types; `migrations/plan_*.sql`.

**There is no contact/CRM feature in the frontend.** `features/` has 130 features; none models
an external person. `public.contact_submissions` is a marketing form inbox (name/email/message
/status), not a person record.

What *does* exist, and is directly load-bearing here:

| Thing | What it is | Why it matters |
|---|---|---|
| **`plan.entity`** (token `plan_entity`, live 2026-07-24) | `entity_type CHECK ('person','source','media','org')` · `label` · `attributes jsonb` · `source_type_id → platform.categories` · `site_id → web.site` **NOT NULL** | **This is the collision.** The content plan already models people and orgs — the E-E-A-T authors/reviewers of planned pages. Same concept, born three days ago, hard-scoped to one site. This is the "connection to content planning" Arman noticed. |
| **`rag.kg_entities`** + `rag.kg_entity_aliases` | open `kind` text · `name` · `attrs jsonb` · `canonical_id` (merge pointer) · `cluster_id` · `embedding` · `mention_count`; aliases carry `normalized_key` + `surface_form` + first/last seen | The platform **already has** a working identity-resolution shape. Not a CRM (machine-derived, no `visibility`, not registered in `entity_types`, not shareable) — but the dedup design below is lifted from it verbatim rather than invented. |
| **`rag.ner_canonicalizer_shadow`** | live A/B of deterministic vs agent merge grouping | Merge policy is already being measured. Reuse its verdicts; don't start a second experiment. |
| **`platform.associations`** + `association_types` + `edge_payload_kind`/`validate_edge_payload` | the ONE relationship system; edges carry `role`, `position`, `metadata`, and **schema-validated payloads** (`plan_review` is the live precedent) | Every edge below rides this. The validated edge payload is how per-observation provenance ships with zero new tables. |
| **`platform.categories`** (dimension + `cat_list`) | open, user/admin-editable vocabularies; `plan_person_role` / `plan_source_type` already seeded | This is how new contact *roles* appear without a migration. |
| **`platform.create_entity_table`** / `iam.apply_rls` / `iam.verify_canonical` | the canonical table factory + the only policy authority | Every table below is created this way. Never hand-write a policy. |
| **`rag.data_stores`** (open `kind` text, `discoverable`, `visibility`) + **`rag.data_store_grants`** (`audience: global|organization|industry`) | `iam.has_access` special-cases `data_store` through `public.user_can_read_data_store_via_grant` — per the access-architecture SoR this is **the only place `iam.industries`/`org_industries` affect access** | This is the entire Industries entitlement path. Curated expert sets ride it; we do not build a second one. |
| **`users.profiles`** + creator columns | internal platform users; `features/education/creators` extended it with `creator_handle`/`creator_public`/`creator_featured` **and added zero tables** | The precedent for "same entity, new facet → columns". Also: a claimed creator is the *internal twin* of an external expert — link them, never merge the tables (`profiles.id` is an `auth.users` FK; an expert has no account). |
| **`research.rs_source`** | already carries `entity_match_confidence`, `authority_score/tier/reasoning`, `redundancy_group`, `videos_per_keyword` on `rs_topic` | The expert signal is being computed already; it has nowhere to land. |

## 3. Proposed model — the simplest thing that works

### 3.1 Two tables, one of them tiny

**`platform.contact`** — a person or an organization known to the platform.

```sql
SELECT platform.create_entity_table(
  p_schema => 'platform', p_table => 'contact',
  p_token => 'contact', p_label => 'Contact',
  p_fields => ARRAY[
    $$party_kind text NOT NULL CHECK (party_kind IN ('person','organization'))$$,
    'display_name text NOT NULL',
    'sort_name text',
    'headline text',                       -- "Cardiologist, Mayo Clinic" / "SEO tooling vendor"
    'bio text',
    'primary_url text',
    'avatar_file_id uuid',                 -- via features/files; never a signed URL
    'canonical_id uuid REFERENCES platform.contact(id)',  -- merge pointer, NULL = canonical
    'is_verified boolean NOT NULL DEFAULT false',
    'confidence smallint CHECK (confidence BETWEEN 0 AND 100)',
    $$attributes jsonb NOT NULL DEFAULT '{}'::jsonb$$
  ],
  p_variant => 'entity', p_versioned => true, p_soft_delete => true,
  p_visibility => 'internal', p_listed => true,
  p_org_default => true, p_gin_jsonb => true);

UPDATE platform.entity_types SET title_column='display_name' WHERE token='contact';
CREATE INDEX ON platform.contact (canonical_id) WHERE deleted_at IS NULL;
```

**`platform.contact_identity`** — every handle we've ever seen for a contact. Component of
`contact` (composition edge → `apply_rls(..., 'component')`, access defers to the parent).

```sql
SELECT platform.create_entity_table(
  p_schema => 'platform', p_table => 'contact_identity',
  p_token => 'contact_identity', p_label => 'Contact Identity',
  p_fields => ARRAY[
    'contact_id uuid NOT NULL REFERENCES platform.contact(id) ON DELETE CASCADE',
    $$kind text NOT NULL$$,      -- email | domain | youtube_channel | linkedin | x | orcid | phone | url | name_key | matrx_user
    'value_raw text NOT NULL',
    'value_key text NOT NULL',   -- normalized: lowercased, unwrapped, channel id not @handle
    'is_primary boolean NOT NULL DEFAULT false',
    'confidence smallint CHECK (confidence BETWEEN 0 AND 100)',
    'first_seen_at timestamptz NOT NULL DEFAULT now()',
    'last_seen_at timestamptz NOT NULL DEFAULT now()'
  ],
  p_variant => 'component', p_versioned => false, p_soft_delete => true, ...);

-- the match key
CREATE UNIQUE INDEX contact_identity_strong_key
  ON platform.contact_identity (organization_id, kind, value_key)
  WHERE deleted_at IS NULL AND kind IN ('email','domain','youtube_channel','orcid','linkedin','matrx_user');
```

**That's it.** No `contact_type` table, no per-kind tables, no CRM pipeline tables.

### 3.2 How new entity kinds appear without a migration

`party_kind` is genuinely closed — a thing is a person or an organization; everything else is a
**role**, not a kind:

- **expert / lead / vendor / journalist / competitor / speaker / author** → rows in a
  `platform.categories` dimension `contact_role`, created at runtime by an admin or a user, tied
  on with a `contact → category` edge (`role='member'`) — the exact shape `plan_entity → category`
  already uses. **Zero migrations, ever.**
- **Kind-specific fields** (a YouTuber's subscriber count, a vendor's pricing page) →
  `attributes jsonb`, with an optional per-role JSON schema later, exactly as
  `plan.profile.attribute_schemas` does for verticals. Phase 3, not now.
- A role is also *derivable* rather than declared: an "expert" is any contact with an
  `appears_in`/`authored` edge to a research source above an authority threshold. The category
  is the human-curated overlay on top of that.

### 3.3 Should entity kinds reuse content-IR `__kind`? **No — and here is the line.**

`content_ir.kind_definition` types **payloads**: a JSON region in a stream or a DB block, whose
`__kind` selects a schema and a render component. It is a *content-shape* registry with a
streaming parser, a dual activation gate, and a component resolver. It has no notion of a row, an
owner, an org, RLS, or an association token.

Row typing already has its own registry: **`platform.entity_types`** (the token that
`associations`, `iam.permissions`, `shareable_resource_registry`, and `apply_rls` all key on) plus
**`platform.categories`** for open sub-vocabularies. Routing entity kinds through content-IR would
make the kind registry an access-control authority it was never built to be, and would give us two
competing type systems for the same rows — the exact defect the doctrine calls out.

**Both systems get used, for what each one is:** the agent that extracts experts from YouTube
results emits a *registered content-IR kind* (say `expert_profile` / `contact_extraction_batch`),
which streams and renders as cards while it generates; the apply step writes `platform.contact`
rows. Shape system for the wire, entity_types + categories for the rows.

### 3.4 Relationships — the tokens and pairs to register

Tokens: **`contact`** (listed, `title_column='display_name'`), **`contact_identity`**
(`is_component=true` — not attachable, never in `ENTITY_OVERLAY`).

Pairs for `platform.association_types` (direction = little points to big; `container_side='none'`
unless noted):

| Pair | Roles | Notes |
|---|---|---|
| `contact → contact` | `works_at`, `member_of`, `same_as`, `merge_candidate` | employer/affiliation is a contact-of-kind-organization, **not** `iam.organizations` (that's our tenants) |
| `contact → research_source` | `authored`, `appears_in`, `mentioned_in` | the expert↔YouTube-video edge; carries the observation payload (§3.6) |
| `contact → research_topic` | `expert_for` | "the experts for this topic" |
| `contact → transcript` | `speaker` | free once transcripts exist |
| `contact → seo_topic` | `topic` | mirrors `plan_entity → seo_topic` |
| `contact → web_site` | `owns`, `writes_for` | replaces `plan.entity.site_id` as an *edge*, not a NOT NULL column |
| `contact → category` | `member` | the role vocabulary |
| `contact → data_store` | `member` | **container=target, conveys viewer** — the sharing hook (§3.7) |
| `plan_node → contact` | `authored_by`, `reviewed_by`, `about`, `cites` | **direction deliberately mirrors the live `plan_node → plan_entity` pair.** Direction is a product fact — Arman's call, not mine (Decision 4) |

Everything else — attaching a contact to a project, task, war room, org page, scope — comes free
from **one line** in `ENTITY_OVERLAY` (`features/scopes/registry/entityRegistry.ts`), per the
canonical-associations skill. No per-surface work.

### 3.5 Identity resolution / dedup — merge is a pointer, never a rewrite

The same person arrives from a YouTube channel, a scraped bio, a PDF byline, and a manual entry.

**Match keys, tiered.**
- **Strong** (`email`, `domain`, `youtube_channel` id, `orcid`, `linkedin` URL, `matrx_user`) —
  a collision on the unique index above *is* the identity. Auto-merge.
- **Weak** (`name_key` = normalized display name, plus co-occurrence: same employer edge, same
  research topic, embedding similarity on `headline`+`bio`) — **propose only, never merge.**

**A merge proposal is an edge, not a table.** `contact → contact` with `role='merge_candidate'`
and `metadata = {score, method, evidence[]}`. Confirm → set `canonical_id`, delete the edge.
Reject → mark the edge rejected so it is never re-proposed. Zero new tables; the review UI is the
existing association surfaces.

**Merging never destroys anything.** The loser row stays live with `canonical_id` set. Its
identities, its edges, and its provenance stay attached *to it*. Reads resolve through
`coalesce(canonical_id, id)`. **Undo is one UPDATE** setting `canonical_id = NULL` — because
nothing was ever rewritten, unmerge is exact, not best-effort. This is `rag.kg_entities`'
model, reused rather than reinvented.

**Audit for free:** merges/unmerges write to `platform.activity_log` (`entity_type='contact'`,
`action='merge'|'unmerge'`, actor, metadata) — an existing polymorphic satellite.

**Loud recovery:** a strong-key collision across two rows that *already* have different
`canonical_id` chains is a real conflict, not a merge — it screams (`captureError`) and lands in
the review queue. It never silently picks a winner.

### 3.6 Provenance — "we believe this because…"

**Observation-level (Phase 2, no new tables).** Register an `edge_payload_kind`
**`contact_observation`** (v1) on `contact → research_source`, validated by the live
`validate_edge_payload` the way `plan_review` already is:

```jsonc
{ "observed_at": "2026-07-27T…", "run_id": "…", "agent_id": "…", "model_id": "…",
  "confidence": 82, "fields": { "headline": "…", "credentials": ["…"] }, "quote": "…" }
```

Every fact an agent asserted arrives attached to the edge that carries *which source, which run,
which agent* — so the UI renders "we believe this because…" by walking the contact's incoming
edges and deep-linking each source, exactly the way the research Evidence panel and the citations
system already deep-link a mention via `citationHrefFor()`.

**Field-level (Phase 2b, only if the above proves insufficient):** a `platform.contact_fact`
table (`contact_id`, `field`, `value`, `source_type/source_id`, `run_id`, `confidence`,
`status`) so a single field can carry competing claims and a human verdict. **I am deliberately
not proposing this now** — the edge payload answers the stated requirement, and one table beats
two until a real conflict-resolution UI demands it.

### 3.7 Curation + sharing — ride Industries, add nothing

Per the access-architecture SoR, `rag.data_store_grants` (`audience: global|organization|industry`)
is the **only** mechanism by which industries affect access, and `iam.has_access` already
special-cases `data_store` through `public.user_can_read_data_store_via_grant`.

So a **curated expert set is a `rag.data_stores` row with `kind='contact_set'`** — `kind` is
already open text — and contacts join it via the `contact → data_store` edge registered with
`container_side='target'`, `conveys_max='viewer'`, mirroring the live `file → data_store`
conveyance that already makes shared-library files readable.

What that buys, with **zero new sharing code**:
- Platform-curated sets live in the system org (`39c38960-d30c-4840-b0c1-c9960de95582`), granted
  to an industry — every org in that industry reads them.
- The existing Library Catalog subscribe/unsubscribe UI and the `OrgIndustriesSection`
  "what this industry unlocks" panel light up for contact sets for free.
- Per-tenant contacts stay `visibility='internal'`, invisible to everyone else. Nothing about
  curation touches per-tenant data.
- **THE VIEW LAW holds:** the `/contacts` list declares its own scope (Mine / My Orgs / Shared /
  Public), never a bare RLS-filtered read. Curated platform contacts appear under a deliberate
  destination, never flooding a personal list.

### 3.8 Cross-feature consumers on day one

- **Research (the forcing function).** Experts extracted from YouTube results become contacts;
  `contact → research_source` edges carry the video. The Context Builder gains **one entry** in
  `features/research/resources/catalog.ts` (`topic.experts`) and every bundle, budget meter, and
  agent picks it up with no other change — that catalog is explicitly designed so adding a kind is
  one entry.
- **Content planning.** `plan_node → contact` `authored_by`/`reviewed_by` is the E-E-A-T half of
  the plan, and `plan.profile.schema_org_map` already exists to emit `Person` JSON-LD. Today the
  expert research discovers and the author the plan cites would be two unrelated rows in two
  tables. **This is the concrete connection Arman noticed** — and the reason to do it now, before
  `plan.entity` accumulates real data (see Decision 3).
- **Marketing / SEO.** Competitor organizations resolved from `seo.serp_result` hostnames become
  contacts of kind `organization` with a `domain` identity; `contact → web_site` links them to
  crawled sites. Backlink and SERP surfaces get a real subject instead of a bare hostname.
- **Agent context.** A contact is attachable to a scope the moment the token is registered, so it
  flows into `resolve_full_context` with no per-feature work; `rs_context_bundle` selectors gain
  a contact kind.
- **Later, not day one:** `public.contact_submissions` (an inbound form submission resolves to /
  creates a contact), `features/education/creators` (a claimed creator gets a `matrx_user`
  identity pointing at the external contact record).

## 4. Phasing

**Phase 0 — unblock research (one migration + a thin FE slice).**
`platform.contact` + `platform.contact_identity`; both tokens registered; `apply_rls` +
`verify_canonical` green; the association pairs in §3.4 registered; `pnpm db-types` +
`pnpm gen:entity-types` + aidream `python db/generate.py`; one `ENTITY_OVERLAY` line;
`contactsService` (writes only through `associationsService` for edges); a `/contacts` list page
built on the canonical entry-list shell (`features/agents/browse/FEATURE.md` +
`useListViewPrefs` + `ItemMenuConfig` + `MatrxDataTable` controlled) — **not a fifth variant**.
Research writes experts; nothing else changes.

**Phase 1 — dedup.** Identity normalization (pure, importable), the strong-key auto-merge,
`merge_candidate` edges from the weak matchers, merge/unmerge RPCs (public schema, `auth.uid()`
gated, `activity_log` audited), and a review surface. Consume `ner_canonicalizer_shadow`'s
verdicts rather than starting a second experiment.

**Phase 2 — provenance.** `contact_observation` edge payload kind + validator registration; the
"we believe this because…" panel reusing the research Evidence/citation deep-link.

**Phase 3 — curation + sharing.** `rag.data_stores kind='contact_set'`, the `contact → data_store`
conveying pair, industry grants, catalog surfacing.

**Phase 4 — convergence.** `plan.entity` person/org rows migrate to `platform.contact`;
`plan_node → contact` replaces `plan_node → plan_entity` for those two types; marketing/SEO and
agent-context consumers land. Cross-repo (aidream ORM + the content-plan server work) — needs its
own change, applied in lockstep.

**Phase 5 — CRM proper, only when a real workflow demands it.** Owner, pipeline status, outreach
activity, sequences. Deliberately last: none of it is needed to manage experts, and building it
speculatively is exactly the complexity this platform's prime rule forbids.

**Minimum that unblocks research without painting us into a corner: Phase 0 alone.** Two tables,
one overlay line, one list page. Every later phase is additive — no phase requires reshaping what
Phase 0 ships.

## 5. Decisions needed

Each is self-contained; none has a best-practice answer I can apply on my own authority.

**1. What is this thing called?**
*Situation.* The table has to hold experts, leads, authors, speakers, competitors, and vendors —
"contact" is your word for it, but most of those are people you never contact. Accounting systems
call this a "party"; the plan schema already calls its version an "entity".
*Decide.* Table/token/route name: **`contact`** (recommended — it's your word, users understand
it, and "contact" reading oddly on a competitor is cheaper than a name nobody recognizes) ·
`party` · `entity` · something else.

**2. Which schema does it live in?**
*Situation.* `platform` is already PostgREST-exposed and already holds cross-cutting product data
(`categories`, `comments`, `share_links`), so tables there work immediately. A dedicated schema
(`crm`, `contacts`) reads cleaner, but PostgREST exposure is Supabase dashboard config that agents
cannot set — it would block the whole thing until you do it by hand.
*Decide.* **`platform.contact`** (recommended — no blocker) · a new schema, and you flip exposure
in the dashboard first.

**3. Does `plan.entity` fold into this, or do both live on?**
*Situation.* `plan.entity` went live 2026-07-24 with `entity_type IN ('person','source','media',
'org')` and holds the authors/reviewers of planned pages. It is the same concept as a contact,
scoped to one website. If both live on, the author of a published page and the expert research
found will be two unrelated rows forever.
*Decide.* (a) Migrate `person` + `org` rows to `platform.contact`, keep `plan.entity` for
`source`/`media` only, site linkage becomes a `contact → web_site` edge (recommended — do it now
while `plan.entity` is nearly empty) · (b) Retire `plan.entity` entirely (`source` is a citation,
`media` is a file — both already have homes) · (c) Leave both, accept the split.

**4. Which way do contact edges point, and what conveys access?**
*Situation.* The registry direction rule is "little points to big", but the live content-plan pair
is `plan_node → plan_entity` (page points at person). I mirrored that for `plan_node → contact`
rather than flip it. Separately, `contact → data_store` needs a conveyance decision: if it conveys
viewer, being in a shared expert set makes the contact readable through that set.
*Decide.* Confirm `plan_node → contact` (page → person) or flip it; and confirm
`contact → data_store` conveys **viewer** (recommended — it's how shared libraries already work
for files).

**5. Is a curated expert set a `rag.data_stores` row?**
*Situation.* Industry entitlement runs through exactly one mechanism: `rag.data_store_grants`.
Reusing it means an expert roster is literally a "data store" with `kind='contact_set'` — free
industry grants, free subscribe UI, zero new sharing code, but a slightly odd noun in the DB.
*Decide.* Reuse `rag.data_stores` (recommended) · or you want a distinct container concept, which
means extending the grant path to a second resource type.

**6. What may merge without a human?**
*Situation.* Two contacts sharing an email, a domain, a YouTube channel id, an ORCID, or a
LinkedIn URL are almost certainly the same. Name-only or embedding-similarity matches are not.
*Decide.* Confirm the strong-key list above as auto-merge and everything else as propose-only ·
or require human confirmation for **every** merge at first (safer, slower, and it will queue up
fast once research runs at volume).

**7. Where do platform-curated contacts live?**
*Situation.* A curated industry expert set can be one set of rows in the system org that every
entitled org reads, or a copy per org that each tenant can edit.
*Decide.* **System-org rows + industry grant** (recommended — one truth, one curation surface, and
it matches how shared libraries already work; tenants can't edit them) · per-org copies (tenants
can annotate, but the platform asset immediately forks).

**8. Default visibility.**
*Situation.* `visibility='personal'` means "belongs to one human". A contact discovered by a
research run belongs to the org that ran it, not to the person who clicked go.
*Decide.* Confirm **`internal`** (org-wide) as the default — recommended, and consistent with
`plan.*`.
