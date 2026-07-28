---
status: active
updated: 2026-07-27
repos: [matrx-frontend, aidream]
vision: [/Users/armanisadeghi/.claude/plans/i-like-this-a-dazzling-pnueli.md]
---

# CRM + entity system — remaining work

The DB core is live. Everything below is what is left.

## Vision — Arman's words

> "we also want to start creating a way to manage these 'contacts' which leads to needing a
> full-scale contact management system built into our system, which is already planned but this is
> now the time that proves we need to get it done asap."

> "the plan entities are the same thing. They're… each module is being forced to create their own
> version because we don't have a centralized version of it. Right? And we need to. And when you
> start to centralize it, you start to realize that we can even have experts that we sort of offer
> as part of our system."

> "The CRM is like every other feature of our app. It's for the users and orgs." Part of the
> AI-first Office/Workspace suite. **"Our system is all about everything being fully interconnected
> and having a single place you go for everything."**

> "WE ARE NOT scraping and contacting. What our users do has nothing to do with us… We will accept
> experts but we're not going out looking for them." A user researching *Glioblastomas* may want to
> reach experts at Harvard Med / Mass General / Cleveland Clinic — **their** business. Experts who
> come to us earn through the education surface.

> "let's do the contact management system right. Let's get it correct so that we don't mess it up
> later." Explicitly: contact information must not be jerry-rigged, and companies are first-class.

> Expert tiers: "registered / approved / vetted… For now, simple, but set up so it connects easily
> when we expand it." Directory is **public**. Timing: "my employees are dying to get this in place
> right now."

Ratified 2026-07-27: fold the `web.brand` stack in as a planned phase · campaign tables in v1 ·
deals NOT in v1.

## Resources

- **DB contract + every gotcha:** [`features/crm/FEATURE.md`](../../features/crm/FEATURE.md) — read
  it before touching any CRM table. The medium-vs-contact-point split and the
  affiliation-is-a-table rule are the two things not to re-litigate.
- DDL: `migrations/crm_01_schema.sql`, `migrations/crm_02_core.sql` (both ledgered).
- Server models: aidream `db/models/crm.py`, `db/managers/crm/`.
- Skills to invoke: `canonical-associations` (edges), `db-change` + its `TOOLKIT.md` (any DDL),
  `type-safety` (Supabase query/RPC code), `finalize-and-ship` (end of task).
- List-page primitives to consume, not re-invent: `features/agents/browse/FEATURE.md`,
  `lib/list-views/FEATURE.md`, `components/official/item/`.
- Test login: `/login` with `admin@admin.com` / `Password1234#`. Session dev server + dev-login
  link are in the session header.

## Remaining work

1. **`ENTITY_OVERLAY` + target types.** One line each for `party` and `crm_campaign` in
   `features/scopes/registry/entityRegistry.ts`; add both to `ASSOCIATION_TARGET_TYPES` in
   `features/scopes/types.ts`. That alone lights up the 360° card grid, pickers, and attachment on
   orgs / projects / war rooms / scopes.
2. **`features/crm/` surfaces.** `/crm` list on the canonical entry-list shell (Mine / My Orgs /
   Shared / Public — never a bare RLS list), companies view, party record page (contact points with
   add/primary/verify, addresses, affiliations with dates, interaction timeline, campaigns, notes,
   tasks, files, association grid), campaign builder + call queue, CSV import written against
   `ON CONFLICT (organization_id, channel, value_key)` from the start. Pure importable normalizers
   (`toE164` — needs `phone_country`, `normalizeEmail`, `canonicalSocialHandle`) with tests.
3. **Research experts.** Write parties from research with `party_observation` payloads on
   `party → research_source` edges; add ONE `topic.experts` entry to
   `features/research/resources/catalog.ts`.
4. **Dedup automation.** Strong-key auto-merge on `is_identity_key` collisions,
   `merge_candidate` edge generation from weak signals, and a review surface. The merge/unmerge
   RPCs already exist and are round-trip tested. Consume `rag.ner_canonicalizer_shadow`'s
   deterministic-vs-agent verdicts rather than starting a second experiment.
5. **Folds.** `plan.entity` person/org (6 rows) → party, with `plan_node → party` replacing
   `plan_node → plan_entity` for those types; `users.invitation_requests` +
   `public.contact_submissions` + `iam.invitations`. Each needs a `scripts/dead-relations.json`
   entry and a `platform.deprecated_relations` row **before** repointing.
6. **The `web.brand` fold** (ratified, its own change after the core is proven): `web.brand` →
   party(organization), `web.property` + `web.business_fact` → medium/contact point,
   `web.discovered_item` → the shared enrichment inbox. Marketing, SEO, GSC and content-plan all
   read `web.brand` today — treat as cross-repo, lockstep.
7. **Experts.** Registration on the shipped creator-claim flow (`creator_claim_handle` →
   `/c/[handle]`, Stripe Connect payouts already live), the `registered → approved → vetted`
   transitions, and the public directory — **always free to browse** (see Settled). What an expert
   sells (meetings, products, services) rides the existing creator payment path; "book a meeting"
   is the one genuinely new product type.
8. **Later:** deals/opportunities, sequences, email/calendar sync + webhook ingestion (there is
   **no email-sending infrastructure** in this DB — `communication.emails` is a 7-column toy with
   no org), lead scoring.

## Done

- CRM DB core live and verified — 9 tables, canonical RLS (zero FAIL/WARN on all 9), 17
  association pairs, 8 public category dimensions, 2 edge payload kinds, shareable registry,
  4 RPCs, constraint + merge/unmerge round-trip tested. See `features/crm/FEATURE.md`.
- Types regenerated both repos: `types/database.types.ts`, `types/generated/entity-types.generated.ts`
  (315 tokens), aidream `db/models/crm.py` + `db/managers/crm/`.
- `crm` exposed to the API (`pgrst.db_schemas` on `authenticator` + both pgrst reloads); verified
  over HTTP: `crm.party` returns 200, other schemas unaffected. The db-change TOOLKIT claim that
  exposure is not MCP-reachable was wrong and has been corrected.
- Stale `platform.entity_types` row `token='profile'` (schema `user`, nonexistent) deactivated;
  `features/industries/FEATURE.md` corrected from `public.industries` to `iam.industries`.

## Settled (do not re-litigate)

- **The expert directory is always free to browse.** Arman, 2026-07-27: *"We can list experts. Some
  experts can even charge users a fee for various things. You can still look at this information
  for free but if you want a meeting or their products and services, that's different."* So there
  is no restricted or industry-gated expert list, and the visibility question that used to sit here
  is moot. The money is on what an expert SELLS (meetings, products, services), not on seeing them
  — which is the already-shipped creator/education payment path (paid classes + Stripe Connect
  payouts). A "book a meeting" product type is new surface area, not a new access model.
- **The five companies stay separate.** Arman, 2026-07-27: *"My 5 companies are 5 companies so they
  don't share anything. That's the point. Separate."* No cross-org contact linkage; each org keeps
  its own contacts. Build nothing here.
