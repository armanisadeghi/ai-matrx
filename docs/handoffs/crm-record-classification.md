---
status: active
updated: 2026-08-15
repos: [matrx-frontend, aidream]
---

# CRM record classification — the CRM is how they sell, not how they find backlinks

## Vision — Arman's words (2026-08-15)

> *"The discovery stuff is not what their CRM is built to do. We're hijacking the CRM to store
> something that's not really something the CRM owns. Their CRM is for their leads, their clients,
> their sales. So if they ever go to the CRM anywhere and they see this stuff, the system's already
> broken."*

> *"The CRM is how they sell. Not how they find backlinks. That's a silly thing."*

> *"They shouldn't even come up with normal search results unless you click something that includes
> them. Now if they want to see them, they can change their settings, and that's the key. By
> default, things like these appear only in the pages that they're supposed to appear in. So
> somewhere in the CRM, we have the pages that show these things, but all of the normal UI has to
> purposefully leave this stuff out."*

> *"Imagine the user's looking for one of their customers named John Doe. They go to search John
> Doe, and now they have eight matches for Doe, and they have to sit there and figure out which one
> is John — when in reality if we had just kept this crap out of their CRM, that never would be an
> issue. Nothing pisses someone off more than when they're trying to make money and bullshit like
> backlinks is getting in their way."*

**Promotion:** *"Definitely it's a human that allows these things to be added to the CRM. But even
once a human adds them — either individually or by batch or whatever — they still cannot be the
primary thing in the CRM. You're using or hijacking the CRM tables to store this data, but this is
not our CRM data. Do not make that mistake."*

**Undo:** *"If someone promotes two hundred link prospects and regrets it, it should be really easy.
Create something very similar to what I've created for keyword classification, where the user has
incredibly powerful ways of being able to search and filter and select all and do multilayer
filtering… Hopefully we're storing enough information — including when it was created — so that
it's easy to find a bunch of them in a row, do a bunch of search criteria, get what you want, and
delete them or undo them."*

**Our own users:** *"Our users then become parties within our CRM. Yes. Because we are customers of
our own product. If you know there's certain problems that we're gonna have, then let's resolve
them now."*

**Shared channels:** *"We do need to create a centralized way for all of the discovered YouTube
channels all across our entire system to be able to curate some and put them into lists that are
shared by everyone."*

**How he reviews:** *"The way my brain works, I need to see a visual implementation… and make sure
you don't put things in a way that's gonna make it impossible to go back and fix these."* He could
not answer, in the abstract, what the top-level category set should be or where these surfaces
live. **Build it, show it, do not ask him to ratify a vocabulary on paper.**

## The axis model (settled — do not re-litigate)

Four axes, three of which already have an authority. Collapsing any two is the failure mode.

| Axis | Example | Authority |
|---|---|---|
| What it is **in the world** | `News & media` → `regional newspaper` | **`web_entity_type`** (seeded 2026-08-15) |
| What it is **to me** | competitor, vendor, lead | the `party_role` dimension — `Competitor` already live |
| **How we found it** | seo_backlink, youtube | `crm.party.source` |
| **Quality** | content farm, link farm | `attributes.seo_domain.opinion_verdict` + `opinion_score` |

