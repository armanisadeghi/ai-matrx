# Pattern Patrol P1 — No dead ends

**Run:** 2026-08-12 (America/Los_Angeles)  
**Authority:** Tier M only for exact `EntityRef` swaps on registered tokens; Tier R for route, peek, identity, count, comparison, or behavior decisions
**Certification:** **REJECTED**; the four-file product batch was fully reverted and nothing shipped

## Outcome

- **6 verified findings** in the scoped mutation queue.
- **0 fixed.** The six-repair Tier-M batch passed its scoped static checks but failed mandatory independent certification and was fully reverted.
- Current full detector snapshot: **121 raw findings** (75 high, 46 medium) across 73 files: 68 bare ids, 39 unlinked names, 4 unlinked counts, and 10 files with no recognized door.
- Mutation is now **PAUSED** for P1. Two consecutive batches have been rejected; the next run is report-only until the shared preview is stable and the repository-wide type gate is green.

## Scope scanned

Scope followed the P1 structural-novelty recipe, not git churn:

- one new route leaf since the prior baseline, `app/page.tsx`, scanned clean;
- no new top-level feature directory and no new `EntityRef` importer at initial scoping;
- every ledger P1 note and checkbox (no open checkbox-form P1 sighting existed);
- the six previously verified registered-token candidates in four files;
- the existing full-pass detector snapshot was refreshed after the rejected batch was reverted.

This was not the fourth periodic run, so no new mandatory full manual triage was due. The scoreboard write is full-repo and remains the raw baseline.

## Verified Tier-M findings

The six detector rows were true positives after checking selection/injection rows, headings and prose, row-level sibling doors, ID fallbacks, and self-subject/detail-page cases:

1. `app/(admin)/administration/ai/ai-tasks/page.tsx` — bare task id.
2. `app/(admin)/administration/agents/agent-apps/analytics/page.tsx` — app name and slug.
3. `app/(admin)/administration/agents/agent-apps/executions/page.tsx` — bare task id.
4. `app/(core)/organizations/page.tsx` — organization name and slug.

Inventory confirmed that `task`, `app`, and `organization` have canonical `hrefFor` routes and registered peeks. The attempted repair reused the existing `EntityRef`; it created no primitive, route, peek, overlay, window, suppression, type widening, generated-file edit, or chunk boundary.

## Certification

### First certifier: REJECTED

The code correction passed static review: complete task IDs were preserved in `name`, link titles, peek labels, and new-tab labels while existing visual truncation remained. Scoped detector checks were 0/0 and doctrine, tsconfig, UI-primitives, and EntityRef tests passed. The certifier initially used the wrong browser-provider lookup, then its shared-Chrome session collided and hung.

### Fresh independent certifier: REJECTED

The fresh certifier acquired an isolated browser, logged in, and verified live analytics name/slug Open + Peek + New-tab doors. It also confirmed:

- all four scoped detector scans: clean;
- EntityRef tests: 5/5;
- doctrine and tsconfig: pass;
- UI primitives: exit 0 with the same 19 unrelated backlog warnings;
- no dynamic import, lazy boundary, suppression, or generated-file change.

The required complete desktop/mobile × light/dark matrix could not finish. The managed preview grew to approximately **23 GB RSS**, `.next-preview` grew to **15 GB**, the harness marked it **REAP: runaway memory**, and localhost stopped responding. The repository-wide `pnpm type-check` also became red on unrelated concurrent files requiring `organization_id`; none of the four patrol files appeared in those errors.

Per the Non-Breaking Constitution, the verdict is **REJECTED**. All four product files were restored byte-for-byte. Nothing committed from the patrol changes the product and nothing was released.

## Ledger and baseline

- No open P1 checkbox existed, so no checkbox changed.
- The prior keyword-performance and `assertFound` free-form notes remain resolved in current source.
- Current full snapshot: 121 findings, 75 high, 46 medium, 73 files.
- Finding-file SHA-256: `3c243e19a86a7cfdd8965b64213c9e6422e475dadd7b25d91952ab699f41f275`.
- Route leaves: 1,061 including dev variants; SHA-256 `a99b52673d5eacd5244080730b6b33a27de090386a587c51b1d90f5a8353becd`.
- Top-level feature directories: 123; SHA-256 `fd84400425fc09bb4bf7d82d7eeb74eaf71287cb3d44dfd7c01c69dd4514d780`.
- EntityRef importer files after full revert: 86; SHA-256 `9a655a4f254eb32ae089bcc981209f1e0403f1ac8e8a8b60f356de880b59770b`.
- Repository commit at final snapshot: `8e99fec9d6467b47b3e659f9f5a539860a41fff3`.

## Loop health and candidates

- Only two P1 reports/runs exist in the preceding month, so there is no all-clean streak and no longer-cadence proposal.
- Both attempted Tier-M batches were rejected. Mutation is paused; future P1 runs report and rank only until Arman clears the pause after preview stability and green global gates are demonstrated.
- No recurring unregistered pattern class was discovered; no Candidate-bench nomination was added.
- The cramped mobile admin execution/analytics layouts were visible during testing but pre-date this batch and are outside the P1 mechanical repair. They were not nominated as a new unregistered class because mobile layout is already registered under P3.

## Verification

- `pnpm check:dead-ends:write` — completed after full revert; scoreboard refreshed.
- Four scoped `pnpm check:dead-ends --path=...` runs — clean while the attempted batch was present.
- `pnpm check:doctrine` — pass.
- `pnpm check:tsconfig` — pass with existing notes only.
- `pnpm check:ui-primitives` — exit 0; 19 unrelated backlog warnings.
- EntityRef tests — 5/5 pass.
- Changed-file ESLint — existing effect errors and banned-icon warning only; no suppression added.
- `pnpm type-check` — passed once, then became red again due unrelated concurrent database-type work before certification completed.
- Product-file diff after revert — clean for all four attempted files.
- Certifier — **REJECTED**; complete visual matrix interrupted by runaway preview and global type gate not green.
