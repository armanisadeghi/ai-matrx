# DB Change Proposal — Brand-owned offerings

> 🚨 **REDIRECTED 2026-09-17 — `CFL-059`. Do not build the remaining steps of this proposal.**
> **This document says:** `web.brand_offering` is the ONLY company-offering identity, and the way
> to fix `seo.topic` is to move company offerings into it.
> **[The topic-tree census](/Users/armanisadeghi/code/common-docs/operations/for-arman/2026-09-17/topic-tree-census-and-collapse.md) and Arman's 2026-09-17 ruling say:** the SEO topical map
> (`seo.map_topic`) is the platform's ONE topic primitive, and `web.brand_offering` is itself one
> of the duplicate trees that collapses into it — all 161 of its rows have an exact name twin in
> `seo.topic`, and one scheduled run writes both tables every morning 0.4 s apart.
> **Why it matters:** this proposal's remaining steps move the same 15,655 keyword links into a
> table that has to move again. They are the SAME work as the map's collapse steps 3 and 4, aimed
> at the wrong destination.
> **Your move:** stop here. Take the next step from
> `common-docs/projects/table-provisioning/REGISTER.md` rows COLLAPSE-1…COLLAPSE-12, not from §5
> or §7a below. Sections 1–4 and 7 (decisions D1–D10) remain accurate history and their reasoning
> — brand ownership, explicit availability, copy-on-adopt, worth in points, no hardcoded org
> defaults — carries over to the map unchanged. Bug fixes that protect live screens continue.
> Register: `common-docs/operations/conflicts.md` · `CFL-059` (closed by delegation, 2026-09-17:
> Arman delegated the sequencing call — *"I don't even know what it is so it's up to you"*).

**One-liner:** Separate the platform suggestion catalog from brand-owned offerings and explicit site availability so no site can display or assign an offering it has not selected.
**Change types:** canonicalize · split · migrate · modify
**Status (2026-09-14 14:05 UTC, honest):** Steps 1–5 live since 2026-08-25. **Step 6 in progress.** Live on the new brand-offering model and verified: the value resolver (lossless, D9), every database placement, worth and availability writer, the aidream Topic Assigner and site valuer (which now PROPOSE an offering a site does not offer instead of adding it, D2, step 6g), the client doors, confirm-with-reason, the drift read, the keyword workbench and table Offering column, the Search Console queries table, the value workbench, the ruling session, the keyword dossier, both approval-queue placement kinds, the value receipts, and the Offerings screen itself (6h–6h3). **Not done:** the remaining readers (§7a), stopping the legacy dual-writes, the reverted live write test through the UI, and step 8 (retire).

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

> 🚨 **`CFL-059` — steps 6, 7 and 8 below are CANCELLED as written (2026-09-17).** The repoint and
> the retirement happen once, into `seo.map_topic`, as collapse steps 5–11. See the stamp at the
> top of this file.

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
- **D9 — What scale is offering worth on? (2026-09-14)** **DECIDED: points.** The platform rules worth as points (register KI-001; principles in `common-docs/systems/marketing/seo/seo-keywords/keyword-system-decisions.md`, mechanics in `value-system.md`): score = (baseline + points + stamp adds) × factors, floored at 0, `never` wins. `seo.site_offering_value.weight` constrained 0–100 contradicted that, so it is now `worth_points` (numeric, unbounded, NOT NULL), carrying exactly the `add` term the live resolver consumed from `seo.site_topic_value.weight`: the nearest ancestor-or-self worth row on the placement's lineage adds its points; `lead_quality = negative_value` or `offering_match` in `not_offered | actively_avoided` forces Negative. A worth row with no weight meant 50 to the resolver; no live row relied on it, and a legacy caller that still omits it writes 50 marked `worth_points_from_resolver_default`. **Reason:** the move had to be lossless and invent no number. **Proof** (`scripts/check-offering-resolver-equivalence.ts`, whole corpus of every site with worth, before/after the live apply): 4 sites, 40,574 keywords — 40,513 identical, 61 changed, 0 unexplained. All 61 were valued through another organization's organization-tier placement on Data Destruction, the cross-tenant defect the canonical model removes. Self-test: RED 1,820 unexplained with base points zeroed, GREEN 0.
- **D10 — How does a brand set a placement once for all its sites? (2026-09-14)** **DECIDED: natively, on the canonical model.** The brand owns the offering (D1) and each site owns its placement (D4); a brand-level default placement, if ever needed, is expressed on `web.brand_offering` and the canonical placement writer, never as a `brand` `scope_tier` row on `seo.keyword_topic`. **Reason:** a second ownership ladder over the old global table would re-create the model this cutover removes, and that table's unique key `uq_keyword_topic_scope` has no organization column (two organizations placing the same keyword on the same topic at the organization tier collide). The planned brand/organization rungs on `seo.keyword_topic` (register KI-050) are superseded; the never-applied `seo_ki050_placement_brand_org_rungs.sql` is not built on.

