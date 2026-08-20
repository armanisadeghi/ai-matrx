---
status: active
updated: 2026-08-19
repos: [matrx-frontend, aidream]
scope: program
feature: CRM
vision: [/Users/armanisadeghi/code/common-docs/projects/crm/STATE.md]
---

# CRM record classification — the CRM is how they sell, not how they find backlinks

**What this is:** keeping machine-discovered records (SEO domains, YouTube channels, prospects)
out of the tenant's real CRM while still storing them in `crm.party` — the `record_class` axis,
the pages that DO show them, and the human bulk-promotion path.
**Scope:** Program
**Feature:** CRM
**Vision:** Arman's words, merged verbatim —
[`common-docs/projects/crm/STATE.md`](/Users/armanisadeghi/code/common-docs/projects/crm/STATE.md) §2.6

> **Read `common-docs/projects/crm/STATE.md` first** — merged vision, verified state, the seam map,
> and the question ledger. This doc carries the axis model and this program's remaining work.

**The live stake:** **1,449 of 1,720 parties are `record_class='discovered'`** and no surface
renders them. About 13 parties in the entire platform are human-entered contacts.

## The axis model (settled — do not re-litigate)

Four axes, three with an existing authority. Collapsing any two is the failure mode.

| Axis | Example | Authority |
|---|---|---|
| What it is **in the world** | `News & media` → `regional newspaper` | **`web_entity_type`** — live, 42 rows (8 top-level + 34 nested), the platform's first dimension using `parent_id` |
| What it is **to me** | competitor, vendor, lead | the `party_role` dimension — 11 rows live |
| **How we found it** | seo_backlink, youtube | `crm.party.source` |
| **Quality** | content farm, link farm | `attributes.seo_domain.opinion_verdict` + `opinion_score` |

In the raw data "competitor" is ALWAYS a modifier on a site type (*"competitor ITAD company blog"*),
never a type — which is why it must not become a peer of `media outlet`. Both dimensions live in
`platform.categories` **rows**, which is why a code grep for them finds nothing.

## Resources

- Contract: `aidream/aidream/services/crm/FEATURE.md` § `record_class` · `features/crm/FEATURE.md`
- One server create path: `aidream/services/crm/party_resolver.py:576` (`record_class`, CREATE-only,
  deliberately absent from `_FILLABLE_FIELDS`). Producers: `seo_domains.py:447`,
  `social_fold.py:398`, `expert_promotion.py:722`, `coverage/bylines.py:160`,
  `registry_ingestion/landing.py:201,256`, `crm/enrichment/bulk.py:269`. The one post-resolve
  mutation is `crm/outreach_contacts.py:489-492` (human confirmation promotes discovered→contact).
- FE choke point: `features/crm/service.ts:131-199` `applyPartyListPredicates` (contact-only +
  canonical-only), plus ~11 further sites pinning `CRM_PRIMARY_RECORD_CLASS`.
- Picker filtering: `migrations/filter_party_picker_candidates.sql` (registry-driven predicate
  `{"record_class":"contact"}` on `platform.entity_types` for token `party`).
- UX exemplar for bulk promote: the keyword-classification workspace,
  `features/marketing/search-console/components/classification/` + that feature's `FEATURE.md`.
- Shared catalog design (settled, unbuilt):
  [`common-docs/systems/crm/SHARED_CATALOG.md`](/Users/armanisadeghi/code/common-docs/systems/crm/SHARED_CATALOG.md)

## Remaining work

1. **The dedicated pages that DO show discovered records.** Arman's *"somewhere in the CRM we have
   the pages that show these things."* Nothing exists — the only door is the `record_class` facet
   on `/crm`. This is the visual he asked to see and the natural home for bulk promotion.
2. **Human promotion, single + bulk.** Zero code; `metadata.promotion` exists only as a
   prescription. Multi-layer filtering, server-side select-all over the whole filtered set (copy
   `getGscClassReviewAll`, `data-classification.ts:141-163`), a count before commit, and the
   unconfirmed quarantine. Consume `MatrxDataTableSelectionConfig` — do NOT hand-roll a checkbox
   column the way the exemplar does. **Improve on the exemplar:** stamp
   `metadata.promotion = {batch_id, applied_at, actor}` so the toast can offer "Undo this batch
   (N records)". Promotion must not erase origin — `source_party_id` + `locked_fields` keep a
   promoted row non-primary.
3. **Persisted per-user display preference.** The default is a code constant
   (`DEFAULT_RECORD_CLASS_FILTER = "contacts"`, `types.ts:225`) and cannot be changed per user.
   Three homes exist and none holds it: the settings registry, `useListViewPrefs("crm-parties")`
   (sort/page size/density only), `crm.saved_view`. **A fourth store is the failure mode.**
4. **Curate discovered channels into shared lists.** `platform.entity_grants` holds 2 rows and
   nothing grants an `outreach_list`. Publish a `crm.outreach_list` of vetted channels from the
   **Matrx Library org** (`5e44ec19-…`, not the system org), industry-gated, subscribe = COPY.
   **Register an AFTER DELETE purge trigger for that entity type** (see
   `platform.entity_grants_purge_data_store`) — a generic `entity_id` cannot carry an FK, so that
   trigger IS the referential integrity. ⚠️ Any function declaring `RETURNS rag.data_store_grants`
   depends on its composite type and a `cascade` silently drops it; that is how
   `library_grant_publish` and `library_subscribe` were lost and restored on 2026-08-15. Restore
   from the LIVE definition, never from a migration file.
5. **The same axis on other CRM tables.** `crm.interaction` and `crm.outreach_list_member` have no
   `record_class` **and no `source` column at all**.
6. **Settle the 374 `possible_person` parties.** `aidream/services/crm/kind_resolution.py` (621
   lines, tested) exists to do this and can flip org→person and re-key `name_key` while honouring
   `locked_fields`. Confirm it is scheduled; never create a second party.
7. **Surface the 941 platform-curated parties** in the Matrx System org that no surface renders.
   Likely the same build as item 4.
8. **Retire the stale 3-arg `crm_list_scope_counts`** — `migrations/crm_list_scope_counts.sql`
   declares only `(text,text,text)` and silently counts across every record class. Both overloads
   are live; the frontend already calls the 4-arg one (`service.ts:266-270`).

## Non-negotiables

- Never delete or merge rows a user placed. Classification is metadata, not cleanup.
- Hidden must never mean unreachable (THE DOOR LAW).
- One axis, one authority. A second "is this junk" flag anywhere is the failure mode.
- The ownership tier is **not** `platform.categories` — that is the user's own taxonomy.
- Nothing may be built in a way that makes the vocabulary hard to revise. It lives in ROWS.

## Done

- `crm.party.record_class` + producers + list default + scope counts — see
  `aidream/services/crm/FEATURE.md` § `record_class`.
- Party pickers, imports and dedup surfaces are contact-only and canonical-only, via a
  registry-driven predicate.
- `web_entity_type` seeded live — 42 rows derived by folding 177 free-text `headline` descriptors.
- Grant spine generalized — `platform.entity_grants` keyed by `(entity_type, entity_id)`;
  `rag.data_store_grants` is a `security_invoker` view over it with INSTEAD OF triggers.
- **Our own users became parties** — shipped and live at 100% (256/256 non-anonymous users) via
  `crm.ensure_user_party` + trigger `on_auth_user_created_crm_party`. *(This item previously read
  "`claimed_by` is currently 0 across all 1,187 rows, so the ratified rule is unimplemented" —
  that was false as of 2026-08-15 and is corrected here.)*
