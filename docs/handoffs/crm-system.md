---
status: active
updated: 2026-07-28
repos: [matrx-frontend, aidream]
owner_repo: matrx-frontend
---

# CRM + Entity system — full handoff

**You need nothing outside this document to continue.** It carries the vision in Arman's own
words, an honest gap analysis, a map of the code, and a prioritized next-step list.

Supporting docs, in the order you'll want them:
[`features/crm/FEATURE.md`](../../features/crm/FEATURE.md) (the DB contract and its gotchas) →
`migrations/crm_01_schema.sql` + `migrations/crm_02_core.sql` (the DDL) →
[`FOUND_DEFECTS.md`](../../FOUND_DEFECTS.md) (D112 is ours).

---

# 1. Vision

## 1.1 The problem this exists to solve

Every module in the platform was being forced to invent its own version of "a person or a
company." Arman:

> "the plan entities are the same thing. They're… each module is being forced to create their own
> version because we don't have a centralized version of it. Right? And we need to."

That was literally true. Before this work the platform held: `plan.entity` (people/orgs a content
plan cites), `web.brand` + `web.property` + `web.business_fact` (a company, its social handles, its
phone/email/address), `rag.kg_entities` (7,571 machine-extracted people and orgs),
`users.invitation_requests` + `public.contact_submissions` + `iam.invitations` (three separate
"a person we only know by email" tables), and `users.user_form_profile` (a full person with
phones/emails/social handles crammed into JSONB). None was reusable by the next module.

**The forcing function:** the research feature (`features/research/`) is about to identify
**experts** from YouTube results — real named people with channels, credentials, and reach — and
there was nowhere to put them.

> "we also want to start creating a way to manage these 'contacts' which leads to needing a
> full-scale contact management system built into our system, which is already planned but this is
> now the time that proves we need to get it done asap."

## 1.2 The vision, as it now stands

**One canonical record for a person or a company that is not one of our tenants** — expert, lead,
customer, vendor, author, speaker, competitor, journalist — plus a real CRM built on it.

Framing that matters:

> "The CRM is like every other feature of our app. It's for the users and orgs."

It is a **tenant feature**, like Notes or Tasks. Not an internal tool, not an agency tool. It sits
in a suite Arman describes as the AI-first equivalent of Google Workspace / Microsoft Office:
project + task management, docs, media, cloud files, cloud coding and sandboxes, desktop + mobile +
Chrome-extension clients, marketing/SEO, a built-in CMS.

> "our system is all about everything being fully interconnected and having a single place you go
> for everything."

**That sentence is the architectural north star.** It is why a contact is a first-class platform
entity rather than a row locked inside a CRM feature: the moment it is registered, it can be
attached to tasks, files, notes, projects, war rooms and scopes, and it shows up in the platform's
existing "everything related to this" grid without the CRM building a timeline of its own.

## 1.3 How the vision evolved — every change, called out

Read these in order. Later entries override earlier ones.

**(a) Opening ask.** A platform-wide entity/contact system, driven by research experts, but
explicitly *not* research-specific — it had to serve "experts, leads, contacts, authors, speakers,
competitors, and entity kinds we have not thought of yet."

**(b) "Entity" vs "contact" resolved.** Arman pushed back on treating these as two things:

> "These would be entities, especially when you look at our new content planning system. That's
> literally what they're called. But the key here is to understand the big picture… we need to have
> contacts so that a sales team and marketing team or outreach team can create contacts or you can
> save people and companies and do the CRM stuff."

**The resolution, and the reason the schema looks the way it does:** these are one noun with two
faces. The **party** is who someone is in the world (name, identities, credentials, channels). The
**CRM stance** is your org's relationship with them (who owns it, what stage, notes, last touch).
Every module needs the noun and none wants the other's stance — which is exactly why each one grew
a private half-copy.

**(c) Build the CRM now, not later.** Asked whether to do both together. Answer: together.

> "I own 5 companies and my employees are dying to get this in place right now so now is great."

*Why this mattered technically:* if only the entity had shipped, the CRM would later have added
`status`/`owner` columns to the shared record — and the moment that happened, a platform-curated
expert record could never be shared, because sharing it would leak one tenant's sales state.

**(d) Experts become a platform offering.**

> "when you start to centralize it, you start to realize that we can even have experts that we sort
> of offer as part of our system. Right? And so people could even register to become experts for us
> or leaders and things like that."

