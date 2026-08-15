---
status: active
updated: 2026-08-15
repos: [aidream, matrx-frontend, common-docs]
owner: unassigned — TWO code tasks left (T2, T7) plus one human step only Arman can do (T8)
---

# Competitor link gap + competitor classification

**Arman, 2026-08-14:**

> *"When we're doing things to try to get backlinks, it's not so much who's linking to us —
> it's about analyzing who's linking to our competitors."*

> *"This is not things that we wanna guess about... We want true competitors."*

> *"These things rise up out of SEO and into marketing... who your competitors are is not
> just the web question. It's a company question."*

**📖 Read `common-docs/systems/competitor-classification/FEATURE.md` FIRST.** It is the
system of record for the taxonomy, the three-layer classification rule, and the link-gap
seed rule. This file is only the work order.

---

## The three laws (Arman's ruling — these govern every remaining task)

1. **Nothing becomes a competitor because software said so.** Deterministic rules and AI
   agents PROPOSE; a human CONFIRMS. Only `classification_status='confirmed'` competitors
   may seed a paid run.
2. **Typing a competitor's name is a first-class path.** User types "Shred Nations" → we
   search the web → find the site → one click adds it. Arman called this *critical*. It
   must be as fast as accepting a suggestion.
3. **The user owns the decision; we own the default.** Our customer is often a marketing
   agency acting for a client. Every axis is overridable; every derived label re-labellable.

---

## What is built (verified against `origin/main`, 2026-08-15)

| Piece | State | Where |
|---|---|---|
| Taxonomy + link-gap seed rule | **Done**, committed | `common-docs/systems/competitor-classification/FEATURE.md` |
| `seo.competitor` classification axes | **LIVE in Supabase** — `business_overlap`, `market_overlap`, `search_overlap_band`, `entity_role`, `posture`, `classification_status`, `use_for_link_gap`, `custom_labels`, `classification_confirmed_at/_by` + CHECKs + 2 indexes | migration `seo_competitor_classification_axes` |
| `seo.link_gap_domain` + `seo.link_gap_match` | **LIVE in Supabase**, `iam.verify_canonical` all PASS, components under `web.site` / `seo.competitor` | migration `seo_link_gap_tables` |
| ORM models regenerated | Done (`LinkGapDomain`, `LinkGapMatch`, new competitor columns) | `packages/matrx-seo/matrx_seo/db/models_seo.py` |
| Deterministic classifier (layer 1) | **Done + 38 tests** | `packages/matrx-seo/matrx_seo/competitor_classification.py` |
| Link-gap normalizer | **Done + 14 tests against a real captured payload** | `packages/matrx-seo/matrx_seo/providers/dataforseo/link_gap.py` |

| `seo.landscape_brief` + the staged-confidence gate | **LIVE**, 8 real briefs | `aidream/services/seo/landscape_brief.py`, SoR §8e |
| Domain registry wiring (T6) | **LIVE**, 166 rows read per org | `aidream/services/seo/domain_registry.py` |
| Classifier agent v3 (15 roles + `peer_scale` + the brief) | **LIVE**, slot repinned | `c1a55f02-9e10-4c2f-9a3b-6f0d1e7b4a21` |
| `discover_and_classify_competitors` + `POST /seo/sites/{id}/competitors/discover` | **LIVE** | `services/seo/competitor_autopsy.py` |
| The Review tab (brief card + ruling queue + ruling record) | **LIVE** | `features/marketing/competitors/` |

| Link-gap collection, persistence, ranking, CRM fold (T2) | **DONE 2026-08-15** | `matrx_seo/domain_link_gap.py`, `orm_repository._persist_link_gaps`, `services/crm/seo_domains.py::fold_link_gap_domains` |
| Matrx Authority Score on every gap domain | **DONE 2026-08-15** | `matrx_seo/authority_score.py` |

---

## Provider facts, verified by a real live call (2026-08-14, $0.024)

Do not re-derive these from the docs; the docs are ambiguous on the one that matters.

