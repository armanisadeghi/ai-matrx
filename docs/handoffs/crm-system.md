---
status: active
updated: 2026-08-19
repos: [matrx-frontend, aidream]
scope: feature
feature: CRM
vision: [/Users/armanisadeghi/code/common-docs/projects/crm/STATE.md]
---

# CRM — full handoff

**What this is:** the contact-management product every tenant gets — one canonical record
(`crm.party`) for any person or company they deal with, plus the list, record page, import,
dedup, saved views, dialer, inbox and sending identities built on it.
**Scope:** Feature
**Feature:** CRM
**Vision:** Arman's words, merged verbatim —
[`common-docs/projects/crm/STATE.md`](/Users/armanisadeghi/code/common-docs/projects/crm/STATE.md) §2

> **Read the cluster state doc first.** `common-docs/projects/crm/STATE.md` carries the merged
> vision, the code-confirmed built/pending split, the settled rulings, the question ledger and
> the seam map, all verified 2026-08-19. This handoff carries only what a developer taking the
> CRM needs on top of it.

## The one thing to understand before you touch code

**The CRM is a working product that almost nobody uses.** Of 1,720 live party rows, **1,449 are
`record_class='discovered'`** — SEO domains and YouTube channels, not anybody's contacts. About
13 are human-entered and exactly **one** ever arrived through CSV import. Capability is not the
gap. Weigh every proposal against that.

## Resources

| What | Where |
|---|---|
| **Cluster state — read first** | [`common-docs/projects/crm/STATE.md`](/Users/armanisadeghi/code/common-docs/projects/crm/STATE.md) |
| Cross-repo system-of-record: schema, gap map, competitive benchmark | [`common-docs/systems/crm/FEATURE.md`](/Users/armanisadeghi/code/common-docs/systems/crm/FEATURE.md) |
| DB contract + every gotcha — read before touching the DB or UI | [`features/crm/FEATURE.md`](../../features/crm/FEATURE.md) |
| Sub-feature docs | `features/crm/{inbox,compliance,sending-identities}/FEATURE.md` |
| All FE reads/writes · types · hooks · pages | `features/crm/{service.ts,types.ts,hooks/,components/}` |
| Import engine · outreach lists + dialer | `features/crm/import/`, `features/crm/outreach-lists/` |
| **The party resolver — every server write goes through it** | aidream `aidream/services/crm/party_resolver.py` (read `services/crm/FEATURE.md` first) |
| Server ORM (generated, 23 models) | aidream `db/models/crm.py`, `db/managers/crm/` |
| DDL (applied + ledgered) | `migrations/crm_01_schema.sql`, `crm_02_core.sql`, `crm_03_dedup.sql` |
| Contact import program | [`common-docs/systems/crm/IMPORT-SOURCES.md`](/Users/armanisadeghi/code/common-docs/systems/crm/IMPORT-SOURCES.md) |
| Shared curated catalogs (settled design, unbuilt) | [`common-docs/systems/crm/SHARED_CATALOG.md`](/Users/armanisadeghi/code/common-docs/systems/crm/SHARED_CATALOG.md) |
| Testing | `/login` `admin@admin.com` / `Password1234#`. Smoke: create person + company, employ with title/date, 2 emails + 2 phones with primary flips, log a call, confirm the Employer column renders (proves the mirror trigger) |