Tiers: `registered → approved → vetted`. Arman: *"For now, simple, but set up so it connects easily
when we expand it."* The directory is **public**.

**(e) A correction that reshaped the design — we are not the ones doing outreach.**

> "WE ARE NOT scraping and contacting. What our users do has nothing to do with us… We will accept
> experts but we're not going out looking for them."

The illustrating case: a user researching *Glioblastomas* may want to reach experts at Harvard
Medical School, Mass General, and Cleveland Clinic. **That is the user's business, not ours.**

*What this changed:* an earlier draft proposed platform-level consent/suppression machinery. That
was wrong and was deleted. Suppression and opt-out still exist — but as a **tool we give the
tenant** for their own campaigns, exactly like a note, not as platform policy.

**(f) The CRM core had to be done properly — the largest single refinement.** Arman rejected the
first plan as insufficient:

> "the contact information is critical because you really wanna make sure that you do that right.
> Otherwise, it's gonna become a mess later… If we mess that up and it gets jerry rigged because
> someone needs an email somewhere or needs a phone number field or someone wants to figure out how
> to handle a secondary phone number, it's gonna become ugly, and it's gonna become a mess."

> "done in a way that is how the best in the world do it… what does a CRM need at its core? The
> best CRMs in the world. What are those structures that they have? And we capture those core
> structures, and then everything else comes out of that."

It must serve, on day one: **known individuals, a cold email campaign, a cold calling campaign,
actual customers, vendors, and friends.** Plus:

- **Companies become first-class**, and they are *the user's clients*, never our tenants:
  > "organizations, clients, basically… not our users' organizations, but the the organizations they
  > work with. So for most people, it's gonna be companies and things like that."
- **A dedicated schema:** *"we would probably have a schema that's either, like, CRM or contacts or
  clients or something like that… I think it needs to be a separate schema for that part."*
- **Nothing left duplicating it:** *"identify the things that need to fold into it. I don't wanna
  build this and then leave additional tables that are holding the same data, um, in place because
  that's just a recipe for problems later."*
- **Social-platform agnostic:** *"let's not limit ourselves to just YouTube and LinkedIn… for some
  TikTok and Instagram and Facebook are even more important than the others. So let's just build it
  so that we're social agnostic."*
- Approved in the same breath: curated expert sets riding the existing RAG data-store sharing, and
  automatic merging on strong identity keys.

**(g) Three scope decisions.** Fold the `web.brand` stack in **as a planned phase** (not now, not
never) · **campaign tables in v1** (cold email and cold calling were named day-one requirements) ·
**deals/opportunities NOT in v1**.

**(h) Experts are free to look at; experts charge for what they sell.** A correction to a
misreading:

> "I think you misunderstood what would have a fee. We can list experts. Some experts can even
> charge users a fee for various things. You can still look at this information for free but if you
> want a meeting or their products and services, that's different."

*Consequence:* there is **no restricted or industry-gated expert list**, and the access question
that was open here is dead. Monetization is on what an expert *sells*, which rides the already
shipped creator/education payment path (paid classes + Stripe Connect payouts). "Book a meeting" is
a new product type, not a new permission model.

**(i) Five companies stay separate.**

> "My 5 companies are 5 companies so they don't share anything. That's the point. Separate."

No cross-org contact linking. Each org keeps its own contacts. This is standard CRM tenancy and it
is now a settled decision — do not build a bridge.

**(j) UI direction.** Built through a subagent using the `ui-dense` skill, which benchmarks against
Linear at its densest, a Bloomberg terminal, and a well-built ops console — the right target for a
surface a sales team drives all day.

## 1.4 The five load-bearing "why"s

A newcomer will otherwise be tempted to undo these. Don't.

1. **A medium is not a contact point.** `crm.contact_medium` is ONE row per normalized value per
   org and owns everything intrinsic to the *value* (verification, bounce, complaint, DNC,
   suppression). `crm.party_contact_point` says *who* uses it and *how*.
   *Why:* Acme's switchboard is reachable for 40 contacts; `info@acme.com` sits on the company and
   six people. Store deliverability per party and a do-not-call scrub updates **one of forty** —
   the next rep dials it and you are liable. It also gives suppression a free home: **a medium with
   no party attached IS the suppression list**, so "never email `legal@bigco.com`" needs no
   invented person. **Never add an email/phone/handle column to `crm.party`.**
