---
status: active
updated: 2026-08-14
repos: [matrx-frontend, aidream]
---

# CRM + Entity system — full handoff

**You need nothing outside this document to continue.** It carries the vision in Arman's own
words, the verified current state, and a prioritized work order.

> **Status 2026-08-14 — the core product is shipped and working; five items remain, each a fired
> chip (§4).** A tenant can import contacts, work them from a list, dial a claim-locked queue,
> log outcomes, and resolve duplicates. What is left is *reach* (the folds, the agent surface,
> experts) and *depth* (Wave 4, decision-gated). **§1 is the vision — it is settled and must not
> be re-litigated. §2 and §4 are the parts that go stale; update them, not §1.**

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

# 2. Current state — verified 2026-08-14

**The CRM is a working product now.** A tenant can import their contacts, work them from a
list, dial a claim-locked queue, log what happened, and clean up duplicates — all
browser-verified against the live DB. What remains is reach (the folds and the agent
surface) and depth (Wave 4), not core function.

## Shipped and verified

| Surface | Route | Notes |
|---|---|---|
| List, scoped + server-paginated | `/crm` | Canonical entity-list primitives; agent-writable |
| Record page (360°) | `/crm/[partyId]` | Contact points, addresses, employment both directions, activity, classification pickers, merge status |
| Trash / restore / purge | `/crm` → Trash | Scope predicates preserved; purge behind a destructive confirm |
| CSV import | `/crm/import` | File or paste → auto-mapped columns → dedup dry-run → commit |
| Outreach lists + power dialer | `/crm/outreach-lists`, `…/[id]/dial` | Claim-locked; DNC/suppression enforced before any dial |
| Duplicates review | `/crm/duplicates` | Side-by-side what-moves verdicts, exact unmerge |
| Feature map | `/crm/admin` | Every route, panel, component |

Underneath: 9 DB tables (all pass `iam.canonical_certify_ok`), 19 association pairs, 7 category
dimensions, the merge/unmerge RPC family, registry wiring (`party` + `crm_outreach_list` in
`ENTITY_OVERLAY` / `ASSOCIATION_TARGET_TYPES`, curated in the universal picker), and types in
both repos.

**Server half (aidream, 2026-08-12):** the party resolver (`aidream/services/crm/party_resolver.py`
— name_key canonicalization, natural keys, source stamping, merge-lineage aware), the `party`
`agent_data` resource, and the governed `resolve_contact` action. The raw `database` tool is
deliberately blocked from writing `crm` (`WRITE_GOVERNED_SCHEMAS`) and **stays blocked** — a raw
INSERT skips the resolver.

## What is still true and still hurts

- **Adoption is the real risk, not capability.** Usage remains near zero. The folds below are
  what put real rows in front of real users; until then this is a good product nobody is on.
- **The fold debt compounds daily:** `public.contact_submissions` was 4 → 21 while this doc was
  first being written and is still growing; `web.brand` 22 → 25. Every day one runs, the
  migration gets bigger. *(`plan.entity` person/org fold DONE 2026-08-13.)*
- **Auto-merge effectively never fires.** The resolver marks `is_identity_key=true` for
  `external_id` points ONLY (deliberately conservative — an email is not proof of identity), and
  nothing else creates external_id points yet. Today every collision surfaces as a *suggestion*.
  The YouTube fold is what first makes auto-merge real.
- **Email is a hole, not a gap:** no send path in any repo (a boot-validated `MAILGUN_API_KEY`
  with zero consumers is the only evidence of intent), no bounce/complaint webhook, no
  Gmail/Calendar sync. `crm.interaction` + `party_contact_point.opt_out_*` were designed for all
  of it and sit unused. **Decision 3 gates this.**
- **SMS is real but disconnected:** `communication.sms_*` (Twilio numbers, conversations, consent,
  webhook logs, org-scoped) keys on raw phone strings — no party link, and `sms_consent`
  duplicates the DNC/suppression that `crm.contact_medium` owns. **Decision 2 gates this.**
- **Dialing is a `tel:` handoff.** Real telephony is Wave 4.
- The full platform-wide gap map (every fold/link/leave with efforts) lives in the cross-repo SoR
  — do not re-derive it.

---

# 3. Resources

| What | Where |
|---|---|
| Cross-repo SoR: gap map, agent-surface gaps, competitive benchmark, build order | `/Users/armanisadeghi/code/common-docs/systems/crm/FEATURE.md` |
| DB contract + every gotcha (read before touching the DB or UI) | `features/crm/FEATURE.md` |
| DDL (applied + ledgered) | `migrations/crm_01_schema.sql`, `crm_02_core.sql`, `crm_03_dedup.sql` |
| All FE reads/writes · types · hooks · pages | `features/crm/{service.ts,types.ts,hooks/,components/}` |
| CSV import engine · outreach lists + dialer | `features/crm/import/`, `features/crm/outreach-lists/` |
| **The party resolver — every server-side write goes through it** | aidream `aidream/services/crm/` (read its `FEATURE.md` first) |
| Server ORM (generated) | aidream `db/models/crm.py`, `db/managers/crm/` |
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

