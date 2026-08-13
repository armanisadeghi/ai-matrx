---
status: active
updated: 2026-08-06
repos: [matrx-frontend, aidream]
---

# CRM + Entity system — full handoff

**You need nothing outside this document to continue.** It carries the vision in Arman's own
words, the verified current state, and a prioritized work order.

Read in order: this doc → **the cross-repo system-of-record**
`/Users/armanisadeghi/code/common-docs/systems/crm/FEATURE.md` (verified 2026-08-06: the
platform-wide integration-gap map, agent-surface gaps, competitive benchmark) →
[`features/crm/FEATURE.md`](../../features/crm/FEATURE.md) (the DB contract and its gotchas) →
`migrations/crm_01_schema.sql` + `migrations/crm_02_core.sql` (the DDL).

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

# 2. Current state — verified 2026-08-06

## Done

- DB core live and healthy — 9 tables (all pass `iam.canonical_certify_ok` today), 19 live
  association pairs (17 seeded + 2 added since), 7 public category dimensions, 4 RPCs, PostgREST
  exposure, constraint/merge round-trip tested. Contract: `features/crm/FEATURE.md`.
- `/crm` list + `/crm/[partyId]` record page + Trash + classification pickers + create windows +
  manager window + `/crm/admin` map + main-nav entries + three UI surfaces — all browser-verified.
- Registry wiring: `party` + `crm_campaign` in `ENTITY_OVERLAY` / `ASSOCIATION_TARGET_TYPES`;
  `party` passes `curatedTokens()` and appears in the universal picker; envelope catalog noun.
- Types both repos: `database.types.ts` (`--schema crm`), entity-types, aidream `db/models/crm.py`
  + `db/managers/crm/`.

## Where it actually stands

- **Zero changes since the feature landed** (`features/crm` has exactly one commit ever —
  `ed868172`, 2026-07-29, the full feature riding in a messages-titled commit) and near-zero usage:
  4 parties, 1 interaction, 0 campaigns. Nothing server-side consumes the CRM ORM — no router,
  no service, no agent tool, in either repo.
- **The fold debt is compounding:** `plan.entity` 6 → 49 rows, `public.contact_submissions`
  4 → 21, `web.brand` 22 → 25 since this doc was written.
- **The duplicates persist as parallel CRUD surfaces** — content-plan's `EntityManager.tsx` is
  full person/org CRUD beside `/crm`. (Universal-picker hygiene is already correct: only `party`
  and `crm_campaign` are curated tokens; the duplicate tables have `contentRole: null`.)
- **`party.expert_status` has no producer and no reader anywhere.** The research pipeline extracts
  the exact promotion signals (`NotableQuote.speaker`, `has_author_credentials`, `expert_opinion`
  findings, per-page `EntitiesMentioned.people/organizations`) and buries them in
  `rs_source.page_analysis` JSONB.
- **Email is a hole, not a gap:** no send path in any repo (a boot-validated `MAILGUN_API_KEY`
  with zero consumers is the only evidence of intent), no bounce/complaint webhook, no
  Gmail/Calendar sync. `crm.interaction` + `party_contact_point.opt_out_*` were designed for all
  of it and sit unused.
- **SMS is real but disconnected:** `communication.sms_*` (Twilio numbers, conversations, consent,
  webhook logs, org-scoped) keys on raw phone strings — no party link, and `sms_consent`
  duplicates the DNC/suppression that `crm.contact_medium` owns. One suppression check must win
  before CRM SMS campaigns ship.
- ~~The raw `database` agent tool can already write `crm.party` ungoverned~~ **CLOSED 2026-08-12** —
  `crm` writes are refused by `WRITE_GOVERNED_SCHEMAS` (aidream v0.2.57); reads still work. Wave 1
  lifts the entry once the resolver + `agent_data` registration exist.
- The full platform-wide gap map (every fold/link/leave with efforts) lives in the cross-repo SoR
  — do not re-derive it.

---

# 3. Resources

| What | Where |
|---|---|
| Cross-repo SoR: gap map, agent-surface gaps, competitive benchmark, build order | `/Users/armanisadeghi/code/common-docs/systems/crm/FEATURE.md` |
| DB contract + every gotcha (read before touching the DB or UI) | `features/crm/FEATURE.md` |
| DDL (applied + ledgered) | `migrations/crm_01_schema.sql`, `crm_02_core.sql` |
| All FE reads/writes · types · hooks · pages | `features/crm/{service.ts,types.ts,hooks/,components/}` |
| Server ORM (generated, unconsumed) | aidream `db/models/crm.py`, `db/managers/crm/` |
| Agent-resource on-ramp (registers `party` for agents) | aidream `aidream/services/agent_data/registry.py` (`sync_from_entity_types`, `_derive_spec`) |
| Research expert signals | aidream `research/page_analysis.py` (`EntitiesMentioned`, `NotableQuote`, `EvidenceSignals`) |
| YouTube channel data (stable natural key) | aidream `research/youtube_library.py`, `db/models/research.py::YoutubeVideo` |
| Testing | `/login` `admin@admin.com` / `Password1234#`; no seed data. Smoke test: create person + company, employ with title/date, 2 emails + 2 phones with primary flips, log a call, confirm Employer column renders (proves the mirror trigger) |

