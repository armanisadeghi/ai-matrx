---
status: active
updated: 2026-08-14
repos: [aidream, matrx-frontend, common-docs]
owner: partially built — see "What is built" before starting anything
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

## What is built (verified, committed, NOT yet deployed)

| Piece | State | Where |
|---|---|---|
| Taxonomy + link-gap seed rule | **Done**, committed | `common-docs/systems/competitor-classification/FEATURE.md` |
| `seo.competitor` classification axes | **LIVE in Supabase** — `business_overlap`, `market_overlap`, `search_overlap_band`, `entity_role`, `posture`, `classification_status`, `use_for_link_gap`, `custom_labels`, `classification_confirmed_at/_by` + CHECKs + 2 indexes | migration `seo_competitor_classification_axes` |
| `seo.link_gap_domain` + `seo.link_gap_match` | **LIVE in Supabase**, `iam.verify_canonical` all PASS, components under `web.site` / `seo.competitor` | migration `seo_link_gap_tables` |
| ORM models regenerated | Done (`LinkGapDomain`, `LinkGapMatch`, new competitor columns) | `packages/matrx-seo/matrx_seo/db/models_seo.py` |
| Deterministic classifier (layer 1) | **Done + 38 tests** | `packages/matrx-seo/matrx_seo/competitor_classification.py` |
| Link-gap normalizer | **Done + 14 tests against a real captured payload** | `packages/matrx-seo/matrx_seo/providers/dataforseo/link_gap.py` |

⚠️ **Both new modules are BUILT AND NOT YET WIRED** — nothing calls them. That is
deliberate staging, not abandoned work; the remaining tasks below are their consumers.

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

### T1 — Competitor identification + classification surface ✅ DONE 2026-08-15
Typed-name web lookup, one-click add, deterministic-first classification, pinned
platform-agent fallback (`seo.competitor_classifier`), assist-backed confirmation, axis and
link-gap editors, derived labels, custom labels, and real competitor doors ship at
`/marketing/competitors`. Every machine result stays `proposed` until a human confirms.
**Follow-up now needed:** surface the two NEW axes added 2026-08-15 (`peer_scale`, the
widened `entity_role` list) — the columns are live but the UI predates them.

### T2 — Link-gap collection, persistence, ranking, CRM fold ⬅ **THE OPEN ONE**
Not started. Verified 2026-08-15: no `aidream/services/seo/link_gap*.py`, no `party_link_gap`
payload kind, `raw_only=True` still set on `BACKLINKS_INTERSECTIONS`.
- Clear `raw_only`, wire `normalize_link_gap_payload` into the collector + repository.
- Seed ONLY from `classification_status='confirmed'` AND link-gap-eligible competitors
  (`default_use_for_link_gap`, or the explicit `use_for_link_gap` override).
- **Minimum 2 matches** (Arman agreed; Ahrefs/Majestic default the same).
- **Do NOT ship the provider default ordering** — see the warning above.
- Human gate: rows land `review_status='pending'`; AI writes `priority_score` +
  `priority_reason` to ORDER the list, never to filter it.
- CRM fold via `aidream/services/crm/seo_domains.py` with a new registered `party_link_gap`
  payload kind pinned to `(party, seo_link_gap_domain)`. Fold only APPROVED rows.

### T3 — Page-level gap (`page_intersection`) ✅ DONE 2026-08-15
`packages/matrx-seo/matrx_seo/page_link_gap.py` + `aidream/services/seo/test_page_link_gap.py`;
the shared normalizer now handles both endpoints.

### T4 — Multi-location competitor overlap (NEW, proposed, not started)
Design is in the SoR §8a. Short version: **do not invent a location entity.** `crm.address`
already carries lat/long on a `crm.party`, and a competitor IS a party (§7), so both sides
are modelled. Add one join table `seo.competitor_location_overlap` (`competitor_id` × our
`address_id`) with distance + in-radius + per-pair `market_overlap`; keep
`seo.competitor.market_overlap` as the truthful roll-up so nothing built on it breaks.
Blocked on one Arman answer: where per-location **service radius** comes from.

### T5 — Platform-wide setting doors + admin-gated access requests (NEW)
Owner: background task chip, 2026-08-15. **Not a competitor feature** — it came out of this
conversation and is platform-wide: (a) any UI governed by a setting elsewhere gets a door to
that exact setting, org-level and user-level alike; (b) the existing
`matrx-frontend/features/access-gate/` primitive extends from gating PAGES to gating
org-admin-only SETTINGS; (c) the request routes through the internal DM system carrying an
inline action so the admin resolves it without navigating. Org-level competitor
`custom_labels` is its first consumer.

---

### T6 — Wire the domain registry (BLOCKING, small) ⬅ built-and-unwired
`platform.domain_classification` is LIVE with 166 seeded rows and measured coverage
(**34.7%** of our 12,322-URL research corpus, **23%** of the commercial SERP sample, up from
15% hardcoded). **Nothing reads it yet.** Point
`matrx_seo.competitor_classification` at it: the requesting org's row wins, else the
system-org row (`Matrx System`, `39c38960-d30c-4840-b0c1-c9960de95582`). Keep the pure
derive/default functions unchanged. First task of the ground-truth chip.

### T7 — Service lines (NEW, design agreed, not built)
Market overlap is a property of **(service line × geography)**, not of a company or a
location. All Green is national for ITAD/data destruction and SoCal-only for small-business
e-waste pickup — a national ITAD rival is not a competitor for local pickup. See SoR §8a.
Supersedes the location-only join in the earlier T4 sketch; the location detail hangs
*beneath* the service line. Also adds `entity_role='franchise_sibling'` — same brand,
separate P&L, real competition, never folded into "us".

### T8 — Ground truth with Arman (NEW)
Owner: background task chip, 2026-08-15. Zero human rulings exist anywhere in the system, so
every threshold is provisional and more API data does not help — the missing thing is
labels. Arman is the subject; his site ids and the session protocol are in SoR §10. Must
follow the staged-confidence pattern (SoR §8d), not be a taxonomy quiz.

---

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