Waves 0–3 are **substantially delivered** (see §2). Everything still open is listed below as a
numbered item, and **each one is a chip fired 2026-08-14** — a self-contained focused session.
They are listed here too so that a chip nobody runs is still visible as work. Full rationale +
per-item efforts in the cross-repo SoR.

## Open now — in priority order

1. **The three contact folds.** *(chip: "Fold the three contact tables into crm.party")*
   `users.invitation_requests` + `public.contact_submissions` + `users.user_form_profile`. Each
   needs `scripts/dead-relations.json` + `platform.deprecated_relations` BEFORE repointing;
   `plan_entity_person_org_fold.sql` is the worked reference. **Most urgent by decay** — the
   source tables grow every day this waits.
2. **CRM agent surface — FE half BUILT 2026-08-14; blocked on an aidream deploy.**
   `features/crm/agent-context/` (list + record builders, the selection parser), the
   `matrx-user/crm-record` surface + record-page context menu, and the universal
   "Save as contact" action all shipped — see `features/crm/FEATURE.md` § Agent surfaces.
   **No client tools were built, deliberately:** the server already covers the capability
   (`data_action(resolve_contact)` creates; the generic `data` tool registers `party`, alias
   `contact`, for query/get/count/update). The one uncovered piece — linking a party to another
   entity — belongs to the associations system, and a CRM-local tool for it would be the fork
   this repo bans. **What remains is not frontend work** (D192 in `FOUND_DEFECTS.md`): aidream
   commit `da0bcaba3` adds the `crm` source-feature to the allow-list and is pushed but
   **undeployed** — `release.sh` refuses a dirty tree and another session has uncommitted work
   in `db/models/workflow.py`; and newly-created agents currently fail every run (feedback
   `3efd1f7c-f9ec-45e3-bb43-bceea595db3c`, critical). **Next agent: run aidream's `release.sh`
   once its tree is clean, then re-run the live proof** — highlight a signature anywhere →
   Convert → Save as contact → the record opens at `/crm/[id]`.
3. **D182 — the RLS component remainder.** *(chip: "Finish D182")* 33 component tables still
   can't serve an authed insert-with-returning (21 missing the actor-stamp trigger, 12 with no
   `created_by` at all). All service_role-written today, so nothing user-facing is known broken —
   fix it before a user surface lands on one. Carries a product question for Arman (§5.4).

## Delivered, for provenance

**Smart views — DONE 2026-08-14.** `crm.saved_view` (applied + ledgered) makes a `/crm` query a
named record, shared through the platform `visibility` tier and opened by `/crm?view=<id>`; the
list gained the saved-view bar and bulk work-queue actions. Both gaps this item carried are
closed: `AddMembersDialog` enrolls straight from a saved view (stamping the view's id into
`crm.outreach_list.definition`, so the queue links back to the query that filled it), and "Do not
call" is no longer one-way — `unsuppressMedium` + `allowPartyContact` lift only OUR stance, name
every blocker that survives (unsubscribe, complaint, hard bounce, DNC registry, invalid), and
leave an audit trail on both sides. Details + the reversibility rule: `features/crm/FEATURE.md`.

**Wave 3 (experts) — DONE 2026-08-14.** Research experts now become `crm.party` rows:
deterministic extraction over `rs_source.page_analysis` (aidream
`services/crm/expert_promotion.py` — no second model call, the analysis agent already produced
the structure), promotion through the party resolver with `expert_status='registered'`, the
`expert_for` topic edge and a `party_observation` edge per evidencing page; suggestion-gated
(extraction writes nothing; the promote call refuses keys the current evidence does not produce
and refuses weak candidates without an explicit confirm). Readers: `/crm` Expert column with a
real server-side filter, `ExpertStatusCard` on the record page (tier ladder + provenance doors),
`/research/topics/[id]/experts`, and the `topic.experts` resource-catalog entry. **This closed
the last Wave 0 item.** It also exposed and fixed a live duplicate factory — `crm.name_key()`
mangled accented names while its Python twin folded them, so the resolver missed real rows
(`migrations/crm_name_key_unicode_fold.sql`, applied + backfilled).