- **`exclude_targets` does the gap subtraction provider-side.** Competitors in `targets`
  (numbered map, up to 20), our domain in `exclude_targets` (up to 10). We diff nothing.
- **🚨 The inversion trap.** The numbered KEY identifies the COMPETITOR (via
  `result.targets`, which echoes the submitted map). The `target` field *inside* each
  numbered entry is the **REFERRING** domain, repeated identically under every key.
  Reading `target` as the competitor silently inverts the whole feature. Pinned by tests.
- **`item.summary.intersections_count`** is the match count — Semrush "Matches", Ahrefs
  intersect count. Use the provider's number, never recompute.
- **"From what page" is NOT in this endpoint.** It returns per-target aggregates
  (`referring_pages` counts) only. Page attribution needs the page-level call.
- **Cost: `$0.024 + $0.000036/row`** — a 1,000-row gap pull is **$0.06 per site**. Cost is
  not a reason to be stingy here.
- The op is `BACKLINKS_INTERSECTIONS` in `providers/dataforseo/operations.py`, declared
  `raw_only=True`. **That flag is why no parser branch existed** — it tells the adapter not
  to normalize. Clearing it is part of wiring the collector.
- ⚠️ **Default ordering returns junk.** The live probe's top 5 gap domains were
  `livelycity.com`, `usindex.app`, `intently.co`, `z1biz.com`, `getpracticehelp.com` —
  spam/link-farm shaped. A production run needs `order_by` on rank and `backlinks_filters`
  on spam score. Do not ship the raw default order.

---

## Remaining work

**Everything below the line is SHIPPED and on `main`.** T1, T2, T3, T5, T6 are done; T4 is
superseded by T7. Two things are left: **T7** (design agreed, now with real evidence) and
**T8** (waiting on Arman, not on code).

### T2 — Link-gap collection, persistence, ranking, CRM fold ✅ DONE 2026-08-15
Shipped by the outreach WP2 package (`common-docs/projects/outreach-system/`).

Two of this section's original premises turned out to be stale, and the correction is
worth keeping: the normalizer **was** already wired (`providers/dataforseo/adapter.py`
→ `normalize_link_gap_payload`), persistence **was** already built
(`orm_repository._persist_link_gaps`, including the min-2-matches rule and
`review_status='pending'`), and `raw_only=True` on `BACKLINKS_INTERSECTIONS` is
**correct as-is** — it exempts the op from the "must have a canonical normalizer"
precondition and does not suppress normalization. The real gap was the *domain-level
collector*, the *ranking*, and the *fold*.

- `packages/matrx-seo/matrx_seo/domain_link_gap.py` — seeds only from human-confirmed,
  link-gap-eligible competitors; `NoEligibleCompetitors` carries the counts and a
  sentence for the user; the route refuses with 409 before the stream opens.
  `link_gap_request.py` now holds the request shaping both intersection endpoints share,
  so page- and domain-level cannot drift, and both refuse the provider's default ordering.
- `POST /seo/sites/{id}/link-gap` (run) and `POST /seo/sites/{id}/link-gap/seed`
  (who would be compared, before anyone spends money).
- Ranking: **the Matrx Authority Score** (`matrx_seo/authority_score.py`) writes
  `priority_score`/`priority_reason` at persist time, with the full breakdown under
  `metadata.matrx_authority`. Unmeasured is NULL, never 0. It orders, never filters.
- CRM fold: `fold_link_gap_domains` + the `party_link_gap` payload kind (registered live
  in `platform.edge_payload_kind` and `platform.association_types`; migration `0360`),
  folding APPROVED rows only. Proven live: create → idempotent refold → a `pending` row
  correctly skipped with its reason; all probe rows cleaned up.
- Also live: **the one blocklist** (`crm.blocklist_entry`, migration `0361`) — every SEO
  fold drops blocklisted domains before any party is created.

**Still true, and still the gate:** with 0 confirmed competitors, every site correctly
runs nothing. Verified live across all 8 sites that have competitors. It lights up the
moment Arman rules (T8).

