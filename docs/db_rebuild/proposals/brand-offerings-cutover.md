# DB Change Proposal — Brand-owned offerings

**One-liner:** Separate the platform suggestion catalog from brand-owned offerings and explicit site availability so no site can display or assign an offering it has not selected.
**Change types:** canonicalize · split · migrate · modify
**Status:** awaiting GO

## 1. Scope — the cluster

| Table | Rows | Verdict | Why |
|---|---:|---|---|
| `seo.topic` | 409 | split | It mixes shared suggestions, SEO taxonomy, and company offerings under the wrong product name. |
| `seo.keyword_topic` | 3,672 | keep as taxonomy; migrate offering placement out | A global keyword-to-topic fact cannot prove what a brand sells or vary safely by site. |
| `seo.site_topic_value` | 32 | migrate to offering value | Site-specific worth survives, but it must reference a brand offering. |
| `seo.starter_pack_item` | live FK consumer | repoint offering items | A pack proposes offerings; it never makes them owned merely by existing. |
| `web.brand` | 40 | parent | The brand owns the commercial catalog. |
| `web.site` | 58 | availability scope | A site exposes only explicitly selected brand offerings. |
| `web.brand_offering` | new | create + certify | Canonical, tenant-owned offering identity and hierarchy. |
| `web.site_offering` | new | create + certify | Explicit site-to-brand-offering availability; absence means unavailable. |
| `seo.site_keyword_offering` | new | create + certify | Site-specific keyword placement against an offering the site actually exposes. |
| `seo.site_offering_value` | new | create + certify | Site-specific worth and match judgments over a brand offering. |

## 2. Outcome (before → after)

Today `seo.topic` is a global 409-row tree rendered as if it were every company's offerings. After the cutover, `web.brand_offering` is the only company-offering identity, `web.site_offering` is the explicit availability edge, and every normal site surface reads only that edge. Shared suggestions remain reachable only inside Add offering. The word `topic` disappears from the offering product contract, tables, RPCs, types, and customer vocabulary.

## 3. Usage reality — repoint cost

- **Frontend:** the offering tree, keyword workbench, Search Console filters and cells, run console, Content Planning taggers, intake, and value receipts consume `seo.topic` / `seo.keyword_topic`. The focused table-reference audit found 76 actionable `seo.keyword_topic` references, 67 compiler-invisible.
- **Python:** `matrx-seo` models, artifact writers, placement agents, ORM generation, and shared-dictionary association tests depend on the old global model.
- **Database:** inbound FKs are `seo.keyword_topic.topic_id`, `seo.site_topic_value.topic_id`, `seo.starter_pack_item.topic_id`, and `seo.topic.parent_id`; topic/value/placement RPC families and value resolvers also read the old relations.
- **Current data:** 13 live brands, each presently with one live site; 119 site/topic combinations across 6 sites; 32 live site-worth rows. The reported site has 37 directly linked topics and 38 after required ancestors, while the page displays 408 live catalog rows.
- **matrx-extend / matrx-local:** no direct consumer found in the focused search; recheck before cutover.

## 4. Plan — additive → cutover → retire

1. `[DB][reversible]` Create and certify `web.brand_offering` with `brand_id`, explicit `organization_id`, optional template provenance, company-controlled name/description/kind, and self-referencing `parent_id`.
2. `[DB][reversible]` Create and certify `web.site_offering` with exact `(site_id, brand_offering_id)` uniqueness. The row is the availability decision; no implicit brand-wide read substitutes for it.
3. `[DB][reversible]` Create and certify `seo.site_keyword_offering` and `seo.site_offering_value`; enforce matching site, brand, and organization in the canonical RPC writers.
4. `[DB][reversible]` Split the shared source: real semantic taxonomy may remain a topic system; selectable commercial suggestions move to an offering-template catalog. Neither is a company offering.
5. `[DB][reversible]` Backfill brand offerings from existing site keyword placements and site-worth rows, including only the ancestors required to preserve the selected hierarchy. Backfill one explicit site-availability row per migrated offering.
6. `[FE][PY]` Repoint every offering list, picker, filter, assignment, KPI, agent provision, intake flow, placement agent, resolver, and receipt to brand offerings plus explicit site availability.
7. `[DB][gated]` Make offering assignment refuse any brand offering without a live `web.site_offering` row for the target site.
8. `[DB][gated]` Remove the old offering semantics from `seo.topic`, `seo.keyword_topic`, and their RPC names. Preserve only genuine taxonomy use; graveyard superseded relations rather than dropping data.

## 5. Data migration — lossless proof

For every existing site/topic placement or worth row, resolve its site's brand, create or reuse the corresponding brand offering, preserve required ancestry, add explicit site availability, then repoint placement/value facts. Verify old→new counts per site, zero cross-brand references, zero placement rows without availability, and zero visible unselected offerings. Keep source relations intact until all consumers and live canaries use the new model.

## 6. Decisions — recommended

- **D1 — Canonical owner?** Brand / site / organization. **Recommend: brand.** A brand is the commercial identity; organization is only the authorization boundary, and a website is only one distribution property.
- **D2 — Does a site automatically inherit every brand offering?** automatic / explicit availability. **Recommend: explicit availability.** The UI may bulk-select all, but absence must always mean the site does not expose it; a newly created site must not silently acquire every offering.
- **D3 — What does parent-child mean?** catalog hierarchy / availability inheritance. **Recommend: catalog hierarchy only.** Product families and service branches must never encode which site sells them.
- **D4 — How are site-only offerings represented?** separate site entity / brand offering available to one site. **Recommend: one brand offering with one site-availability row.** Identity stays canonical while distribution remains narrow.
- **D5 — What happens to `topic`?** rename wholesale / split by meaning. **Recommend: split.** Keep `topic` only for genuine semantic taxonomy; commercial templates get an offering name and company inventory becomes `brand_offering`.

## 7. Acceptance gate

- Every new table passes `iam.canonical_certify_ok(...)` with zero unjustified warnings.
- Every offering read is brand-scoped; every site read additionally joins explicit live availability.
- Zero site-keyword placements reference an unavailable or cross-brand offering.
- Shared suggestions appear only after opening Add offering and never become selectable until adoption creates the brand and site rows.
- Renaming, reparenting, or deleting an offering affects one brand and never mutates a platform template or another brand.
- `pnpm sync-types`, focused Jest suites, migration checks, aidream generation, and clean backend boot pass.
- Local admin canary proves the reported site shows only its migrated selections and can add a shared suggestion through the explicit adoption flow.

## 8. Reversibility & data-loss guards

The rollout is additive until all consumers are repointed. Source IDs and provenance remain on migrated rows; pre/post counts are captured per site. Old relations are graveyarded only after consumer and live canary proof. No hard drop is part of this change.

## 9. Out of scope

- Organization-wide product master data shared across multiple brands. If later required, brand offerings may point to a separate organization product identity without changing site availability.
- Automatic syndication to stores, marketplaces, ads, or social channels; those are future availability edges over the same brand offering.
- Treating problems, audiences, authority, reputation, or recruiting as offerings. Those remain classification concepts and must not enter the brand offering inventory.

## 10. Cross-repo finalize + docs

Apply and ledger the migration, regenerate frontend and aidream database models, repoint both repos in one safe cutover, update the canonical Marketing/SEO docs, run the required gates, commit, and push both repositories. Do not release from this task unless explicitly requested.

---

Reply `go` to execute, or change any decision above.
