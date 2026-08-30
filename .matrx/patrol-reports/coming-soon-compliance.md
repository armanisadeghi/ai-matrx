# P9 — Coming-soon compliance patrol

**Run:** 2026-08-30
**Run ID:** `01a05301-8fab-7d50-87f1-ea38599319d4`
**Mode:** ACTIVE · ERADICATION · canonical shared checkout
**Baseline:** `857dcd2c3b7bed591441c6a175caf72eb1397ec4`
**Certified candidate inspected:** `8f0041cebc3d8e3a05520bfdb5e7629c514dfebc`
**Current outcome:** Batch 1 **CERTIFIED**; Batch 2 **INFRASTRUCTURE BLOCKED** for delivery only.

## Scope scanned

- Full AST detector pass over the manifest-owned runtime roots: **12,851 files**.
- Registry grew from **81 to 84** entries.
- Current exact detector baseline: **101 repair-now**, **112 review**, **0 unknown literal ids**, and **5 dynamic ids**.
- The exact unresolved item set is reproducible from preserved candidate `8f0041cebc` with `pnpm check:coming-soon -- --json`; preservation ref: `refs/heads/patrol-runs/P9/01a05301-8fab-7d50-87f1-ea38599319d4-batch2-candidate`.
- The first retained path and eight disjoint next paths were rendered-context triaged. Comment-only bake-off examples were removed from the actionable route; reachable shared-child promises were repaired.

## Routed report

### Auto-fixed now — 5 verified cases

1. `components/official/AdvancedMenu.tsx` and its official-component display: generic disabled items keep their disabled behavior but now say **Unavailable**, not **Soon**.
2. `app/(core)/images/generate/GenerateShellClient.tsx`: removed unreachable false capability promises and replaced the reachable 404 “next wave” claim with honest temporary-unavailability copy; live generation behavior is unchanged.
3. `/files/activity`: registered `files.activity-feed` and rendered its canonical label, promise, and `planned` stage.
4. `/files/requests`: registered `files.file-requests` and rendered its canonical label, promise, and `planned` stage.
5. `/files/starred`: registered `files.starred-items` and rendered its canonical label, promise, and `planned` stage.

The Files repair also taught `lib/route-manifest/generate.ts` that a `PageShell` carrying a literal `promiseKey` is a placeholder while an ordinary `PageShell` remains live.

### Manual approval requested — 2 genuine product choices

1. `features/image-studio/modes/edit/EditAiToolbar.tsx:347` — the success toast promises a future one-click suggestion apply action. Safe choices: register and route `image-studio.apply-suggestion`, or build the apply action. **Arman must choose the intended post-suggestion interaction.**
2. `features/whatsapp-clone/chat-view/MessageInputAttachMenu.tsx:62` — Camera attachment emits a bare promise. Safe choices: register and route `whatsapp.camera-attachment`, or retire the demo action. **Arman must decide whether this clone action is supported.**

No exception was proposed, approved, suppressed, or allowlisted.

### Backlog retained — exact detector baseline

- **101 repair-now items** remain after the five repairs; the next wave starts at `app/(core)/agents/new/page.tsx:21:7`.
- **112 review items** remain for rendered-context or false-positive triage.
- The detector's exact file/line/column/kind/text records are the authoritative backlog at preserved candidate `8f0041cebc`; this run does not collapse them back into the former 101-file heuristic queue.
- The two manual choices above remain separate from this missing-evidence backlog.

## Certification and gates

- `pnpm test:coming-soon`: **5 suites / 9 tests PASS**.
- `pnpm type-check`: **PASS** before and after.
- `pnpm check:patrol-contracts`: **PASS**.
- Scoped diff check: **PASS**.
- Batch 1 adversarial verdict (`/root/p9_repair_certifier`): **CERTIFIED**. AdvancedMenu interaction proof confirms disabled state + Unavailable copy + no promise; image-generation control flow is behavior-preserving.
- Batch 2 adversarial verdict (`/root/p9_certifier_retry`): **INFRASTRUCTURE BLOCKED**, with **no batch-caused behavioral defect**. Desktop renders registry truth; mobile stays on its byte-unchanged pre-existing `MobileStack` path.
- Scoped lint reports only unchanged baseline errors in `AdvancedMenu.tsx` and `PageShell.tsx`; they do not reject either batch.
- In-app Browser control was unavailable, so the committed rendered-component interaction tests are the bounded stable evidence. No user browser was used.

## Infrastructure blocker

`pnpm check:route-manifest --strict` reports **177** lockfile drifts: **174 unrelated existing drifts plus the three truthful Files placeholder classifications**. P9 is forbidden to edit generated files, so the valid batch is preserved at `refs/heads/patrol-runs/P9/01a05301-8fab-7d50-87f1-ea38599319d4-batch2-candidate` and was not reverted. An authorized route-manifest owner must regenerate and certify the lockfile before this batch can be released. No redundant release was created.

## Escaped-delivery reconciliation

The 2026-08-29 record now truthfully ends `reconciled` with 14 append-only events. Original candidate `5bf578b45e084d57beeeb6eb5198f58a90bd9c0d` remains recorded as shipped in `v0.4.561`, then interaction-tested and **REJECTED** for concrete false-promise defects. Certified replacement `e8ea694e74a39b7a1d7253737a62278d00196e3d` remains recorded as shipped in `v0.4.1442`. The typed reconciliation names exact escaped-event hash `02a03d932cfe99defb68c523659d6a4e5b75823401bc57d4a2c0280d6493392b`; no history was erased and no redundant release was made.

## Cadence health and candidates

The preceding month is not all clean, so no longer cadence is proposed. One earlier concrete rejection was repaired; this run's infrastructure block does not count as a rejection, so mutation is not paused. No recurring unregistered class met the evidence threshold for a Candidate-bench nomination.
