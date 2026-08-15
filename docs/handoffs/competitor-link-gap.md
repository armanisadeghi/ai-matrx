---
status: active
updated: 2026-08-14
repos: [aidream, matrx-frontend]
owner: unassigned — Arman will assign a dedicated agent
---

# Competitor link gap — the outreach target we cannot currently see

**Arman, 2026-08-14:**

> *"When we're doing things to try to get backlinks, it's not so much who's linking to us —
> it's about analyzing who's linking to our competitors."*

He is right, and **we do not collect that data.** Every backlink prospect the platform can
currently produce comes from our OWN referring domains — which are, by definition, the
people who already link to us. The highest-value prospect list in backlink outreach is the
one we cannot build: *domains that link to two of my competitors and not to me.*

---

## What exists today (verified against live code + data, 2026-08-14)

| Capability | State |
|---|---|
| Our own referring domains (`seo.referring_domain_profile`, 777 rows live) | Live, crawled, quality-scored |
| Those domains → canonical `crm.party` organizations | Live (outreach G1) |
| `seo.competitor` — competitor records with `tracking_status` (`candidate`/`tracked`), `relevance_score`, `threat_level`, `discovery_source`, `human_ruling` | Live, 4 rows |
| `seo.competitor_opportunity` — content/keyword opportunities per competitor | Live |
| `backlink_dimension_snapshot.dimension_kind='competitor_domain'` (218 rows) | Live — but this is DataForSEO `/backlinks/competitors`, i.e. **domains that share referring domains with us**. It answers "who else do my linkers link to", NOT "who links to my competitor". |
| `/v3/backlinks/domain_intersection/live` + `/page_intersection/live` | **Known to the operations catalogue and NOT collected** — no parser branch in `providers/dataforseo/backlinks.py`, no persistence, no consumer |

So the gap is precise: **the provider endpoint that answers Arman's question is already
catalogued and simply never wired.**

---

## The work

1. **Collect it.** Add the intersection endpoints to the backlinks collector
   (`packages/matrx-seo/matrx_seo/providers/dataforseo/backlinks.py`) the same way the
   existing endpoints are parsed. Inputs are N competitor domains (from `seo.competitor`)
   plus our own; the useful query is "links to ≥K competitors, not to us".
2. **Persist it as first-class prospects, not a snapshot blob.** A link-gap domain deserves
   the same `referring_domain_profile`-grade record our own linkers get, with the
   attribution that makes it interesting: *which competitors it links to, and from what
   page*. Decide deliberately whether that is a new column set on the existing profile
   table or a sibling — do not smuggle it into `metadata`.
3. **Fold it into the CRM** through the existing bridge
   (`aidream/services/crm/seo_domains.py`) with its own provenance payload kind
   (`party_link_gap`, alongside `party_link_prospect` / `party_outreach_case`) so the CRM
   record can always answer "why is this org here" with "it links to 3 of your competitors
   and not to you".
4. **Prioritise.** A gap domain linking to three competitors with a good quality score is
   worth more than one linking to one. This ranking is the actual product.

## The second, separate gap: which competitors are REAL?

Arman, same conversation:

> *"Part of that would also be to identify our competitors — and that might be a completely
> missing aspect of our marketing system, where it doesn't make it easy for us to look
> through search engine results and identify which ones are our real competitors and which
> ones are just search competitors, which makes them different."*

A **search competitor** ranks for your keywords (Wikipedia, Reddit, a directory, a national
publisher). A **real competitor** sells what you sell to the people you sell to. Treating
them as one list poisons everything downstream — the link gap most of all, because chasing
Wikipedia's linkers is worthless.

`seo.competitor` already has the fields to record the distinction (`tracking_status`,
`relevance_score`, `threat_level`, `human_ruling`, `resolved_assessment`) and a competitor
autopsy agent exists (`aidream/services/seo/competitor_autopsy.py`). **What is missing is
the judgment step and the surface for it:** nothing decides real-vs-search, and nothing asks
the user. This is exactly the shape the platform is built for — a classification agent
proposing, a human confirming in one click — per the assists doctrine
(`common-docs/systems/assists/FEATURE.md`).

---

## How to run this (Arman's instruction)

Research first — the live tables, the DataForSEO intersection endpoints, and how Ahrefs
("Link Intersect"), Semrush ("Backlink Gap") and Majestic present this — then bring him the
basics **plus open questions** and interview him for the vision. Do not invent the ranking
model or the real-vs-search criteria alone.

**Scale reminder (his words):** this ships to tens of thousands of end users. Any inclusion
threshold must be validated by running the candidate algorithm across every site in the
system and comparing against what a human would have kept — never hand-tuned against one
test account.

## Related

- `docs/handoffs/outreach-system.md` — the outreach engine this feeds (§1 names the
  competitor link gap as an opportunity source).
- `aidream/aidream/services/crm/FEATURE.md` — the bridge and its provenance contract.
- `docs/handoffs/crm-record-classification.md` — where these records land without drowning
  the CRM.
