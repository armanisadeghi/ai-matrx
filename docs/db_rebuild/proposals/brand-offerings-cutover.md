# DB Change Proposal — Brand-owned offerings

**One-liner:** Separate the platform suggestion catalog from brand-owned offerings and explicit site availability so no site can display or assign an offering it has not selected.
**Change types:** canonicalize · split · migrate · modify
**Status:** GO received; canonical tables, backfill, and operation RPCs applied live and ledgered 2026-08-25. Frontend/Python consumer cutover remains in progress.

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
| `web.offering_template` | new | create + certify | Platform-owned suggestion catalog, explicitly owned by the Matrx System organization. |
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

## 4. Where the data sits — final shapes

Live-DB facts these shapes answer (verified 2026-08-25): `seo.topic` has 408 live rows in ONE org, `organization_id` **defaults to a hardcoded org UUID**, `visibility` defaults to `public`, and `is_builtin` defaults to `true` — a shared platform catalog wearing tenant columns. By `node_type`: `service` 369 (332 parentless) + `product` 6 are the real offerings; `brand` 9 · `problem` 11 · `authority` 12 · `reputation` 1 are classification concepts and never become offerings.

**`web.brand_offering` — the ONLY company-offering identity.** Lives in `web`, not `seo`: an offering is commercial brand data that SEO merely consumes, alongside stores, social, and ads later.

| Column | Shape | Rule |
|---|---|---|
| `brand_id` | FK → `web.brand`, NOT NULL | The owner. Delete/rename/reparent affects this brand only. |
| `organization_id` | uuid NOT NULL, **no default** | Trigger-enforced equal to the brand's org. Never a hardcoded default again. |
| `parent_id` | self-FK, nullable | Trigger-enforced same `brand_id`. Catalog hierarchy only (D3). |
| `name`, `slug`, `description` | text; `slug` unique per brand | Company-controlled copy; edits never touch a template. |
| `kind` | `product` \| `service` | The two node types that are actually offerings. Nothing else is admitted. |
| `status` | default `active` | Soft retirement without losing keyword history. |
| `template_id` | FK → `web.offering_template`, nullable | Provenance only — see borrow semantics below. |
| `adopted_at`, `sort`, standard audit/soft-delete columns | | `visibility` defaults org-scoped (`platform.entity_default_visibility`), **not** `public`. |

**`web.offering_template` — where the system defaults sit.** This is a normal canonical system-owned entity: `organization_id NOT NULL`, explicitly written as the Matrx System organization (`39c38960-d30c-4840-b0c1-c9960de95582`) with **no column default or database resolver**. `visibility` is at least `internal`, making the system-org rows globally readable through the canonical access kernel. Columns: `name`, `slug`, `kind` (`product`|`service`), `description`, `aliases`, `parent_id` (template hierarchy), `industry_id` (nullable link to the industry entity starter packs already use), `status`, and standard audit/soft-delete columns. Super-admin writes only through one guarded RPC family; direct authenticated writes are refused and audited. Templates are seeded from today's builtin `service`/`product` topic rows and from ratified industry pack work.

**How we borrow — copy-on-adopt, never live inheritance.** Adopting a template (from Add offering or a starter pack) **copies** name/description/kind/needed ancestry into `web.brand_offering` rows and stamps `template_id` + `adopted_at`. After adoption the brand row is wholly the brand's: template edits never mutate brand offerings, brand edits never touch templates or other brands. Provenance exists so the UI can show From template / Changed from template and offer an explicit opt-in refresh later — the exact pattern the value-system rulebook already proved with pack provenance. Adoption through a site's flow also writes that site's `web.site_offering` row in the same transaction; adoption from a brand surface writes no availability rows.

**`web.site_offering` — the availability edge.** `(site_id, brand_offering_id)` unique; trigger-enforced same brand and org; `status` default `active`; audit columns. The row IS the decision; absence means the site does not expose it. This is the first of the channel edges — social/store/ads later are sibling edge tables over the same `brand_offering` identity, never new offering identities.

**`seo.site_keyword_offering` — keyword placement.** `(site_id, keyword_id, brand_offering_id)` unique; `is_primary`, `confidence`, `assigned_by`, `notes` carried over from `keyword_topic`. Canonical RPC writer refuses any offering without a live `web.site_offering` row for that site and any cross-brand/org mismatch.

**`seo.site_offering_value` — worth and match.** `(site_id, brand_offering_id)` unique; carries `site_topic_value`'s judgment columns (`offering_match`, `lead_quality`, `audience_fit`, `capacity_appetite`, `brand_fit`, `weight`, `notes`) unchanged; same writer guards.

**What remains `seo.topic`:** only the genuine classification tree (`brand`, `problem`, `authority`, `reputation` — 33 live rows) and `seo.keyword_topic` rows pointing at it. The hardcoded org default, `is_builtin` semantics, and `service`/`product` node types are removed from it at retirement.

## 5. Plan — additive → cutover → retire

