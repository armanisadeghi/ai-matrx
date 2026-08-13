# Pattern Patrol P1 — No dead ends

**Run:** 2026-08-12 (America/Los_Angeles)
**Authority:** Tier M for the six previously approved registered-token `EntityRef` repairs; Tier R for all other findings
**Certification:** **CERTIFIED** under the corrected batch-delta policy

## Outcome

- **6 verified findings; 6 fixed** across four files.
- The batch adds canonical Open, New tab, and Peek doors to two task IDs, one app name, one app slug, one organization name, and one organization slug.
- Current full detector snapshot: **102 raw findings** (71 high, 31 medium) across 63 files: 51 bare IDs, 36 unlinked names, 4 unlinked counts, and 11 door-less files.
- The prior report's mutation pause was based on infrastructure/global-baseline rejection criteria that were removed in common-docs `2509c74` and frontend `64c99e708`; P1 is not paused.

## Scope scanned

Scope followed the P1 structural-novelty recipe rather than git churn:

- current route-leaf and top-level feature-directory inventories;
- every P1 ledger item (none was open before this recovery);
- the six previously verified candidates in four recorded files;
- one full scoreboard refresh after the certified batch.

This recovery did not expand into the remaining report-only backlog. The full detector snapshot changed from the historical 121-row report to 102 rows; only the six rows named below are attributed to this batch because other source changes landed between snapshots.

## Fixed Tier-M findings

The six rows remained true positives after rechecking selection/injection rows, headings and prose, row-level sibling doors, ID fallbacks, and self-subject/detail-page cases:

1. `app/(admin)/administration/ai/ai-tasks/page.tsx` — bare task ID.
2. `app/(admin)/administration/agents/agent-apps/analytics/page.tsx` — app name and slug.
3. `app/(admin)/administration/agents/agent-apps/executions/page.tsx` — bare task ID.
4. `app/(core)/organizations/page.tsx` — organization name and slug.

Inventory confirmed that `task`, `app`, and `organization` all have canonical `hrefFor` routes and registered peeks. The repair reuses `EntityRef`; it adds no primitive, route, peek, overlay, window, suppression, generated-file edit, or chunk boundary.

## Certification

### Adversarial finding and repair

The independent certifier found one concrete batch-caused defect: the first draft replaced the analytics `<h4>` and organization `<h3>` with top-level `<span>`-based EntityRefs, removing heading semantics. The final batch restores the original heading wrappers around the EntityRefs.

### Final verdict: CERTIFIED

Baseline-to-post evidence:

- `pnpm type-check`: 0 → 0.
- doctrine: 0 → 0.
- tsconfig: 0 → 0 with the same two inert include notes.
- UI primitives: 0 → 0 with the same 19 advisory warnings.
- EntityRef tests: 5/5 → 5/5 with the same pre-existing mock warning.
- scoped ESLint: the same three pre-existing effect errors and `Sparkles` warning; the bare-task-ID warning was removed.
- scoped P1 detector rows: **1/2/1/2 → 0/0/0/0**.
- `git diff --check`: clean.

The managed preview was stopped at the fleet's 8 GB safety threshold while an unrelated browser session compiled `/marketing/content-plan`, before a P1 route rendered. Under the corrected bounded-fallback rule, focused rendered-markup proof covered both distinct risks:

- table ID: visible text remains `12345678...`, the href contains the full task ID, and Open/Quick look/New tab titles and ARIA labels retain the full ID;
- card name/slug: original heading semantics remain, both labels resolve to the canonical app route, and both expose Open/Quick look/New tab.

Surrounding responsive/theme classes and the already-tested EntityRef primitive are unchanged. The certifier found no remaining concrete batch-caused defect and returned **CERTIFIED**.

## Ledger and new baseline

- A checked P1 recovery outcome was added to `.matrx/PATROL_SIGHTINGS.md`; there are no open P1 sightings from this batch.
- Current full snapshot: 102 findings, 71 high, 31 medium, 63 files.
- Finding-file list: 63 entries; SHA-256 `efb6df1628971d773111fc18f7be6e1505b4f6d212eeae29b0dc335dd67c9275`.
- Route-leaf list (`page.tsx` and `page.dev.tsx`): 1,001 entries; SHA-256 `9456c397c6fa4258192d6e02350fde5bdbabfa4ecc06962e7924c09434cb0ebf`.
- Top-level feature-directory list: 121 entries; SHA-256 `b6bcb08ef4a4e924023386a8e9717df23fd0daac1add8e845e78bc4826115467`.
- EntityRef importer list: 183 entries; SHA-256 `e2354e93f21dab63d3d2fb6abcc0cff3b4fff3abcc79f003cf1bc8ec038a1fae`.
- Certified batch commit: `893fd01b5bbce53fd13c432496f365dac8ef8476`; integration base refreshed through `effc858f9b55e5c70abf8f1b2a445d3cb9444f35` before final snapshot.

## Loop health and candidates

- The preceding month does not contain an all-clean P1 run streak, so no longer cadence is proposed.
- The earlier two infrastructure-driven rejections are invalid under the corrected policy; repeated product-batch rejection is not present, so mutation is not paused.
- No recurring unregistered class was discovered; no Candidate-bench nomination was added.

## Delivery state

- Certified batch `893fd01b5` was integrated as `2881a9660` and is an ancestor of release commit `9419ff9bd`.
- Shipped in **v0.4.550**. Vercel production deployment `dpl_C9bwWNG9fJZqdhzpwnnbFQF61c45` built commit `9419ff9` and reached **READY** on 2026-08-12 (America/Los_Angeles).
