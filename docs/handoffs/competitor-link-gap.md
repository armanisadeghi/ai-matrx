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

### T1 — Competitor identification + classification surface  ⭐ Arman called this critical
Owner: spawned as a background task chip, 2026-08-14.
- Manual add: type a name → web lookup → confirm the site → one-click add.
- The approval queue: deterministic + AI proposals land as `classification_status='proposed'`
  with a one-click confirm per the assists doctrine (`common-docs/systems/assists/FEATURE.md`).
- Axis editors + custom labels; every default overridable.
- Wire `matrx_seo.competitor_classification` (layer 1) ahead of any AI call.
- Build the AI classifier as a **platform agent** (a slot, like
  `seo.competitor_opportunity_autopsy`), never hardcoded heuristics.
- Surface lives under `/marketing/competitors`, but competitors must appear wherever they
  are relevant — this is a marketing fact, not an SEO report row.

### T2 — Link-gap collection, persistence, ranking, CRM fold
Owner: spawned as a background task chip, 2026-08-14.
- Clear `raw_only`, wire `normalize_link_gap_payload` into the collector + repository.
- Seed ONLY from `classification_status='confirmed'` AND link-gap-eligible competitors
  (`default_use_for_link_gap`, or the explicit `use_for_link_gap` override).
- **Minimum 2 matches** (Arman agreed; Ahrefs/Majestic default the same).
- Human gate: rows land `review_status='pending'`; AI writes `priority_score` +
  `priority_reason` to ORDER the list, never to filter it.
- CRM fold via the existing bridge (`aidream/services/crm/seo_domains.py`) with a new
  registered `party_link_gap` payload kind pinned to
  `(party, seo_link_gap_domain)` — the other two kinds are the pattern to copy.
  **Fold only APPROVED gap domains**, or the CRM drowns.

### T3 — Page-level gap (`page_intersection`)
Owner: spawned as a background task chip, 2026-08-14. Page identity already exists
(`seo.backlink.page_id`, `resolve_backlink_target_page_ids`).

---

## Open questions for Arman (asked, not yet answered)

1. **Custom user-defined types.** Free-text labels on top of the four fixed axes — is that
   enough for an agency, or does an agency need to define its own *axis values*?
2. **Are `supplier` / `partner` competitors at all?** They are modelled because they appear
   in your SERP and often link to you, but they may belong in the CRM as relationships.
3. **Multi-location businesses.** A franchise with 40 locations has a different competitor
   set per location. `market_overlap` handles one site; it does not model a hierarchy.
4. **Threshold validation cannot be done today.** Arman's standing rule is that an inclusion
   threshold must be validated across every site in the system, never tuned on one account.
   Live: only 4 of 31 sites have referring-domain data, only 2 have competitors (one is
   `rival.example` test data), and **zero** referring domains have ever been human-reviewed —
   so there is no ground truth to validate against. The band thresholds in
   `competitor_classification.py` are marked PROVISIONAL. Options put to Arman: (a) collect
   gap data for all 31 sites (~$2) and validate on distribution, (b) make the threshold a
   visible user control so none needs defending, (c) generate ground truth by having the
   classifier propose across all existing competitors and having a human rule on a sample.

## Related

- `common-docs/systems/competitor-classification/FEATURE.md` — the taxonomy (SoR)
- `docs/handoffs/outreach-system.md` — the outreach engine this feeds
- `aidream/aidream/services/crm/FEATURE.md` — the bridge and its provenance contract
- `docs/handoffs/crm-record-classification.md` — where these records land