### T7 — Service lines (design agreed, not built — now with real evidence)
Market overlap is a property of **(service line × geography)**, not of a company or a
location. See SoR §8a. Supersedes T4's location-only join; the location detail hangs
*beneath* the service line.

**What changed since the design:** eight real briefs now carry proposed service lines as
`seo.landscape_brief.service_lines` jsonb — All Green came back with three or four, PBW Law
with three (two regional, one national), Blanca with two. That jsonb is the *input* to T7,
not a substitute for it: it cannot be joined, and `seo.competitor_service_overlap` needs a
real `service_line_id`. Promote the confirmed lines into `seo.service_line`, keep the brief
as the proposal surface, and keep `seo.competitor.market_overlap` as the truthful roll-up.

Also add `entity_role='franchise_sibling'` — same brand, separate P&L, real competition,
never folded into "us". ⚠️ It is agreed in SoR §8a but is **NOT in the live CHECK
constraint** (`competitor_entity_role_valid`, 15 values). Adding it means the DDL *and* a new
classifier agent version *and* repointing the slot — see "the lockstep" below.

### T8 — Ground truth with Arman ⬅ **BUILT AND SEEDED; WAITING ON HIM, NOT ON CODE**
Nothing to build. **Do not rebuild any of it.** The whole path is live and there are real
rows waiting. What exists: SoR §8e.

**Where he goes:** `/marketing/competitors` → pick a site → the **Review** tab.
1. The brief card — what we think the business is, our own 1-5 certainty, the service lines
   with a footprint each. He corrects it in one sentence; that text becomes
   `seo.landscape_brief.guidance`, which every later agent reads as fact.
2. The ruling queue — judgment calls first, deterministic registry rows last, Right / Wrong,
   optional free-text why. Lands in `seo.competitor.human_ruling` with
   `classification_status='confirmed'`.

**Nothing blocks on him.** A brief lapses to `auto_accepted` 24h after generation and
downstream work continues; a later correction still overrides it everywhere.

**Seeded** (under his own user id — he owns every org involved): 8 briefs, 84 classified
competitors, 12 distinct entity roles, 55 carrying `peer_scale`, 29 settled free by the
registry. Sites: allgreenrecycling, datadestruction, cosmeticinjectables, prpinjectionmd,
titaniummarketing, titaniumsuccess, pbwlaw (brief only), blancacleaningdfw.

**Watch the All Green case.** The analyst called commercial e-waste pickup *national*; his own
account is that small-business pickup is SoCal only. Get his words — it is the canonical
multi-service-line case and it decides how T7 gets built.

**What to do AFTER he rules — this is the payoff, do not skip it:**
- Read `seo.competitor.human_ruling` back: `verdict` (agreed vs corrected), `changed_axes`,
  and `why`. Those are the first labels this platform has ever had.
- **Re-derive the PROVISIONAL band thresholds** in `matrx_seo.competitor_classification`
  (`_BAND_THRESHOLDS`, `_ABSOLUTE_THRESHOLDS`) against them. That is what the whole exercise
  was for, and the reason those constants still carry a PROVISIONAL comment.
- Feed corrections back into `platform.domain_classification` where the correction is
  viewer-independent (a genuinely universal truth), and into an ORG override row where it is
  not. Never widen the system list from a single org's ruling.

---

## The lockstep that bites — read before touching any axis vocabulary

Widening a DB enum does **not** widen what the AI can propose. Found live 2026-08-15: the
pinned classifier's `output_schema` still enumerated the ORIGINAL 8 `entity_role` values
while the CHECK constraint had admitted 15 for hours — so `manufacturer`, `retail_channel`,
`adversary`, `professional_body`, `complementary_vendor`, `irrelevant` and `spam` were
**unreachable by the AI layer**, silently, with no error anywhere.

A vocabulary change is done only when all four land together:
1. the CHECK constraint,
2. a NEW `agent.definition_version` with the widened `output_schema`,
3. `agent.definition` itself (a run resolving the live definition rather than the pin would
   otherwise still see the old enum), and
4. the slot's `default_agent_version_id` repointed — slots pin with `use_latest: false`, so
   bumping the agent alone changes nothing — plus `contract.required_output_keys`.