2. **Employment is `crm.affiliation`, a real table — not an association edge.** The edge unique key
   is `(source_type, source_id, target_type, target_id, role)`, so an edge can express exactly ONE
   `works_at` between a person and a company *ever*: no second stint, no promotion history. And
   `assoc_unlink` hard-deletes, so "they left" would erase that they ever worked there.
3. **Roles are categories, not columns or enums.** Expert / lead / vendor / journalist / competitor
   are rows in the `party_role` dimension of `platform.categories`.
   *Why:* a new kind of person never needs a migration. `party_kind ('person','organization')` is
   the only genuinely closed set.
4. **Party is org-scoped and carries the stance.** An earlier draft split a global party from a
   per-org contact row. It was collapsed because `organization_id` is `NOT NULL` on the platform
   base entity — a "global" party would have to live in the system org anyway, so the split bought
   a second table and no isolation RLS wasn't already providing.
5. **Content-IR `__kind` was deliberately NOT used to type entities.** That registry types
   *payloads* (streaming JSON, render components). Row typing already has `platform.entity_types` +
   `platform.categories`. Using content-IR would have made the kind registry an access-control
   authority it was never built to be. Both get used for what they are: the expert-extraction agent
   should emit a registered content-IR kind (so results stream and render as cards), and the apply
   step writes `crm.party` rows.

---

# 2. Current state

Everything below was verified against the live database and in a browser on 2026-07-27, not
assumed.

## 2.1 Done and verified

**Database — 9 tables in schema `crm`, all nine passing `iam.canonical_certify_ok` with zero FAIL
and zero WARN.**

| Table | Kind | Versioned | Holds |
|---|---|---|---|
| `crm.party` | entity | yes | person or company; identity, curation, per-org stance |
| `crm.contact_medium` | entity | no | one row per value per org; deliverability + suppression |
| `crm.party_contact_point` | component of party | no | who uses a medium, purpose, validity |
| `crm.address` | component of party | no | structured postal + geo |
| `crm.affiliation` | component of party | yes | person ↔ company employment, with dates |
| `crm.interaction` | component of party | no | calls/emails/meetings, planned AND completed |
| `crm.campaign` | entity | yes | a named audience or cold campaign |
| `crm.campaign_member` | component of campaign | no | per-member state, attempts, dialer claim |
| `crm.party_merge` | component of party | no | the exact unmerge record |

Also live: 17 association pairs in `platform.association_types`; 63 vocabulary rows across 7
category dimensions (`party_role`, `crm_lifecycle_stage`, `contact_point_purpose`,
`social_platform`, `interaction_channel`, `interaction_outcome`, `crm_rating`) — **all seeded
`visibility='public'`**; edge payload kinds `party_observation` and `party_affiliation`;
`platform.shareable_resource_registry` rows for `party` and `crm_campaign`; per-token association
GC triggers.

**RPCs** (all in `public`, `auth.uid()`-gated, audited to `platform.activity_log`):
`crm_set_primary_contact_point` · `crm_merge_parties` · `crm_unmerge_parties` · `crm_party_purge`.

**Tested live**, then purged: 20 constraint/trigger assertions (facet checks, E.164 and
lowercase-email enforcement, duplicate media, one-primary-per-channel, a second stint at the same
employer, overlapping-primary rejection, org inheritance, the campaign claim lock) and a full
merge → verify → unmerge → verify round trip.

**API reachability.** `crm` is exposed to PostgREST (`pgrst.db_schemas` on the `authenticator`
role). Verified over HTTP: `crm.party` returns 200; other schemas unaffected.

**Types, both repos.** `types/database.types.ts` (`--schema crm` added to the `db-types` script in
`package.json`), `types/generated/entity-types.generated.ts` (315 tokens), and aidream
`db/models/crm.py` + `db/managers/crm/` (`crm` registered in `aidream/db/matrx_orm.yaml`).

**UI — two screens, browser-verified with real rows.**
`/crm` (list: People/Companies, scope tabs, search, server-side sort/filter/paging, row kebab,
full-row click) and `/crm/[partyId]` (identity + DNC, medium-joined contact points with primary
star, addresses, employment both directions, activity composer + timeline, notes, Files/Tasks
association grid). Mobile stacks to one column; no console errors; `pnpm type-check` green.

