---
status: blocked
updated: 2026-07-27
repos: [matrx-frontend, aidream]
vision: []
---

# Entities + CRM — the platform noun and the per-org stance

> **Not built. Nothing applied.** Proposal for Arman's ratification; the DDL is a sketch.
>
> **Verification caveat:** the Supabase MCP is unauthenticated in this session. Everything below
> was read from `types/database.types.ts` (generated from live), the committed live-schema
> snapshot `scripts/schema-check/current-schema.json` (2026-07-25), and applied files in
> `migrations/` — **not** from a live query. Re-verify every shape with `execute_sql` before
> writing a migration.

## 1. Vision — Arman's words

> "These would be entities, especially when you look at our new content planning system. That's
> literally what they're called. But the key here is to understand the big picture of where the
> app is going and the fact that we need to have contacts so that a sales team and marketing team
> or outreach team can create contacts or you can save people and companies and do the CRM stuff."

> "the plan entities are the same thing. They're… each module is being forced to create their own
> version because we don't have a centralized version of it. Right? And we need to."

> "when you start to centralize it, you start to realize that we can even have experts that we
> sort of offer as part of our system. Right? And so people could even register to become experts
> for us or leaders and things like that."

> "The CRM is like every other feature of our app. It's for the users and orgs." — a tenant
> feature, not an agency tool. Part of the AI-first Office/Workspace suite: PM + tasks, workbooks
> + docs, media, cloud files, cloud coding + sandboxes, local/mobile/extension clients, marketing
> + SEO, a built-in CMS. **"Our system is all about everything being fully interconnected and
> having a single place you go for everything."**

> "WE ARE NOT scraping and contacting. What our users do has nothing to do with us… We will
> accept experts but we're not going out looking for them." A user researching *Glioblastomas* may
> want to reach experts at Harvard Med / Mass General / Cleveland Clinic — **their** business.
> Experts who come to us get a revenue stream through the education surface.

> Expert tiers: "We can have people register and then we can have approved people and registered
> ones. If we vet them, then they get another level — but to start, we don't want to take this too
> far. For now, simple, but set up so it connects easily when we expand it." Directory is
> **public**. Timing: "I own 5 companies and my employees are dying to get this in place right
> now."

## 2. The insight this whole design rests on

**Entity and contact are not two concepts that merge. They are one noun and one stance.**

- The **party** is who someone is *in the world* — name, identities (channel, email, domain,
  ORCID), credentials, bio, reach, and the provenance behind every claim. Deduped, enriched over
  time, sometimes curated by us and shared across tenants.
- The **contact** is *one org's relationship with that party* — owner, status, tags, last touch,
  notes. Per-tenant, private, opinionated, never leaves the org.

That split is exactly why every module reinvents this: each one needs the noun and none wants the
other's stance. Centralize the noun once; let every domain express its stance as association
edges plus, where it needs real state, a small per-domain row.

**It is also a hard access boundary, not a preference.** Put `status`/`owner` on the shared party
row and a platform-curated expert set can no longer be shared — publishing it would leak one
org's sales state to every org in the industry. The separation is what makes curation possible.

**And it is what makes the CRM interconnected instead of a silo.** A party is a registered entity
token, so the "360° view" a CRM normally has to build — every task, note, file, document,
research topic, transcript, plan node, and project touching this person — is already solved:
`platform.associations` + `AssociationCardGrid` render it from **one line** in `ENTITY_OVERLAY`.
The CRM doesn't build a timeline; it inherits the platform's.

## 3. What exists today (searched, then read)

Searched: `contact|person|people|expert|author|lead|profile|speaker|entity|channel|creator|
influencer` across every schema in the live snapshot; `crm|contact` across `features/`, `lib/`,
`app/`; the full `plan`, `research`, `rag`, `users`, `platform`, `seo` schemas in the generated
types; `migrations/plan_*.sql`.

**No CRM or contact feature exists in the frontend.** 130 features, none models an external
person. `public.contact_submissions` is a marketing form inbox, not a person record.