**Wave 0** — raw-`database`-tool guard (`WRITE_GOVERNED_SCHEMAS = {"crm"}`) + `DocketParty`
rename, aidream v0.2.57. **Wave 1 server half** — the party resolver, the `party` `agent_data`
resource, the governed `resolve_contact` action. **Wave 2** — `plan.entity` person/org fold, CSV
import, and (2026-08-14, aidream) the **social fold**: any platform account → its canonical party,
with the stable platform id as an `external_id` medium — the first records eligible for real
auto-merge. Platform-agnostic by construction (`aidream/services/crm/social_fold.py`, one
`SOCIAL_PLATFORMS` line per platform); the YouTube reader
(`aidream/services/crm/youtube_channels.py`) folds `research.youtube_video` channels hourly and was
proven live on the real 934-channel library with zero duplicate channel→party rows. Kind is pinned
from the existing party on every re-run, so a human's `party_kind` correction is never overwritten;
name-shaped channels are typed `organization` and flagged
`attributes.kind_inference.possible_person` rather than fabricating humans — **that flag is a
ready-made FE review queue / assists chip, and nothing renders it yet.** The folded channels live
in the **Matrx system org** (where the shared video library lives), so they are platform-curated
records, not any tenant's contacts, and no surface renders them — a system-org CRM view or the
Wave 5 expert directory is what makes them reachable (§5, needs Arman). **Wave 3** — outreach lists + claim-locked dialer, dedup automation + merge review.
Details in §2 and in `features/crm/FEATURE.md`. The two entries below are kept in full because
they record guards a future agent could undo without realising what they protect.

**The aidream guard.** **DONE 2026-08-12** (shipped v0.2.57):
raw-`database`-tool guard (`WRITE_GOVERNED_SCHEMAS = {"crm"}` in
`matrx_ai/tools/implementations/database.py` — every write path funnels through
`_resolve_write_target` and refuses `crm` with a governed-path message; reads and
schema discovery deliberately untouched, unlike `_NON_APP_SCHEMAS`. Wave 1 landed and
**deliberately KEPT the guard** — a raw INSERT still skips the resolver, and the other
crm tables (interaction, outreach_list…) have no governed server path yet. Guard:
`packages/matrx-ai/tests/test_write_governed_schemas.py`; doc:
`aidream/services/agent_data/FEATURE.md`) · `matrx_legal...docket.Party` →
**`DocketParty`** (all consumers + `__all__` updated, package tests green).

**Two delivered invariants that must not be undone.** (1) The dedup engine auto-merges ONLY on
both-sides `is_identity_key` collisions, and the resolver grants that flag to `external_id`
points ONLY — an email is not proof of identity. Loosening either turns a suggestion queue into
silent data loss. (2) A disposition logs `crm.interaction` FIRST, then advances the member behind
a claim-guarded update — so a crash can duplicate a log line but can never lose a call.

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

# 5. Decisions — ALL FOUR RULED 2026-08-14 (Arman)

These are settled. Build to them; do not re-open.

1. **Deals/opportunities — BUILD THEM.** Arman: *"We need to push and build everything so we need
   to build this!"* Deals + kanban pipelines lead Wave 4 (the 2026-08-06 benchmark ranks them the
   single biggest competitiveness gap — the unit of money, and the prerequisite for reporting,
   forecasting, and most automation). Do not hold for proof-of-adoption.
2. **One suppression authority — COMPLIANCE DECIDES.** Arman: *"We need to follow the law and
   regulations… however that works."* That answer forces the design: a legal opt-out (SMS STOP,
   email unsubscribe, a spoken "do not call") must stop **every** channel and every campaign, so
   two authorities is not an option. `crm.contact_medium` becomes the ONE authority;
   `communication.sms_consent` writes through to it and stops being consulted independently.
   Suppression is checked inside the send/dial primitive, never by each caller.
3. **Email sending — RESOLVED IN FULL, `docs/handoffs/outreach-system.md` §5.** The question was
   "which provider"; the real answer is an architecture. **Customers send from their OWN verified,
   warmed mailboxes on their OWN domains (OAuth Google/Microsoft, SMTP/IMAP fallback); AI Matrx
   never relays customer outreach through its own infrastructure.** That is how the whole
   cold-outreach category (Pitchbox, Instantly, Smartlead, Lemlist) contains a bad actor to their
   own domain instead of everyone's. `send_reviewed_gmail` is the seed of that path — extend it.
   `MAILGUN_API_KEY` stays for OUR TRANSACTIONAL mail only (password resets, invites), on separate
   infrastructure that outreach must never touch. Read §5 before writing any send code.
4. **Component `created_by` — MATCH ENTITY.** Arman: *"Yes. Should be the same."* The component
   `std_insert` parent-editor arm must force `created_by = auth.uid()`, exactly as the entity
   variant does — a parent-editor may no longer stamp another user as creator (which silently
   conveyed that user owner-read). Fold into the D182 chip.