## 7a. Step 6 progress — live and ledgered 2026-09-14

| Migration | What it did | Proof |
|---|---|---|
| `brand_offerings_step6a_value_resolver.sql` | D9 reshape; 32 platform-authored templates seeded; transition reconcile (16 sites: 69 offerings adopted, 69 availability rows, 10,825 placements written, 655 cross-tenant/stale primaries demoted); `seo.keyword_value_map` on the canonical model (taxonomy still on the one ladder); the three database readers of the base step accept `kind: 'offering'`; `set_site_offering_value` in the D9 shape | equivalence above |
| `brand_offerings_step6b_canonical_placement_writer.sql` | `seo.write_site_keyword_offering` (THE placement writer, P12 in the database); legacy placement/worth RPCs also write canonically (TRANSITION) | 40,574/40,574 identical; catch-up reconcile 0 drift |
| `brand_offerings_step6c_canonical_worth_writer.sql` | `seo.write_site_offering_value` (THE worth writer) | 40,574/40,574 identical |
| `brand_offerings_step6d_client_doors.sql` | client doors + signed-in EXECUTE for the eight canonical reads/writes the client-grant guard had revoked | grants verified, anon denied |
| `brand_offerings_step6e_offering_filter.sql` | `filters.offering` / `p_sort 'offering'`; placement-source filter on the site's own rows; legacy confirm mirrors to the canonical row | 40,574/40,574 identical |
| `brand_offerings_step6f_confirm_proposals_drift.sql` | `seo.gsc_confirm_keyword_offering` (confirm writes only this site's placement and keeps the reason, P24, P12); `seo.gsc_offering_proposed_keywords`; `seo.gsc_offering_placement_drift` bounded by the writer's new `metadata.demoted` marker (D313) | 40,574/40,574 identical; drift read on All Green as admin under the 8 s budget with 2,000 planted AI moves (rolled back): 204 ms / 234 ms, the old read timed out at 8,168 ms |

| `brand_offerings_step6g_assigner_proposes_availability.sql` | D2 fix: `seo.fn_site_available_offering_for_template` (read only, never inserts) and `seo.propose_site_offering_from_template` (one pending `keyword_meaning:offering` approval per site and offering, keywords merged, never re-opened once ruled). aidream's assigner and valuer stopped calling `seo.fn_site_offering_for_topic`, which had adopted the offering and inserted `web.site_offering` silently. Approve adopts the template, places the carried keywords and sets worth through the human writers (`suggestions/apply.ts`). | Census before: 0 rows carried that helper's adoption marker, so nothing to undo. Rolled-back proof on Data Destruction: `created` (2 keywords) then `already_pending` (merged to 3, +120 points), 0 `site_offering` rows. aidream guard `test_unavailable_offering_is_proposed_never_placed_or_made_available`. |
| `brand_offerings_step6h_offerings_screen_doors.sql` | The Offerings screen's doors: `web.brand_offering_catalog` (brand-owned catalog with this site's availability, other-site count, template provenance, worth in points), `web.site_offering_availability_impact` (consequence preview), `web.set_site_offering_availability` (D2 availability writer, per item or bulk, reason kept), and `web.move_site_offering` now scoped to the brand's catalog (D3) with a cycle refusal. | Doors verified: authenticated EXECUTE, anon denied. |
| `brand_offerings_step6h1_availability_facts_first.sql` | Stopping removed facts after marking the availability row inactive; the fact-scope trigger refused the removal. Facts are removed first now. | Found by the rolled-back live proof; 0 real calls had been made. |
| `brand_offerings_step6h2_availability_round_trip_restores.sql` | Offering again restored 0 of 122 placement rows and dropped the expert's worth ruling: the removal stamp was written in two text forms of one moment and compared as text. One stamp, compared as timestamptz; counts are primary placements, matching the preview. | Live census before: 0 stamped rows, 0 inactive availability rows, so nothing to repair. Guard `pnpm check:offering-availability-round-trip:self-test`: RED restored 0/107 placements, worth gone, keyword negative → unvalued; GREEN 107/107, 122/122 rows, 5/5 points, note identical, keyword negative/0 again; residue 0. |
| `brand_offerings_step6h3_availability_keeps_the_why.sql` | A reason given for offering something the site already offers was silently dropped (Add offering adopts or creates first, then records the why). It is kept on the availability row with who and when; `changed` stays false (P24). | Rolled-back proof as admin@admin.com: `changed false`, `metadata.availability.reason` written, catalog read returns it. Round-trip guard re-run strict after the whole-body replace: all 8 checks OK, residue 0. |