| Thing | What it is | Why it matters |
|---|---|---|
| **`plan.entity`** (token `plan_entity`, live 2026-07-24) | `entity_type CHECK ('person','source','media','org')` · `label` · `attributes jsonb` · `source_type_id → platform.categories` · `site_id → web.site` **NOT NULL** | The forced local copy Arman describes. Holds the E-E-A-T authors/reviewers of planned pages, hard-scoped to one site. Nearly empty — cheap to fold in now, expensive in a month. |
| **`rag.kg_entities`** + `kg_entity_aliases` | open `kind` · `name` · `attrs` · **`canonical_id`** (merge pointer) · `cluster_id` · `embedding` · `mention_count`; aliases carry `normalized_key`/`surface_form`/first+last seen | The platform already has a working identity-resolution shape. Machine-derived, no `visibility`, unregistered — not the CRM, but the dedup design below is lifted from it rather than invented. |
| **`rag.ner_canonicalizer_shadow`** | live A/B of deterministic vs agent merge grouping | Merge policy is already being measured. Consume its verdicts; don't start a second experiment. |
| **`platform.associations`** + `association_types` + `edge_payload_kind` / `validate_edge_payload` | the ONE relationship system; edges carry `role`, `position`, `metadata`, and schema-validated payloads (`plan_review` is the live precedent) | Every relationship below rides this. Validated edge payloads carry per-observation provenance with zero new tables. |
| **`platform.categories`** (+ `cat_list`) | open, runtime-editable vocabularies; `plan_person_role` / `plan_source_type` already seeded | How new roles and pipeline stages appear without a migration. |
| **`platform.comments`** / **`platform.activity_log`** / **`platform.user_entity_state`** | polymorphic satellites keyed on `(entity_type, entity_id)` | CRM notes, audit trail, and favorites/pins/recents — free the moment the token is registered. |
| **`platform.create_entity_table`** / `iam.apply_rls` / `iam.verify_canonical` | canonical table factory + the only policy authority | Every table below is created this way; never hand-write a policy. |
| **`rag.data_stores`** (open `kind`, `discoverable`, `visibility`) + **`rag.data_store_grants`** (`audience: global\|organization\|industry`) | per the access-architecture SoR, `iam.has_access` special-cases `data_store` via `public.user_can_read_data_store_via_grant` — **the only place industries affect access** | The entire Industries entitlement path. Curated expert sets ride it; we do not build a second one. |
| **`features/education/creators`** + `users.profiles.creator_*` | public handle claim → `/c/[handle]` with `Person` JSON-LD, featured videos, free tools, paid classes, **Stripe Connect payouts** — and it added **zero tables** | This is ~60% of "experts register with us and earn." Expert registration is the creator claim generalized. |
| **`features/tasks`**, `features/notes`, `features/files` | live, association-attachable | The CRM's next-action / notes / attachments. Never re-implemented inside the CRM. |

## 4. The model

### 4.1 `platform.party` — the noun

```sql
SELECT platform.create_entity_table(
  p_schema => 'platform', p_table => 'party', p_token => 'party', p_label => 'Entity',
  p_fields => ARRAY[
    $$party_kind text NOT NULL CHECK (party_kind IN ('person','organization'))$$,
    'display_name text NOT NULL',
    'sort_name text',
    'headline text',                      -- "Neuro-oncologist, Mass General"
    'bio text',
    'primary_url text',
    'avatar_file_id uuid',                -- via features/files; never a signed URL
    'canonical_id uuid REFERENCES platform.party(id)',   -- merge pointer; NULL = canonical
    'attributes jsonb NOT NULL DEFAULT ''{}''::jsonb',
    -- OUR platform stance (global, identical for every viewer) — never a tenant''s stance
    $$expert_status text CHECK (expert_status IN ('registered','approved','vetted'))$$,
    'claimed_by uuid REFERENCES auth.users(id)',
    'claimed_at timestamptz'
  ],
  p_variant => 'entity', p_versioned => true, p_soft_delete => true,
  p_visibility => 'internal', p_listed => true, p_org_default => true, p_gin_jsonb => true);

UPDATE platform.entity_types SET title_column='display_name' WHERE token='party';
CREATE INDEX ON platform.party (canonical_id) WHERE deleted_at IS NULL;
```