**Registry wiring.** `party` and `crm_campaign` added to `ENTITY_OVERLAY`
(`features/scopes/registry/entityRegistry.ts`) and `ASSOCIATION_TARGET_TYPES`
(`features/scopes/types.ts`); `"party"` added to the comments `EntityType`.

**Cleanups done along the way.** Retired the stale `platform.entity_types` row `token='profile'`
(pointed at a schema `user` that does not exist). Corrected `features/industries/FEATURE.md` from
`public.industries` to `iam.industries`. Corrected the false claim in
`.claude/skills/db-change/TOOLKIT.md` that PostgREST exposure is not agent-reachable.

## 2.2 Partial

- **List scopes.** `features/crm/types.ts:135` ships `CRM_LIST_SCOPES = ["mine","orgs","public"]`.
  **"Shared" is deliberately absent** — it needs a CRM grant-reader RPC and no generic one exists.
  The scope tabs render only what is wired, so nothing is broken; the tab is simply missing.
- **Category dimensions are seeded but unwired.** `party_role`, `crm_lifecycle_stage` and
  `crm_rating` have rows and the columns exist (`party.lifecycle_stage_id`, `party.rating_id`), but
  **no picker renders them** — confirmed: no component under `features/crm/components/` references
  those columns. So today you cannot tag a contact as a lead, or set a stage, from the UI.
- **Experts.** `crm.party` carries `expert_status`, `claimed_by`, `claimed_at` and the CHECK for
  `registered|approved|vetted`. Nothing writes them; there is no registration flow and no public
  directory.
- **Curated expert sets.** The conveying pair `party → data_store` (container=target, conveys
  viewer) is registered and works, but nothing creates a `rag.data_stores` row with
  `kind='contact_set'` and no UI exists.
- **Merge.** The RPCs exist and are round-trip tested, but there is **no review UI** and nothing
  generates `merge_candidate` edges. Merging is currently a SQL-only operation.

## 2.3 Not started

- Campaign builder and the **call queue** (tables and the `claimed_by`/`claimed_until` dialer lock
  exist; no UI at all).
- **CSV import.** Must be written against `ON CONFLICT (organization_id, channel, value_key)` from
  the first line, or it will create the duplicates the merge step then has to clean.
- **Research → experts.** No code writes parties from research, and there is no `topic.experts`
  entry in `features/research/resources/catalog.ts`.
- **Dedup automation.** No auto-merge on strong-key collision, no weak-signal candidate generation.
- **The folds** (Arman explicitly asked that nothing be left duplicating this):
  `plan.entity` person/org rows (6 rows) → party, with `plan_node → party` replacing
  `plan_node → plan_entity`; `users.invitation_requests` (8) + `public.contact_submissions` (4) +
  `iam.invitations`; and the larger **`web.brand` fold** (22 brands, 42 social properties,
  `web.business_fact`, `web.discovered_item`).
- Trash/restore surface for soft-deleted parties.
- Deals/opportunities, sequences, lead scoring.
- **Email and calendar.** There is **no email-sending infrastructure in this database at all** —
  `communication.emails` is a 7-column toy with no `organization_id`. A cold email campaign needs
  the send path, webhook ingestion (delivered/open/bounce/complaint), and the send-time suppression
  check, all net-new.

## 2.4 Known issues, risks and debt

1. **D112 — list rows are mouse-only.** Verified on `/crm`: rows open via a click handler on a bare
   `<tr>` with `role=null`, `tabindex=null`, and a plain-text name cell. Keyboard users cannot open
   a record from **any** list page in the app, screen readers announce no affordance, and
   cmd-click-open-in-new-tab works nowhere. **This is not a CRM defect** —
   `features/agents/browse/components/AgentBrowseTable.tsx` has the identical shape. Filed rather
   than patched so the fix lands once in the shared primitive. See `FOUND_DEFECTS.md` D112.
2. **PostgREST self-join embeds.** `party!<fk-name>(...)` resolves **reverse** (an array) at
   runtime. The employer embed must target the FK **column**
   (`employer:primary_employer_party_id(...)`), and postgrest-js cannot infer the column form, so
   `features/crm/service.ts` pins it with `.returns<>()`. Pinned in `features/crm/FEATURE.md`.
