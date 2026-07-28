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

1. **Arman, manual, blocks everything client-side:** Supabase → Settings → API → Exposed schemas →
   add `crm`. Grants and `anon` USAGE are already applied; only the dashboard toggle is missing.
   Verify after: a browser `supabase.schema('crm').from('party').select()` returns rows, not a 404.
2. **`ENTITY_OVERLAY` + target types.** One line each for `party` and `crm_campaign` in
   `features/scopes/registry/entityRegistry.ts`; add both to `ASSOCIATION_TARGET_TYPES` in
   `features/scopes/types.ts`. That alone lights up the 360° card grid, pickers, and attachment on
   orgs / projects / war rooms / scopes.
3. **`features/crm/` surfaces.** `/crm` list on the canonical entry-list shell (Mine / My Orgs /
   Shared / Public — never a bare RLS list), companies view, party record page (contact points with
   add/primary/verify, addresses, affiliations with dates, interaction timeline, campaigns, notes,
   tasks, files, association grid), campaign builder + call queue, CSV import written against
   `ON CONFLICT (organization_id, channel, value_key)` from the start. Pure importable normalizers
   (`toE164` — needs `phone_country`, `normalizeEmail`, `canonicalSocialHandle`) with tests.
4. **Research experts.** Write parties from research with `party_observation` payloads on
   `party → research_source` edges; add ONE `topic.experts` entry to
   `features/research/resources/catalog.ts`.
5. **Dedup automation.** Strong-key auto-merge on `is_identity_key` collisions,
   `merge_candidate` edge generation from weak signals, and a review surface. The merge/unmerge
   RPCs already exist and are round-trip tested. Consume `rag.ner_canonicalizer_shadow`'s
   deterministic-vs-agent verdicts rather than starting a second experiment.
6. **Folds.** `plan.entity` person/org (6 rows) → party, with `plan_node → party` replacing
   `plan_node → plan_entity` for those types; `users.invitation_requests` +
   `public.contact_submissions` + `iam.invitations`. Each needs a `scripts/dead-relations.json`
   entry and a `platform.deprecated_relations` row **before** repointing.
7. **The `web.brand` fold** (ratified, its own change after the core is proven): `web.brand` →
   party(organization), `web.property` + `web.business_fact` → medium/contact point,
   `web.discovered_item` → the shared enrichment inbox. Marketing, SEO, GSC and content-plan all
   read `web.brand` today — treat as cross-repo, lockstep.
8. **Experts + curation.** Registration on the shipped creator-claim flow (`creator_claim_handle`
   → `/c/[handle]`, Stripe Connect payouts already live), `expert_status` transitions, public
   directory, `rag.data_stores kind='contact_set'` + industry grants.
9. **Later:** deals/opportunities, sequences, email/calendar sync + webhook ingestion (there is
   **no email-sending infrastructure** in this DB — `communication.emails` is a 7-column toy with
   no org), lead scoring.

## Done

- CRM DB core live and verified — 9 tables, canonical RLS (zero FAIL/WARN on all 9), 17
  association pairs, 8 public category dimensions, 2 edge payload kinds, shareable registry,
  4 RPCs, constraint + merge/unmerge round-trip tested. See `features/crm/FEATURE.md`.
- Types regenerated both repos: `types/database.types.ts`, `types/generated/entity-types.generated.ts`
  (315 tokens), aidream `db/models/crm.py` + `db/managers/crm/`.
- Stale `platform.entity_types` row `token='profile'` (schema `user`, nonexistent) deactivated;
  `features/industries/FEATURE.md` corrected from `public.industries` to `iam.industries`.

## Decisions needed

**1. Industry-gated (non-public) curated expert sets.**
*Situation.* The public expert directory works today: system-org party rows at
`visibility='public'`. But a *paid or restricted* curated set cannot work at `internal` either —
the Matrx System org is `global_readable`, so every authenticated user gets viewer and the industry
grant does nothing. The only visibility that forces the grant to be the sole way in is `personal`,
which contradicts the rule that `personal` means "belongs to one individual person".
*Decide.* Leave curated sets public-only for now (recommended — nothing is blocked) · or allow
`personal` on system-org curated rows as a deliberate, documented exception · or add a fourth
visibility tier.

**2. The same person across your five companies.**
*Situation.* Five orgs means five party rows and five sets of contact info; fixing a phone number
in one does not fix the others. A cross-org link needs either an org group in `iam` or a
service-role link table.
*Decide.* Accept it for now (recommended — it is standard CRM tenancy) · or say the five companies
should share one CRM org · or ask for the cross-org link.
