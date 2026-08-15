---
status: active
updated: 2026-08-15
repos: [matrx-frontend, aidream]
owner: active session (taken over 2026-08-15)
---

# CRM record classification — the CRM is how they sell, not how they find backlinks

## Vision — Arman's words (2026-08-15)

> *"The discovery stuff is not what their CRM is built to do. You have to understand that. We're
> hijacking the CRM to store something that's not really something the CRM owns. Their CRM is for
> their leads, their clients, their sales. So if they ever go to the CRM anywhere and they see
> this stuff, the system's already broken."*

> *"The CRM is how they sell. Not how they find backlinks. That's a silly thing."*

> *"They shouldn't even come up with normal search results unless you click something that
> includes them. Now if they want to see them, they can change their settings, and that's the key.
> By default, things like these appear only in the pages that they're supposed to appear in. So
> somewhere in the CRM, we have the pages that show these things, but all of the normal UI has to
> purposefully leave this stuff out."*

> *"Imagine the user's looking for one of their customers named John Doe. They go to search John
> Doe, and now they have eight matches for Doe, and they have to sit there and figure out which
> one is John — when in reality if we had just kept this crap out of their CRM, that never would
> be an issue. Nothing pisses someone off more than when they're trying to make money and
> bullshit like backlinks is getting in their way."*

**On promotion:**

> *"Definitely it's a human that allows these things to be added to the CRM. But even once a human
> adds them — either individually or by batch or whatever — they still cannot be the primary thing
> in the CRM. You're using or hijacking the CRM tables to store this data, but this is not our CRM
> data. Do not make that mistake."*

**On the 933 YouTube channels:**

> *"They just need to be categorized properly. They all came up as a result of various research
> projects and things like that that we've done for testing. They just need to be part of the
> system — we already have established and documented that we want our YouTube channels and these
> things that we discover to be available to our users, that they're gonna be a system shared
> resource. Look at our system that we already have for how we share certain resources by
> industry, and that's how these should be handled."*

**On the vocabulary — TWO LEVELS, ratified:**

> *"You have competitor and regional newspaper in the same sentence. So I don't know what you
> could possibly be referring to that would put them in the same sentence… we need two levels of
> categorization. It's like a category and subcategory, or category and class or whatever. So you
> have a top level thing, which is where competitor would sit and media outlet possibly would sit,
> and then you need a more specific one of what something is. And if our CRM and our entire system
> doesn't already support that, then we better get working on that very quickly."*

**On undo / bulk correction:**

> *"If someone promotes two hundred link prospects and regrets it, it should be really easy. You
> got to create something very similar to what I've created for keyword classification, where the
> user has incredibly powerful ways of being able to search and filter and select all and do
> multilayer filtering… For batch jobs we can keep some history if we wanna give them the ability
> to undo. But I don't think we need to. Hopefully we're storing enough information — including
> when it was created — so that it's easy to find a bunch of them in a row, do a bunch of search
> criteria, get what you want, and delete them or undo them."*

**On our own users:**

> *"Our users then become parties within our CRM. Yes. Because we are customers of our own
> product. If you know there's certain problems that we're gonna have, then let's resolve them
> now."*

**On how he will review this:**

> *"The way my brain works, I need to see a visual implementation… and make sure you don't put
> things in a way that's gonna make it impossible to go back and fix these."*

### The three unanswered questions (he needs to SEE it first)

He explicitly could not answer these in the abstract and asked for a visual implementation plus
best thoughts. Do not force a decision out of him on paper:

1. Whether "how we found it" and "what kind of thing it is" are genuinely different axes in the UI.
2. What the top-level category set actually is.
3. Where these surfaces live.

## The axis confusion this session created — and the correction

The interview stalled because one message put **"competitor"** and **"regional newspaper"** in the
same list. They are not the same kind of statement, and conflating them is what makes the
vocabulary undecidable:

| Axis | Example | Whose truth | Changes per tenant? |
|---|---|---|---|
| **What it is in the world** | `media outlet` → `regional newspaper` | intrinsic | no — shareable platform-wide |
| **What it is to me** | `competitor`, `link prospect`, `outreach target` | relational stance | yes — per tenant |
| **How we found it** | `seo_backlink`, `youtube`, `research` | provenance | no |

Arman's two-level ruling applies to the FIRST axis. `competitor` almost certainly belongs to the
second and must not be a peer of `media outlet`. Confirm against a visual before building.

## Verified current state (live DB, 2026-08-15)

1,187 parties. **It is two piles, not one:**

| Rows | Org | `source` | Meaning |
|---|---|---|---|
| 933 | `39c38960` Matrx **System** (`iam.system_orgs.global_readable = true`) | `youtube` | Platform-curated; in no tenant's CRM. Arman's answer: make these a **system shared resource, scoped by industry**, using the existing sharing system |
| 247 | `5dc930e9` AI Matrx (a normal tenant org) | `seo_backlink` 239, `seo_reputation` 4, `research` 3, `wikidata` 1 | A tenant's own discovery, inside their CRM |
| 6 | two other orgs | — | Real contacts |

- No org today mixes 1,181 with 6 — the worst case is 247-vs-0. The problem statement is a correct
  **forecast**, not a current measurement.
- `claimed_by` = 0 on all 1,187 rows: EVERY USER HAS A PARTY is ratified but unimplemented.
- The classification signal exists but as **free text**: `headline` on the 239 backlink parties
  holds LLM-written descriptors — 177 distinct values across 239 rows, 62 null
  (*"regional newspaper"*, *"affiliate content farm blog"*, *"business podcast show-notes site"*).