3. **Nothing is deployed.** All work is pushed to `main`, but Vercel only builds release-prefixed
   commits by design. Cutting a release ships every parallel session's commits too — that call was
   deliberately left to Arman. `./scripts/release.sh` when ready.
4. **Parallel sessions sweep the working tree.** During this work another session's `release-admin`
   commit picked up `migrations/crm_01_schema.sql` and reverted a `package.json` edit. **Re-verify
   your own edits are still present before committing**, especially `package.json`.
5. **No seed data.** `crm.party` is empty (test rows were purged). The first person to open `/crm`
   creates the first rows.
6. **Bulk writes into `party → data_store` are O(n) reachability refreshes.** Insert with the
   reachability trigger deferred, then call `platform.refresh_reachability` once. Adding 10,000
   experts row-by-row will crawl.
7. **`crm.interaction` is one row per attendee.** A three-person meeting is three rows. A component
   defers access to exactly one parent, so a participants table would have to be its own entity.
   Deliberate, not an oversight.
8. **Notes must pass `p_org_id`.** `cmt_add`'s org resolution is hardcoded for `task` only;
   everything else silently lands the comment in the author's *personal* org. The CRM passes it
   explicitly — keep doing that.
9. **`platform._mirror_fk_to_assoc` is forbidden platform-wide.** `crm._affiliation_edge()` is
   modelled on `plan._site_edge` instead. Do not "simplify" it onto the mirror function.

---

# 3. Architecture and orientation

## 3.1 How data flows

```
Browser (React)  ──direct, supabase-js──▶  Supabase Postgres (schema `crm`)
                 ──associationsService──▶  platform.associations   (relationships)
                 ──supabase.rpc()──────▶  public.crm_* RPCs        (primary, merge, purge)
aidream (Python) ──generated ORM───────▶  db/models/crm.py, db/managers/crm/
```

**There is no Next.js middle tier and no Python hop for CRM data.** Reads and writes go straight
to Postgres under RLS. Python is for work the browser cannot do (AI, heavy processing, file bytes)
— it has ORM models for `crm` so agents can write parties later, but nothing uses them yet.

## 3.2 Where things live

| What | Where |
|---|---|
| DB contract + every gotcha | `features/crm/FEATURE.md` ← **read first** |
| DDL (applied + ledgered) | `migrations/crm_01_schema.sql`, `migrations/crm_02_core.sql` |
| Row/embed types, vocabularies, scopes | `features/crm/types.ts` |
| All reads/writes | `features/crm/service.ts` |
| List + detail data hooks | `features/crm/hooks/usePartyList.ts`, `hooks/usePartyDetail.ts` |
| List page | `app/(core)/crm/page.tsx` → `features/crm/components/CrmListPage.tsx`, `components/columns.tsx` |
| Record page | `app/(core)/crm/[partyId]/page.tsx` → `features/crm/components/record/PartyRecordPage.tsx` |
| Record sections | `features/crm/components/record/{PartyIdentityCard,ContactPointsCard,AddressesCard,EmploymentCard,InteractionTimeline,PartyNotes,SectionCard}.tsx` |
| Entity registry entries | `features/scopes/registry/entityRegistry.ts` (`ENTITY_OVERLAY`), `features/scopes/types.ts` (`ASSOCIATION_TARGET_TYPES`) |
| Relationship writes | `features/scopes/service/associationsService.ts` — **the only sanctioned path** |
| Server ORM | aidream `db/models/crm.py`, `db/managers/crm/`, registered in `db/matrx_orm.yaml` |

## 3.3 What the CRM inherits instead of building

This is the "fully interconnected" principle in practice. None of these were re-implemented:

- **Notes** → `platform.comments` via `commentsService` (entity type `"party"`, explicit org id).
- **Audit trail** → `platform.activity_log` (the RPCs write `crm.party.merge` / `.unmerge` / `.purge`).
- **Favorites / pins / recents** → `platform.user_entity_state`.
- **Follow-ups** → real `workspace.tasks` attached by an association edge, so they appear in the
  user's actual task list rather than a private CRM field.
- **Attachments** → `features/files` via the association grid.
- **Tags, stages, roles, outcomes** → `platform.categories`.
- **The "everything related to this" grid** → `AssociationCardGrid` + `PrimaryEntityProvider`.
- **List chrome** → `MatrxDataTable` (controlled mode), `BrowseScopeTabs`, `useListViewPrefs`,
  `ItemMenu` — the same primitives `/agents/all` uses.