Do NOT hand-insert a `definition_version` when creating a NEW agent: the definition's own
version-capture trigger writes version 1, and an explicit insert collides on
`agx_version_unique`. Insert the definition, then read the id the trigger created.

---

### T1 — Competitor identification + classification surface ✅ DONE 2026-08-15
Typed-name web lookup, one-click add, deterministic-first classification, pinned
platform-agent fallback, assist-backed confirmation, axis and link-gap editors, derived
labels, custom labels, real competitor doors. The 2026-08-15 follow-up is also done: the
editor carries `peer_scale` and the live 15-value `entity_role` list, and
`derivedCompetitorLabel` handles every role plus "Aspirational model".

### T3 — Page-level gap (`page_intersection`) ✅ DONE 2026-08-15
`packages/matrx-seo/matrx_seo/page_link_gap.py` + `aidream/services/seo/test_page_link_gap.py`.

### T4 — Multi-location competitor overlap — SUPERSEDED by T7
A footprint belongs to a service line, not to a location. Do not build the location-only join.

### T5 — Platform-wide setting doors + admin-gated access requests ✅ DONE 2026-08-15
Shipped: `features/settings/doors/` (`SettingDoor`, `SettingAnchor`, `settingDoorTarget`),
`features/access-gate/SettingAccessGate.tsx` + `SettingRequestActionButtons.tsx`, and the
internal-DM request action. SoR: `common-docs/systems/setting-doors/FEATURE.md`. Org-level
competitor `custom_labels` is its first consumer.

### T6 — Wire the domain registry ✅ DONE 2026-08-15
`classify_entity_role` takes a `DomainRuleset`; the hardcoded frozensets are gone.
`aidream/services/seo/domain_registry.py` loads + caches system rows plus the asking org's own
(org row wins, either load order). Live-verified: 12 of an 18-domain real sample settled with
zero AI, every real business declined to the agent layer.

### Known gap, not yet owned
`labs.google.competitors_domain` returns nothing for some real domains — `pbwlaw.com` got a
brief but zero competitors. `discover_and_classify_competitors` raises
`ValueError("No relevant competitors were discovered or supplied")`, which the new
"Find my competitors" button surfaces as a bare failure with no way forward. Needs a real
fallback (SERP-derived candidates) or honest copy pointing at the typed-name add path.

## Evidence base — real SERPs, 5 industries (2026-08-15)

Committed at `common-docs/systems/competitor-classification/serp-evidence-2026-08-15.json`
with the script beside it. 176 results, $0.0035. **Re-run it before changing any threshold.**
Headlines: the deterministic layer settles only **15%**; a national SERP for a local query is
almost entirely out-of-market peers (19 medspas in 19 cities); money vs informational queries
return different KINDS of entity, so a set built from one query type is biased.

---

## Schema state (all LIVE in Supabase, verified canonical)

`seo.competitor` — `business_overlap`, `market_overlap`, `search_overlap_band`, `entity_role`
(15 values), `peer_scale`, `posture`, `classification_status`, `use_for_link_gap`,
`custom_labels`, `classification_confirmed_at/_by`.
`seo.link_gap_domain` + `seo.link_gap_match` — components under `web.site` / `seo.competitor`,
`iam.verify_canonical` all PASS.

---

## Open questions for Arman

1. **Service radius per location** — user-set per location, or inferred and confirmed? T4
   works either way but the in-range flag needs it.
2. **Franchise siblings** — a franchisee competing with a sibling franchisee in the next town.
   `own_brand` says "this is us" and does not cover it.
3. **Threshold validation / ground truth** — thresholds remain PROVISIONAL. §3a is the first
   real evidence base; next step is running the classifier across every site and having a
   human rule on a sample.

## Related

- `common-docs/systems/competitor-classification/FEATURE.md` — the taxonomy (SoR)
- `docs/handoffs/outreach-system.md` — the outreach engine this feeds
- `aidream/aidream/services/crm/FEATURE.md` — the bridge and its provenance contract
- `docs/handoffs/crm-record-classification.md` — where these records land