**DB traps paid for during the build** (beyond `features/crm/FEATURE.md`'s invariants):
`platform.create_entity_table(..., 'component')` **always fails** (its internal `iam.apply_rls`
needs a composition row whose `child_type` FKs to a not-yet-existing token) — hand-build component
tables from the working recipe in `migrations/crm_02_core.sql` §2–4. The function also has **two
overloads** (`p_visibility` text vs boolean; only one takes `p_gin_jsonb`) — always pass all 13
named parameters. Parallel agent sessions sweep the working tree — re-verify your own edits
(especially `package.json`) before committing.

---

# 4. Remaining work, in order

Waves are independently shippable; full rationale + per-item efforts in the SoR.

**Wave 0 — defect closure.** Both aidream items **DONE 2026-08-12** (shipped v0.2.57):
raw-`database`-tool guard (`WRITE_GOVERNED_SCHEMAS = {"crm"}` in
`matrx_ai/tools/implementations/database.py` — every write path funnels through
`_resolve_write_target` and refuses `crm` with a governed-path message; reads and
schema discovery deliberately untouched, unlike `_NON_APP_SCHEMAS`. **Wave 1 must
lift this entry** when the resolver + `agent_data` registration land. Guard:
`packages/matrx-ai/tests/test_write_governed_schemas.py`; doc:
`aidream/services/agent_data/FEATURE.md`) · `matrx_legal...docket.Party` →
**`DocketParty`** (all consumers + `__all__` updated, package tests green).
**Still open:** decide `expert_status` (wire, don't drop — its producers arrive in Wave 3).

**Wave 1 — the keystone + the agent premise (~1 week).**
Build the **party resolver** in aidream (find-or-create: `name_key` canonicalization, natural keys
= lowercase email / E.164 phone / domain / external ids, `source` stamping, merge-lineage aware) —
everything downstream consumes it · register `party` in `agent_data` (flip `agent_writable`, seed a
`ResourceSpec` with readonly `canonical_id`/`source_party_id`/`locked_fields`/`claimed_*`/
`do_not_contact`; security-review gated) · FE agent tools (`party_search`/`party_create`/
`party_link`) · context-menu "Save selection as contact" · `features/crm/agent-context/` builder.

**Wave 2 — adoption + cheap folds (~2 weeks).**
~~CSV import~~ **DONE 2026-08-13** (`/crm/import`: paste/file → auto-map →
dry-run preview → commit; engine `features/crm/import/`; dedup via bulk medium/
name/domain lookups in `service.ts`. Found D181 en route: component
`INSERT…RETURNING` 42501s platform-wide — chip fired for the `iam.apply_rls`
generator fix; CRM service inserts bare as a hedge) · `plan.entity` fold (chip
fired 2026-08-13; cheapest now, most expensive later) · `invitation_requests` +
`contact_submissions` + `user_form_profile` folds (each needs `scripts/dead-relations.json` +
`platform.deprecated_relations` BEFORE repointing) · YouTube channel → party (the original forcing
function; `channel_id` is a stable key, no fuzzy matching).

**Wave 3 — a working outreach tool (~2–3 weeks).**
Smart views (saved dynamic filters + bulk actions — the list IS the work queue) · campaign builder
+ call-queue UI (= power-dial a smart view; the claim lock exists) · dedup automation (auto-merge
on `is_identity_key` collisions; suggestion-gated weak-signal candidates with
`CHECK (source_id < target_id)`; merge review UI over the existing RPCs) · research → experts
(writes `expert_status` at last; one `topic.experts` entry in
`features/research/resources/catalog.ts` lights up the whole picker/budget/bundle machinery).

**Wave 4 — the competitive tier (decision-gated, see §5).**
Deals + pipelines · email send + deliverability webhooks + 2-way sync · sequences
(suppression-aware from day one — our differentiator) · SMS ↔ party unification · reporting ·
calendar sync · next-activity enforcement.

**Wave 5 — later, already ratified.**
`web.brand` fold (cross-repo lockstep; brand keeps only web/SEO concerns) · CMS `form_submissions`
→ party/interaction (cross-project) · transcript speaker maps · conservative NER promotion from
`rag.kg_entities` (suggestion-gated, never auto-write) · expert registration on the creator-claim
flow + public directory (define the `party ↔ profile` link rule first) · podcast author/guest
edges · `legal.wc_claim.evaluator_name` fold · "shared" list scope (needs a grant-reader RPC) ·
graveyard `communication.emails`.

---

# 5. Decisions needed (Arman)

1. **Deals/opportunities scheduling.** Situation: v1 deliberately excluded deals. A 2026-08-06
   benchmark of Salesforce/HubSpot/Attio/Pipedrive/Close/Folk ranks deals + kanban pipelines as
   the single biggest competitiveness gap — it is the unit of money and the prerequisite for
   reporting, forecasting, and most automation. Decide: schedule deals into Wave 4 as its lead
   item, or hold until the outreach core (Waves 1–3) is proven with real users.
2. **One suppression authority for SMS.** Situation: `communication.sms_consent` tracks phone
   opt-outs independently of `crm.contact_medium` (which owns DNC/suppression for the CRM). Two
   authorities means an SMS STOP might not stop a CRM cold-call campaign dialing the same number.
   Decide: `contact_medium` becomes the single suppression authority (SMS consent writes through
   to it), or SMS stays tenant-user-only and CRM campaigns must check both.
3. **Email provider.** Situation: cold email campaigns (a named day-one requirement) need a send
   path + bounce/complaint webhooks; nothing exists. `MAILGUN_API_KEY` is already declared in
   aidream's env registry but unused. Decide: confirm Mailgun (or name the provider) so Wave 4
   email work can start without a second round-trip.