- Structured signal that is NOT free text: `attributes.seo_domain` (`opinion_verdict`,
  `opinion_score`, `current_backlinks`), `attributes.kind_inference.possible_person` (377 probable
  people, 248 confident orgs, 308 with no inference), `attributes.research_expert`
  (`tier`, `confidence`), and provenance **edges** with pinned payload kinds (`link_prospect`,
  `outreach_target`, `expert_for`).

## Resources

- Contract: `aidream/aidream/services/crm/FEATURE.md` § `record_class` · DB contract:
  `features/crm/FEATURE.md:80-98` · cross-repo SoR:
  `/Users/armanisadeghi/code/common-docs/systems/crm/FEATURE.md`
- **One server create path only:** `aidream/aidream/services/crm/party_resolver.py:566-602`
  (`record_class` stamped at :576, CREATE-only). Producers: `seo_domains.py:417`,
  `social_fold.py:398`, `expert_promotion.py:722`. The agent path
  (`services/agent_data/operations.py:206`) deliberately omits it → DB default `'contact'`.
- FE choke point: `features/crm/service.ts:129-197` `applyPartyListPredicates` (record class at
  :173-180) + `fetchPartyScopeCounts` :264-269 → `public.crm_list_scope_counts(p_record_class)`.
- Industry benchmark (researched 2026-08-15): only Salesforce made "found" a record *type*, and it
  is the most-complained-about design in the category (two funnels, attribution destroyed at
  conversion, duplicate rules don't fire during conversion, no un-convert). HubSpot uses a separate
  *place* + a badge on rows already in the CRM. Apollo uses one surface with `Total`/`Net New`/
  `Saved` counters. Attio marks provenance **per value** with user-writes-win and an export fence.
  Clay never lets found rows touch the CRM. **Nobody keeps a durable "was discovered" marker after
  promotion, and only Apollo has any reversion path** — both are open goals for us.

## Remaining work

1. **The reach problem is bigger than the list page.** `public.reference_search_candidates`
   (`migrations/reference_categories_and_candidate_search.sql:240-318`) is the generic RPC behind
   every universal party picker and `searchCandidatesAcrossTokens`. It applies owner/org/
   visibility/`deleted_at` and **nothing else** — no `record_class`, and no `canonical_id is null`,
   so every picker already offers discovered records *and merge losers*. This is Arman's "eight
   matches for Doe" scenario, live today. Other unfiltered readers: `service.ts` `fetchPartiesByIds`
   (:336), `searchPartiesByName` (:959), `searchEmployerCandidates` (:983), the import dedup family
   (:1020-1178), and the whole dedup/merge-candidate family (:1197-1342) — the last of which puts a
   count of platform-discovered duplicate suggestions in the `/crm` header.
2. **Two-level vocabulary**, on whatever hierarchy the platform already has (or build it once,
   generically). Derive the set from the 177 free-text headlines across every site — never
   hand-picked against one account.
3. **The 933 YouTube channels → a system shared resource scoped by industry**, on the existing
   sharing system. `crm.party.industry_id` (FK `iam.industries`) already exists.
4. **Persisted per-user display/search preference.** Three homes already exist — a global default
   in `userPreferences` via the settings registry, per-surface memory on
   `useListViewPrefs("crm-parties")`, a named opt-in in `crm.saved_view`. **A fourth store is the
   failure mode.**
5. **Human promotion, single + bulk**, modeled on the keyword-classification UI: multi-layer
   filtering, server-side select-all over the filtered set, a count before commit, and reversal
   built in the same change. Fill-empty-only merge; keep a durable `promoted_from` stamp;
   run dedupe *at* the promotion moment (the thing Salesforce turns off).
6. **The same axis on other CRM tables.** `crm.interaction` and `crm.outreach_list_member` have no
   `record_class` **and no `source` column at all** — less to work with than `party`. Neither has an
   automated writer yet; `crm.sending_event` already does
   (`aidream/services/sending_identity/gate.py:654`).
7. **Our own users become parties** (ratified). Resolve the tier question before signup starts
   minting them, not after.
8. **Stale artifact:** `record_class` appears in **no migration file**. The column, CHECK,
   `party_org_record_class_idx`, backfill, and the 4-arg RPC were applied live only;
   `migrations/crm_list_scope_counts.sql` still declares the 3-arg signature and
   `types/database.types.ts:36798` shows both overloads live — the 3-arg one silently ignores
   record class.

## Non-negotiables

- Never delete or merge rows a user placed. Classification is metadata, not cleanup.
- Hidden must never mean unreachable (THE DOOR LAW) — every hidden record keeps a door.
- One axis, one authority. A second "is this junk" flag anywhere is the failure mode.
- **Not `platform.categories`** for the ownership tier — that is the user's own taxonomy
  (lifecycle stage, rating, segments).
- Nothing may be built in a way that makes the three unanswered questions above hard to revisit.

## Done

- `crm.party.record_class` (`'contact'` | `'discovered'`), indexed, backfilled; every automated
  producer stamps `discovered` CREATE-only; list defaults to contacts with an always-rendered
  Record facet; `crm_list_scope_counts` takes the same filter — see
  `aidream/services/crm/FEATURE.md` § `record_class`.
- Three parsers silently dropped the `record_class` value after their allow-list accepted it —
  the agent write path, saved-view persistence, and the saved-view dirty detector. Fixed
  2026-08-15 (`features/crm/components/CrmListPage.tsx`, `features/crm/saved-views/types.ts`).