## 3.4 Reading the data model in one paragraph

A `party` is a person or a company. Its emails, phones, social handles and external ids are
`party_contact_point` rows, each pointing at a shared `contact_medium` that holds the actual value
and everything known about that value's health. Postal addresses are separate (`crm.address`)
because they have eight structured fields, geocoding, and their own lifecycle. A person's jobs are
`crm.affiliation` rows pointing from the person to a company party, with titles and dates; a
trigger mirrors the current one to a `works_at` relationship edge and denormalizes
`primary_employer_party_id` + `job_title` onto the person so grids and exports are one column read.
Calls, emails and meetings are `crm.interaction` rows. Audiences and cold campaigns are
`crm.campaign` + `crm.campaign_member`, where `claimed_by`/`claimed_until` is the lock that stops
two reps dialing the same prospect. Merges never destroy anything: `crm.party_merge` records every
moved child id so unmerge replays exactly.

---

# 4. Next steps, in order

Each is independently shippable. 1–3 are small and make the existing screens genuinely usable.

1. **Wire the category pickers** (~half a day). `party_role`, `crm_lifecycle_stage` and
   `crm_rating` are seeded and the columns exist, but nothing sets them. Add pickers to
   `PartyIdentityCard.tsx` (stage + rating are FK columns on `party`; role is a
   `party → category` association edge with `role='member'` through `associationsService`). Until
   this lands, nobody can mark anyone a lead. Read categories through `public.cat_list`, never a
   direct table read.
2. **Fix D112 in the shared primitive** (~half a day, benefits the whole app). Render the title
   cell as a real `next/link` using the entity registry's `hrefFor`, keeping the row click. Touches
   `MatrxDataTable` and `AgentBrowseTable`; audit `AgentBrowseRows`/`AgentBrowseCards`.
3. **Trash/restore for parties** (~half a day). Soft delete already works; there is no way to see
   or restore a deleted contact.
4. **CSV import** (~2 days). The single highest-value thing for real users — teams arrive with a
   spreadsheet. Write it against `ON CONFLICT (organization_id, channel, value_key)` from the
   start, and reuse `normalizeMediumValue` from `features/crm/service.ts` so imported values match
   the DB CHECKs (lowercase email, E.164 phone).
5. **Campaign builder + call queue** (~1 week). The tables are done. Build: create a campaign, add
   members from a filtered list, then a queue screen that claims the next member
   (`next_attempt_at`, `claimed_by`, `claimed_until`), shows their phone and history, and logs an
   interaction with an outcome. This is what makes it a cold-calling tool rather than a rolodex.
6. **Dedup: auto-merge + candidate review** (~1 week). Auto-merge on `is_identity_key` collisions;
   generate `party → party` `merge_candidate` edges from weak signals; a review screen calling the
   existing `crm_merge_parties`. Reuse `rag.ner_canonicalizer_shadow`'s deterministic-vs-agent
   verdicts rather than starting a second experiment. Add `CHECK (source_id < target_id)` for
   symmetric roles or every candidate appears twice.
7. **Research → experts** (~1 week). Write parties from research runs with `party_observation`
   payloads on `party → research_source` edges, and add ONE `topic.experts` entry to
   `features/research/resources/catalog.ts` (that catalog is built so one entry lights up the
   picker, budget meter and every saved bundle).
8. **The folds** (~1 week). `plan.entity` person/org first (6 rows, cheap now, expensive later),
   then the three "person known only by email" tables. Each needs a `scripts/dead-relations.json`
   entry and a `platform.deprecated_relations` row **before** repointing.
9. **`web.brand` fold** (~2 weeks, cross-repo, lockstep). Brand → party(organization);
   `web.property` + `web.business_fact` → medium/contact point; `web.discovered_item` → shared
   enrichment inbox. Marketing, SEO, GSC and content-plan all read `web.brand` today. Ratified by
   Arman as a planned phase — do it after the core is proven in production.
10. **Experts** (~1–2 weeks). Registration on the shipped creator-claim flow
    (`creator_claim_handle` → `/c/[handle]`, Stripe Connect payouts already live), the
    `registered → approved → vetted` transitions, and the public directory — **always free to
    browse**. What an expert sells rides the existing creator payment path; "book a meeting" is the
    one genuinely new product type.