1. `[DB][reversible]` Create and certify `web.brand_offering` and `web.offering_template` exactly as shaped in §4 — no org default, org-scoped visibility default, trigger-enforced brand/org/parent consistency.
2. `[DB][reversible]` Create and certify `web.site_offering` with exact `(site_id, brand_offering_id)` uniqueness. The row is the availability decision; no implicit brand-wide read substitutes for it.
3. `[DB][reversible]` Create and certify `seo.site_keyword_offering` and `seo.site_offering_value`; enforce matching site, brand, and organization in the canonical RPC writers.
4. `[DB][reversible]` Split the shared source: `service`/`product` topic rows that are shared suggestions seed `web.offering_template`; `brand`/`problem`/`authority`/`reputation` rows remain `seo.topic` taxonomy. Repoint `seo.starter_pack_item.topic_id` → `offering_template_id` for offering items. Neither side is a company offering.
5. `[DB][reversible]` Backfill brand offerings (copy-on-adopt, `template_id` provenance stamped) from existing site keyword placements and site-worth rows, including only the ancestors required to preserve the selected hierarchy. Backfill one explicit site-availability row per migrated offering, then migrate each affected site's `keyword_topic` placements into `site_keyword_offering` and its `site_topic_value` rows into `site_offering_value`.
6. `[FE][PY]` Repoint every offering list, picker, filter, assignment, KPI, agent provision, intake flow, placement agent, resolver, and receipt to brand offerings plus explicit site availability.
7. `[DB][gated]` Make offering assignment refuse any brand offering without a live `web.site_offering` row for the target site.
8. `[DB][gated]` Remove the old offering semantics from `seo.topic`, `seo.keyword_topic`, and their RPC names. Preserve only genuine taxonomy use; graveyard superseded relations rather than dropping data.

## 6. Data migration — lossless proof

For every existing site/topic placement or worth row, resolve its site's brand, create or reuse the corresponding brand offering, preserve required ancestry, add explicit site availability, then repoint placement/value facts. Verify old→new counts per site, zero cross-brand references, zero placement rows without availability, and zero visible unselected offerings. Keep source relations intact until all consumers and live canaries use the new model.

## 7. Decisions — FINAL (Arman delegated final authority 2026-08-25)

- **D1 — Canonical owner?** **DECIDED: brand.** A brand is the commercial identity; organization is only the authorization boundary, and a website is only one distribution property.
- **D2 — Does a site automatically inherit every brand offering?** **DECIDED: explicit availability.** The UI may bulk-select all, but absence must always mean the site does not expose it; a newly created site must not silently acquire every offering.
- **D3 — What does parent-child mean?** **DECIDED: catalog hierarchy only.** Product families and service branches must never encode which site sells them.
- **D4 — How are site-only offerings represented?** **DECIDED: one brand offering with one site-availability row.** Identity stays canonical while distribution remains narrow.
- **D5 — What happens to `topic`?** **DECIDED: split.** `topic` keeps only genuine semantic taxonomy (`brand`/`problem`/`authority`/`reputation`); shared suggestions become `web.offering_template`; company inventory becomes `web.brand_offering`.
- **D6 — Where do system defaults live, and how do brands borrow?** **DECIDED: `web.offering_template`, copy-on-adopt.** Platform-owned means explicitly owned by the Matrx System organization, never ownerless and never assigned by a default or resolver. Super-admin writes only. Adoption copies into brand rows and stamps `template_id` provenance; no live inheritance in either direction. Reachable only inside Add offering and starter-pack review.
- **D7 — Tenant hygiene on the new tables?** **DECIDED: no hardcoded defaults, enforced consistency.** No column ever defaults to a specific org UUID; `visibility` defaults org-scoped, not public; triggers enforce offering↔brand↔org and edge↔brand agreement so a cross-tenant row is unrepresentable, not merely unqueried.
- **D8 — Other channels (social, stores, ads)?** **DECIDED: sibling availability edges later, same identity.** `web.site_offering` is the first edge; future channels get their own explicit edge tables over the same `brand_offering` rows. No channel ever mints an offering identity.

## 8. Acceptance gate

- Every new table passes `iam.canonical_certify_ok(...)` with zero unjustified warnings.
- Every offering read is brand-scoped; every site read additionally joins explicit live availability.
- Zero site-keyword placements reference an unavailable or cross-brand offering.
- Shared suggestions appear only after opening Add offering and never become selectable until adoption creates the brand and site rows.
- Renaming, reparenting, or deleting an offering affects one brand and never mutates a platform template or another brand.
- `pnpm sync-types`, focused Jest suites, migration checks, aidream generation, and clean backend boot pass.
- Local admin canary proves the reported site shows only its migrated selections and can add a shared suggestion through the explicit adoption flow.

## 9. Reversibility & data-loss guards

The rollout is additive until all consumers are repointed. Source IDs and provenance remain on migrated rows; pre/post counts are captured per site. Old relations are graveyarded only after consumer and live canary proof. No hard drop is part of this change.

## 10. Out of scope

- Organization-wide product master data shared across multiple brands. If later required, brand offerings may point to a separate organization product identity without changing site availability.
- Automatic syndication to stores, marketplaces, ads, or social channels; those are future availability edges over the same brand offering.
- Treating problems, audiences, authority, reputation, or recruiting as offerings. Those remain classification concepts and must not enter the brand offering inventory.

## 11. Cross-repo finalize + docs

Apply and ledger the migration, regenerate frontend and aidream database models, repoint both repos in one safe cutover, update the canonical Marketing/SEO docs, run the required gates, commit, and push both repositories. Do not release from this task unless explicitly requested.

---

Execution was authorized and began 2026-08-25. The database foundation is live; consumer cutover follows the acceptance gate above.