`party_kind` is the only closed set — a thing is a person or an organization. **Expert, lead,
vendor, journalist, competitor, speaker, author are roles, not kinds:** rows in a
`platform.categories` dimension `party_role`, created at runtime and attached by a
`party → category` edge (`role='member'`), exactly as `plan_entity → category` already works.
**No migration, ever, for a new kind.** Role-specific fields live in `attributes jsonb`, with an
optional per-role JSON schema later — the shape `plan.profile.attribute_schemas` already uses.

`expert_status` is deliberately on the party and deliberately *not* a tenant stance: "approved by
Matrx" is true for every viewer. Three values now, extensible by one CHECK edit. NULL = we hold a
record, nobody has registered.

### 4.2 `platform.party_identity` — the match key

Component of `party` (composition edge → `apply_rls(..., 'component')`; access is the parent's).

```sql
p_fields => ARRAY[
  'party_id uuid NOT NULL REFERENCES platform.party(id) ON DELETE CASCADE',
  'kind text NOT NULL',      -- email|domain|youtube_channel|linkedin|x|orcid|phone|url|name_key|matrx_user
  'value_raw text NOT NULL',
  'value_key text NOT NULL', -- normalized: lowercased, unwrapped, channel id not @handle
  'is_primary boolean NOT NULL DEFAULT false',
  'confidence smallint CHECK (confidence BETWEEN 0 AND 100)',
  'first_seen_at timestamptz NOT NULL DEFAULT now()',
  'last_seen_at timestamptz NOT NULL DEFAULT now()'
]

CREATE UNIQUE INDEX party_identity_strong_key
  ON platform.party_identity (organization_id, kind, value_key)
  WHERE deleted_at IS NULL
    AND kind IN ('email','domain','youtube_channel','orcid','linkedin','matrx_user');
```

### 4.3 `platform.contact` — one org's stance (the CRM record)

```sql
p_fields => ARRAY[
  'party_id uuid NOT NULL REFERENCES platform.party(id)',
  'owner_id uuid REFERENCES auth.users(id)',            -- the teammate working it
  'status_id uuid REFERENCES platform.categories(id)',  -- dimension party_contact_status, open vocab
  'source text',                                        -- how it entered: research | import | manual | form
  'last_touch_at timestamptz',
  'attributes jsonb NOT NULL DEFAULT ''{}''::jsonb'
]
CREATE UNIQUE INDEX contact_org_party_key ON platform.contact (organization_id, party_id)
  WHERE deleted_at IS NULL;
```

Six columns, because everything else already exists and must not be re-implemented:

| CRM need | Served by |
|---|---|
| Notes / activity thread | `platform.comments` (`entity_type='contact'`) |
| Audit trail | `platform.activity_log` |
| Next action, follow-ups | a real **task** (`contact → task` edge) — it shows in the user's task list, not a private CRM field |
| Attachments, decks, contracts | `contact → file` edge via `features/files` |
| Tags | `contact → category` edges |
| Pipeline stages | `platform.categories` dimension — each org edits its own vocabulary, no migration |
| Favorites / pins / recents | `platform.user_entity_state` |
| Everything this person touches | `AssociationCardGrid` on the party |

Deliberately **not** in v1: deals/opportunities with amounts, sequences, email & calendar sync,
forecasting, lead scoring. None of it changes this schema, so all of it waits for a real workflow.

### 4.4 Should party kinds reuse content-IR `__kind`? No — and here is the line

`content_ir.kind_definition` types **payloads**: a JSON region in a stream or a DB block whose
`__kind` selects a schema and a render component. It has no notion of a row, an owner, an org,
RLS, or an association token. Row typing already has its registry — `platform.entity_types` (the
token `associations`, `iam.permissions`, `shareable_resource_registry`, and `apply_rls` all key
on) plus `platform.categories` for open sub-vocabularies. Routing party kinds through content-IR
would make the kind registry an access-control authority it was never built to be, and give us
two competing type systems for the same rows.

**Both get used, for what each is:** the agent extracting experts from research emits a
*registered content-IR kind* (`expert_profile` / `party_extraction_batch`) so results stream and
render as cards while generating; the apply step writes `platform.party` rows. Shape system for
the wire, `entity_types` + `categories` for the rows.

### 4.5 Relationships — tokens and pairs

Tokens: **`party`** (listed, `title_column='display_name'`), **`contact`** (listed),
**`party_identity`** (`is_component=true` — never in `ENTITY_OVERLAY`).

Direction is little → big; `container_side='none'` unless noted.

| Pair | Roles |
|---|---|
| `party → party` | `works_at`, `member_of`, `same_as`, `merge_candidate` (employer = a party of kind organization, **never** `iam.organizations` — those are our tenants) |
| `contact → party` | *(FK, not an edge — one stance per org per party)* |
| `contact → task` / `contact → file` / `contact → note` | `follow_up`, `attachment`, `note` |
| `party → research_source` | `authored`, `appears_in`, `mentioned_in` |
| `party → research_topic` | `expert_for` |
| `party → transcript` | `speaker` |
| `party → seo_topic` | `topic` |
| `party → web_site` | `owns`, `writes_for` (replaces `plan.entity.site_id` as an edge, not a NOT NULL column) |
| `party → category` | `member` |
| `party → data_store` | `member` — **container=target, conveys viewer** (§4.8) |
| `plan_node → party` | `authored_by`, `reviewed_by`, `about`, `cites` — direction mirrors the live `plan_node → plan_entity` pair (Decision 3) |

Attaching a party or contact to a project, task, war room, org page, or scope comes free from
**one line each** in `ENTITY_OVERLAY` (`features/scopes/registry/entityRegistry.ts`).

### 4.6 Identity resolution — merge is a pointer, never a rewrite

- **Strong keys** (`email`, `domain`, `youtube_channel` id, `orcid`, `linkedin`, `matrx_user`) —
  a collision on the unique index *is* the identity. Auto-merge.
- **Weak signals** (normalized name, shared employer edge, shared topic, embedding similarity on
  `headline`+`bio`) — **propose only**.
- **A proposal is an edge, not a table:** `party → party`, `role='merge_candidate'`,
  `metadata={score, method, evidence[]}`. Confirm → set `canonical_id`, drop the edge. Reject →
  mark the edge rejected so it is never re-proposed.
- **Nothing is destroyed.** The loser row stays live with `canonical_id` set; its identities,
  edges, and provenance stay attached to it. Reads resolve through `coalesce(canonical_id, id)`.
  **Unmerge is one UPDATE** setting `canonical_id = NULL` — exact, not best-effort.
- Merges/unmerges log to `platform.activity_log`. A strong-key collision between rows already on
  different `canonical_id` chains is a **conflict, not a merge**: it screams (`captureError`) and
  queues for a human. It never silently picks a winner.

### 4.7 Provenance — "we believe this because…"

Register an `edge_payload_kind` **`party_observation`** (v1) on `party → research_source`,
validated by the live `validate_edge_payload` the way `plan_review` already is:

```jsonc
{ "observed_at": "…", "run_id": "…", "agent_id": "…", "model_id": "…",
  "confidence": 82, "fields": { "headline": "…", "credentials": ["…"] }, "quote": "…" }
```

Every asserted fact arrives on the edge that names *which source, which run, which agent*, so the
UI renders the belief chain by walking incoming edges and deep-linking each source — the way the
research Evidence panel and the citations system already do via `citationHrefFor()`.

**Deliberately not proposed:** a field-level `party_fact` table. The edge payload answers the
requirement; one table beats two until a real conflict-resolution UI demands it.

### 4.8 Curation, experts, and sharing — ride what exists

**Curated sets.** A curated expert set is a `rag.data_stores` row with `kind='contact_set'`
(`kind` is already open text), with parties joined by the conveying `party → data_store` edge —
mirroring the live `file → data_store` conveyance. Platform-curated sets live in the system org
(`39c38960-d30c-4840-b0c1-c9960de95582`) granted to an industry. That buys industry entitlement,
the Library Catalog subscribe/unsubscribe UI, and the `OrgIndustriesSection` "what this unlocks"
panel with **zero new sharing code**. No tenant's CRM stance travels with it — by construction.

**Experts register with us.** An expert signs up → their `users.profiles` row claims a public
handle (existing `creator_claim_handle` flow) → the party row links via a `matrx_user` identity
and sets `claimed_by`/`expert_status='registered'`. `approved` and `vetted` are super-admin
transitions later. The public directory and the expert's own page are the **creators surface
generalized** — `/c/[handle]` already ships server-rendered `Person` JSON-LD, featured videos,
free tools, paid classes, and Stripe Connect payouts. That is the revenue stream, already built.

**THE VIEW LAW.** `/entities` and `/crm` declare their own scope (Mine / My Orgs / Shared /
Public); never a bare RLS-filtered list. Curated platform parties appear under a deliberate
destination, never flooding a personal list.

### 4.9 Cross-feature consumers

- **Research (the forcing function).** Experts from YouTube results become parties;
  `party → research_source` edges carry the video and the observation payload. The Context
  Builder gains **one entry** in `features/research/resources/catalog.ts` (`topic.experts`) and
  every bundle, budget meter, and agent picks it up with no other change. A user who wants to
  reach those experts clicks once to create a `contact` in their own org — the research→CRM hop.
- **Content planning.** `plan_node → party` `authored_by`/`reviewed_by` is the E-E-A-T half of the
  plan; `plan.profile.schema_org_map` already exists to emit `Person` JSON-LD for it.
- **Marketing / SEO.** Competitor organizations resolved from `seo.serp_result` hostnames become
  parties of kind `organization` with a `domain` identity, linked to crawled sites by
  `party → web_site`. SERP and backlink surfaces get a subject instead of a bare hostname.
- **Agent context.** A party is scope-attachable the moment its token registers, so it flows into
  `resolve_full_context` with no per-feature work; `rs_context_bundle` selectors gain a party kind.
- **Later:** `public.contact_submissions` (an inbound form resolves to / creates a party +
  contact), imports (CSV / Google / Microsoft contacts), email & calendar logging via the
  `communication` schema.

## 5. Phasing

**Phase 0 — the noun.** `platform.party` + `platform.party_identity`; tokens registered;
`apply_rls` + `verify_canonical` green; the association pairs in §4.5; `pnpm db-types` +
`pnpm gen:entity-types` + aidream `python db/generate.py`; two `ENTITY_OVERLAY` lines;
`partyService` (edges only through `associationsService`); `/entities` list on the canonical
entry-list shell (`features/agents/browse/FEATURE.md` + `useListViewPrefs` + `ItemMenuConfig` +
controlled `MatrxDataTable`) — **not a fifth variant**. Research writes experts.

**Phase 1 — the CRM v1 (ships with Phase 0; employees are waiting).** `platform.contact`;
`party_contact_status` category dimension seeded and org-editable; `/crm` list + record page
(person/company, owner, status, tags, notes via `platform.comments`, follow-up as a real task,
attachments, and the full association 360° grid); "Add to CRM" from any party; CSV import.

**Phase 2 — dedup.** Identity normalization (pure, importable), strong-key auto-merge,
`merge_candidate` edges from weak matchers, merge/unmerge RPCs (public schema, `auth.uid()`
gated, `activity_log` audited), review surface. Consume `ner_canonicalizer_shadow`'s verdicts.

**Phase 3 — provenance.** `party_observation` edge payload kind + validator; the belief-chain
panel reusing the research Evidence/citation deep-link.

**Phase 4 — experts + curation.** Expert registration on the creator claim flow, `expert_status`
transitions, the public directory, `rag.data_stores kind='contact_set'` + industry grants.

**Phase 5 — convergence.** `plan.entity` person/org rows migrate to `platform.party`;
`plan_node → party` replaces `plan_node → plan_entity` for those two types; marketing/SEO and
agent-context consumers land. Cross-repo (aidream ORM + content-plan server) — applied in lockstep.

**Phase 6 — CRM depth.** Deals, sequences, email/calendar sync, scoring. Only when a real
workflow demands each one.

Phases 0+1 are the unit that ships first. Everything after is additive — no later phase reshapes
what 0+1 lands.

## 6. Decisions needed

**1. Names — `party` (noun) + `contact` (stance).**
*Situation.* The product word is "Entity", but `platform.entity_types` is the registry where
*every* table is an entity and `associations.source_type` holds those tokens — a token literally
called `entity` reads as "source_type = entity" in a table where everything is one. `party` is
the standard term for "person or organization" and leaves `contact` free to mean exactly what it
should: a party your org is in contact with.
*Decide.* **DB tokens `party` + `contact`, UI labels "Entities" + "Contacts"** (recommended — the
boundary becomes self-documenting) · or force DB/UI symmetry and accept `entity` as a token ·
or another pair. **This is the one blocking decision** — the token is what `associations`,
`permissions`, and `apply_rls` key on, and it is expensive to change after registration.

**2. Schema home.**
*Situation.* `platform` is already PostgREST-exposed and already holds cross-cutting product data
(`categories`, `comments`, `share_links`), so tables there work immediately. A dedicated `crm`
schema reads cleaner but PostgREST exposure is Supabase dashboard config that agents cannot set —
it blocks the whole thing until you do it by hand.
*Decide.* **`platform.party` + `platform.contact`** (recommended — no blocker) · a new schema,
exposure flipped first.

**3. Does `plan.entity` fold in, and which way do plan edges point?**
*Situation.* `plan.entity` went live 2026-07-24 holding the authors/reviewers of planned pages —
the same concept, scoped to one site, nearly empty. Separately: the live pair is
`plan_node → plan_entity` (page → person), which is big→little; I mirrored it rather than flip it,
and edge direction is a product fact you own.
*Decide.* (a) Migrate `person` + `org` rows to `platform.party`, keep `plan.entity` for
`source`/`media`, site linkage becomes a `party → web_site` edge (recommended — do it while it's
empty) · (b) retire `plan.entity` entirely (`source` is a citation, `media` is a file — both have
homes) · (c) leave both. **And:** confirm `plan_node → party` or flip it.

**4. Is a curated expert set a `rag.data_stores` row?**
*Situation.* Industry entitlement runs through exactly one mechanism: `rag.data_store_grants`.
Reusing it means an expert roster is literally a "data store" with `kind='contact_set'` — free
industry grants, free subscribe UI, zero new sharing code, slightly odd noun in the DB.
*Decide.* Reuse (recommended) · or a distinct container, which means extending the grant path to a
second resource type.

**5. What may merge without a human?**
*Decide.* Confirm strong keys (`email`, `domain`, `youtube_channel`, `orcid`, `linkedin`,
`matrx_user`) as auto-merge and everything else propose-only (recommended) · or require human
confirmation for every merge at first.

**6. CRM v1 scope — is six columns right for your teams?**
*Situation.* v1 gives owner, status, tags, notes, follow-up tasks, attachments, and the full
association 360°. It does **not** give deals with amounts, sequences, or email sync.
*Decide.* Ship that as v1 (recommended — it's usable day one and nothing in it blocks the rest) ·
or name the one missing thing your employees would immediately hit, and I'll fold it into Phase 1.

**7. Default visibility.**
*Decide.* Confirm `internal` (org-wide) for both tables — recommended, consistent with `plan.*`;
`personal` would mean a party belongs to one human, which is wrong for both a shared entity and a
team's CRM.