11. **Later:** deals/opportunities, sequences, email + calendar sync and webhook ingestion, scoring.

---

# 5. Gotchas and context

**Before you touch the database**

- Read `features/crm/FEATURE.md` and `.claude/skills/db-change/TOOLKIT.md`. Apply DDL through the
  Supabase MCP (project `txzxabzwovsujtloxrus`), then record it in `public._schema_migrations`
  (`source='matrx-frontend'`, checksum = SHA-256 of the file bytes) and run `pnpm db-types`.
- **`platform.create_entity_table(..., 'component')` always fails.** Its internal `iam.apply_rls`
  call needs a `platform.entity_relationships` composition row whose `child_type` FKs to a token
  that does not exist yet. Hand-build component tables — `migrations/web_brand_layer.sql` is the
  working recipe, and `migrations/crm_02_core.sql` §2–4 is ours.
- **It has two overloads.** `p_visibility` is *text* in one and *boolean* in the other; only one
  takes `p_gin_jsonb`. Always pass all 13 named parameters.
- **Seed system-org category dimensions `visibility='public'`.** At `internal` they are invisible
  to every customer org (empty pickers) *and* every `party → category` edge write fails 42501,
  because `assoc_add` requires `has_access(target,'viewer')`. This bug already happened once, to
  the `plan_*` dimensions.
- **Never `char(n)`** — it is blank-padded and the matrx-orm generator has no mapping for `bpchar`.
  `text` + a CHECK.
- **Exposing a new schema is agent-reachable** (it is `pgrst.db_schemas` on the `authenticator`
  role) but **append, never retype the list** — a wrong value is a total API outage. Then
  `notify pgrst, 'reload config'` **and** `'reload schema'`; config alone leaves the cache stale
  (PGRST205). Verify over HTTP, not in SQL.

**Before you touch the UI**

- `/crm` is a `(core)` AppShell route: chrome goes in `<PageHeader>`, body wrapper is
  `h-full overflow-hidden`. Never `h-page` or `calc(100dvh - header)`.
- Lucide icons only, **no emojis anywhere a user can see**. Semantic tokens (`bg-card`,
  `text-muted-foreground`, `border-border`), never raw hex.
- Every column sorts **and** filters, or the control does not render at all. The Employer column
  renders no filter on purpose — the server cannot serve it.
- The list must declare its scope. A bare RLS-filtered read is a defect here.
- `pnpm type-check` is the **only** type gate — `next.config.js` sets
  `typescript.ignoreBuildErrors: true`, so a red type error still deploys.

**Behaviours that will surprise you**

- Setting a primary email/phone **must** go through `crm_set_primary_contact_point`. Partial unique
  indexes cannot be `DEFERRABLE`, so the natural "set new, clear old" flow throws 23505.
- Creating a contact point is **two steps**: find-or-create the `contact_medium` first, then link
  it. The value lives on the medium, not the contact point.
- `party_contact_point.channel` is denormalized from the medium by a trigger. Never write it.
- Components inherit `organization_id` from their parent via `crm._inherit_parent_org()` (trigger
  `_a_org_from_parent`, named to sort before `_stamp_*`). Without it the platform default would
  derive org from the *creator's personal org*.
- `last_touch_at` is deliberately **not** stored on `party` — it is versioned, and a cold-call floor
  would snapshot the whole row into `history.row_versions` on every dial. Derive it from
  `crm.interaction` (indexed `(party_id, occurred_at desc)`).
- `crm_party_purge` is the erasure path and also clears `history.row_versions`,
  `platform.comments` and `platform.user_entity_state`. A purge that only deletes the live row is
  not a purge.

**Settled — do not reopen**

- Experts are always free to browse; money is on what they sell.
- The five companies stay separate; no cross-org contact linkage.
- Employment is a table, not an edge.
- Deliverability and suppression live on the medium, not the party.
- Deals are not in v1.

**Testing**

Log in at `/login` with `admin@admin.com` / `Password1234#`. There is no seed data — create rows.
A useful smoke test, because it exercises everything that was hard: create a person and a company,
employ one at the other with a title and start date, add two emails and two phones with one primary
each, log a call with an outcome, then confirm the employer appears in the list's Employer column
(that proves the mirror trigger fired).