**DB traps paid for during the build** (beyond `features/crm/FEATURE.md`'s invariants):
`platform.create_entity_table(..., 'component')` **always fails** — its internal `iam.apply_rls`
needs a composition row whose `child_type` FKs to a not-yet-existing token. Hand-build component
tables from the working recipe in `migrations/crm_02_core.sql` §2–4. That function also has **two
overloads** (`p_visibility` text vs boolean; only one takes `p_gin_jsonb`) — always pass all 13
named parameters.

## Attached work (tasks — not separate staffing rows)

| Task | Document |
|---|---|
| Record classification | [`crm-record-classification.md`](crm-record-classification.md) |
| CRM model drift from a half-finished rename | `aidream/docs/handoffs/defect-ledger-campaign.md` |

## Remaining work

Full detail, with file paths and traps, in `STATE.md` §4.1. In priority order:

1. **Route party creation through the resolver.** `features/crm/constants.ts:11-14` declares that a
   direct `supabase.from("party").insert()` must never exist; `features/crm/service.ts:312-330` is
   that insert, called from `PartyCreateForm.tsx:121`, `import/engine.ts:784`, and
   `features/marketing/content-plan/components/EntityManager.tsx:387`. `findOrCreateCompanyByName`
   (`service.ts:1169-1191`) matches on exact lowercased `display_name` only. Fix it while exactly
   one imported party exists to be harmed. **Do it together with the durable import job** — the
   same commit loop is both defects.
2. ~~**SMS opt-out must call the one authority**, not hand-write suppression columns~~ — **DONE
   2026-08-19.** It was worse than recorded: THREE deciders (the email-only
   `crm.honor_reply_opt_out`, the hand-written block in `lib/sms/receive.ts`, and the trigger
   `public.sms_handle_opt_out_keywords` writing `communication.sms_consent`), and enforcement was
   split too — the SMS send gate read only `sms_consent`, which the trigger updated only
   `WHERE status = 'opted_in'`, so a STOP from an unenrolled number was enforced nowhere. Now one
   channel-agnostic `crm.honor_consent_decision`; trigger dropped; `isPhoneNumberOptedOut` reads
   `crm.contact_medium`. See `migrations/crm_08_one_suppression_authority.sql`.
3. **The three contact folds** — `users.invitation_requests` (8), `public.contact_submissions`
   (70, tripled in four days), `users.user_form_profile` (1). Reference:
   `migrations/plan_entity_person_org_fold.sql`. Register in `scripts/dead-relations.json` +
   `platform.deprecated_relations` BEFORE repointing. `user_form_profile` is blocked on Q4.
4. **Deals + pipelines** — ruled BUILD 2026-08-14, still zero code in either repo. See Q2.
5. **Finish SMS ↔ party** — the four FKs on `sms_conversations` exist and nothing writes them.
6. **D192** — "Save as contact" drops the employer affiliation (`FOUND_DEFECTS.md:543-559`).
7. **Close the generic agent create-path hole** — `services/agent_data/writes.py:460-471` can
   bare-create a party with no dedup or source stamping.
8. **Retire the stale 3-arg `crm_list_scope_counts`** — it ignores record class and both overloads
   are live.
9. **D182 remainder** — 22 component tables with `created_by` but no `updated_by`.
10. **Register `jurisdiction_policy`, `unsubscribe_token`, `outreach_acceptance`** in
    `platform.entity_types`, or write down why not.
11. **Add a `party_resolver` unit test** — the keystone is the only major CRM module without one.
12. **Provider deliverability webhooks** — bounces are recorded today only by parsing Gmail.
13. **Wave 5** — `web.brand` fold · CMS `form_submissions` link (that seam does not exist at all) ·
    transcript speaker maps · NER promotion from `rag.kg_entities` (now 51,615 rows) · podcast
    author/guest edges · `legal.wc_claim.evaluator_name` · `communication.emails` graveyard (Q6) ·
    expert registration, now unblocked because `claimed_by` settles the `party ↔ profile` rule.

## Done

- Party resolver, social fold, hourly YouTube fold, expert promotion, SEO-domain fold, byline fold
  — all consume the resolver. See `aidream/services/crm/FEATURE.md`.
- 12 routes, import, smart views, dedup + exact unmerge, claim-locked dialer, inbox, chasebox,
  sending identities, reversible suppression, agent surface. See `features/crm/FEATURE.md`.
- Raw `database` tool refuses `crm` writes; `matrx_legal` `Party` → `DocketParty`.
- EVERY USER HAS A PARTY — live at 100% via `crm.ensure_user_party` + an `auth.users` trigger.

## Decisions needed

All eight open questions live in one place: `STATE.md` §5. The four rulings from 2026-08-14
(deals BUILD · one suppression authority · customers send from their own mailboxes · component
`created_by` matches entity) are **settled — build to them, do not re-open.**