In the raw data "competitor" is ALWAYS a modifier on a site type (*"competitor ITAD company
blog"*), never a type — which is why it must not become a peer of `media outlet`.

## Resources

- Contract: `aidream/aidream/services/crm/FEATURE.md` § `record_class` · `features/crm/FEATURE.md:80-98`
- Cross-repo SoR: `/Users/armanisadeghi/code/common-docs/systems/crm/FEATURE.md` and
  **`SHARED_CATALOG.md`** (the Library reuse plan: publish a `crm.outreach_list` from the Matrx
  Library org, industry-gated; subscribe means COPY, and the copy machinery — `source_party_id`,
  `source_synced_at`, `locked_fields` — is already in `crm.party`, unwired)
- One server create path: `aidream/services/crm/party_resolver.py:566-602` (`record_class` at :576,
  CREATE-only). Producers: `seo_domains.py:417`, `social_fold.py:398`, `expert_promotion.py:722`
- FE choke point: `features/crm/service.ts:129-197` `applyPartyListPredicates`
- UX exemplar for bulk promote: the keyword-classification workspace,
  `features/marketing/search-console/components/classification/` +
  `features/marketing/search-console/FEATURE.md:250-345`

## Remaining work

1. **Discovered records must vanish from general surfaces** — the doctrine above is not enforced
   outside `/crm`'s list. Chipped: *Filter discovered records out of every party picker*.
2. **The dedicated pages that DO show them** — Arman's "somewhere in the CRM we have the pages that
   show these things". Nothing exists yet. This is the visual he asked to see, and the natural home
   for bulk promotion.
3. **Human promotion, single + bulk**, on the keyword-classification model: multi-layer filtering,
   server-side select-all over the whole filtered set (copy the shape of `getGscClassReviewAll`,
   `data-classification.ts:141-163`), a count before commit, and the **unconfirmed quarantine**
   (Arman's rule: anything applied off-screen wears a warning ring until a human looks).
   - Consume `MatrxDataTableSelectionConfig` — do NOT hand-roll a checkbox column the way the
     classification screen does; its own type doc calls that fork out.
   - **Improve on the exemplar:** it has no batch id, so stamp `metadata.promotion =
     {batch_id, applied_at, actor}` and let the success toast offer "Undo this batch (N records)".
   - Promotion must NOT erase origin — `source_party_id` + `locked_fields` are how a promoted row
     stays non-primary. No competitor does this; it is Arman's explicit ruling.
4. **Persisted per-user display/search preference.** Three homes already exist: a global default in
   `userPreferences` via the settings registry, per-surface memory on
   `useListViewPrefs("crm-parties")`, a named opt-in in `crm.saved_view`. **A fourth store is the
   failure mode.**
5. **Curate discovered channels into shared lists** (Arman, above) — now unblocked by
   `platform.entity_grants`. Publish a `crm.outreach_list` of vetted channels from the Matrx
   Library org with `entity_type='outreach_list'`, industry-gated. **Register an AFTER DELETE purge
   trigger for that entity type** (see `platform.entity_grants_purge_data_store`) — a generic
   `entity_id` cannot carry an FK, so that trigger IS the referential integrity.
   ⚠️ If you ever re-shape `rag.data_store_grants` again: any function declaring
   `RETURNS rag.data_store_grants` depends on its composite type and a `cascade` will silently drop
   it. That is how `library_grant_publish` and `library_subscribe` were lost and restored on
   2026-08-15. And restore from the LIVE definition, never from a migration file — the file was
   stale and reintroduced two already-fixed bugs.
6. **The same axis on other CRM tables.** `crm.interaction` and `crm.outreach_list_member` have no
   `record_class` **and no `source` column at all**. Neither has an automated writer yet;
   `crm.sending_event` already does (`aidream/services/sending_identity/gate.py:654`).
7. **Our own users become parties** — resolve the tier question BEFORE signup starts minting them.
   `claimed_by` is currently 0 across all 1,187 rows, so the ratified rule is unimplemented and the
   two-value enum has no slot for this third population.
8. **Stale artifact:** `migrations/crm_list_scope_counts.sql` still declares the 3-arg signature;
   `types/database.types.ts` shows both overloads live, and the 3-arg one silently ignores record
   class.

## Non-negotiables

- Never delete or merge rows a user placed. Classification is metadata, not cleanup.
- Hidden must never mean unreachable (THE DOOR LAW).
- One axis, one authority. A second "is this junk" flag anywhere is the failure mode.
- The ownership tier is **not** `platform.categories` — that is the user's own taxonomy.
- Nothing may be built in a way that makes the vocabulary hard to revise. It lives in ROWS.

## Done

- `crm.party.record_class` + producers + list default + scope counts — see
  `aidream/services/crm/FEATURE.md` § `record_class`.
- Three parsers silently dropped the `record_class` value after their allow-list accepted it (agent
  write path, saved-view persistence, saved-view dirty detector) — fixed 2026-08-15.
- **`web_entity_type` seeded live** — 8 top-level + 34 second-level in `platform.categories`,
  derived by folding the 177 free-text `headline` descriptors on real discovered parties. The
  platform's first dimension to use `parent_id`.
- **Grant spine generalized** — `platform.entity_grants` keyed by `(entity_type, entity_id)`;
  `rag.data_store_grants` is now a `security_invoker` view over it with INSTEAD OF triggers, so all
  dependent Library functions work unchanged. Roundtrip verified live. Any registered entity can
  now be published to a global / industry / organization audience.
- Chipped for focused sessions: party-picker filtering · YouTube channel → research edges ·
  two-level category pickers.