Frontend on the canonical model: `e1dc2df2f8` (keyword workbench and keyword table Offering column, Search Console queries table, value workbench, ruling session, keyword dossier, both approval-queue placement kinds; `useSiteServices`, `scope-tiers` and `InheritedPlacementMarker` deleted), `981c89af11` (value receipts render the offering base step in points). Verified rendering on the local dev server as admin@admin.com for Data Destruction: 3,879 keywords with their offerings, the approvals console on All Green, and the receipt "IT Asset Disposition (ITAD) +100".

**Offerings screen — on the canonical model (2026-09-14).** `[brandKey]/identity/offerings` renders `features/marketing/seo/value-system/offerings/OfferingsWorkbench.tsx`: the brand's catalog (`web.brand_offering_catalog`) as a tree, explicit per-site availability with per-row switch and bulk select-all (stop previews its consequence and keeps the reason; offering again restores what stopping removed), Add offering through suggestions with copy-on-adopt or a custom offering from the typed text, worth in points through `seo.set_site_offering_value`, move and remove within the brand. `TopicTreeWorkbench`, its dialogs, `topics/lib.ts` and every legacy topic read/write in `topics/data.ts` (including the TRANSITION `setKeywordTopicPlacement`) are deleted. Verified rendering as admin@admin.com on the local dev server for Data Destruction (43 of 43 offered, 8 with worth, 2,373 keywords placed, inherited negative worth shown on 10 child offerings). Census `pnpm check:offering-topic-refs`: 100 references in 37 files (was 128 / 38), baseline tightened.

**Remaining for step 6, in order:**
1. Remaining readers: `run-console/data.ts`, `content-plan/data/service.ts`, `search-console/intake/intake-service.ts`, `admin/shared-knowledge/packs`, `topics/TopicPlacementStrip` + `topics/data.ts` `getTopicPlacementStatus` (`seo.topic_placement_status` joins `seo.keyword_topic` for proposals), saved `tp=` Search Console filter links, and the aidream topic readers (`seo_collections.py`, `system_task_runner.py`, `engine_schedule_dispatch.py`, `page_agents.py`, `keyword_agents.py`, `competitor_autopsy.py`).
2. Stop the legacy RPCs dual-writing once no reader remains; retire them.
3. A live placement and worth write through the UI on site `38eff4c9…`, reverted after and SQL-proven.
4. Step 8 retire (PITR first).

aidream `1e8ebde43`: the Topic Assigner and the site valuer write the canonical model through the service-role writers (binding proven live, rolled back). Guards: `check:offering-resolver-equivalence`, `check:offering-tenancy` (RED 4 crossing checks fail / GREEN 10 of 10), `check:offering-topic-refs` (shrink-only census, RED new 1 grew 1 / GREEN 0).

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
