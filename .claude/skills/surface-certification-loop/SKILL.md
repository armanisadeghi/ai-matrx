---
name: surface-certification-loop
description: Coordinate an autonomous fleet that repairs and independently certifies registered UI surfaces with atomic Work Loop claims, durable checklist evidence, live desktop/mobile and light/dark proof, and rule-version rechecks. Use for pilot batches, recurring certification, repair rounds, or retroactive audits after the surface-check rules change. NOT for checking one already-assigned surface (use surface-check), or discovering unregistered surfaces (run a separate discovery lane).
---

# Surface Certification Loop

Read `../work-loop/SKILL.md`, then `../surface-check/SKILL.md` and its
`CHECKLIST.md`. Work Loop owns durable queue state and atomic claims;
`surface-check` owns one surface's repair and evidence protocol.

`CHECKLIST_VERSION = 2`

`SURFACE_CERTIFICATION_RULE_VERSION = 2026-08-30.1`

**Bump the rule version for every material acceptance-rule change.** A version
change creates recheck items for every previously certified surface whose
`last_check.ruleVersion` differs; it never rewrites old evidence or silently
grandfathers a page.

## Campaign contract

One campaign drains all registered, eligible ordinary product surfaces. One
work item is one surface and one rule version. Stable key:
`surface-certification:<surfaceName>:c<CHECKLIST_VERSION>:r<RULE_VERSION>`.
Re-adding the same key is idempotent; a bumped version deliberately creates new
work.

Every `surface-certification` item contains:

- exact `surfaceName`, route or `overlayId`, manifest path, and owning feature;
- checklist and rule versions, baseline commit, and prior `last_check`;
- stable key, priority, lease length, retry ceiling, and exact claim holder/time;
- representative real-data fixture/record and required access;
- required live matrix: desktop/mobile x light/dark, context menu, long-press,
  console, Error Inspector, loading/empty/error states;
- S1–S18 as required checks, expected durable evidence, and original user
  feedback/rule refs that caused a recheck;
- allowed ordinary reversible repair authority and the one named human-only
  boundary, if any.

Campaign defaults hold shared rules. Item contracts hold only target-specific
facts and exceptions. Never launch one schedule per surface.

## Coordinator cycle

1. Call `work_loop(action="status")`; database state is truth.
2. Atomically fill up to three worker slots with
   `work_loop(action="claim")`, using a unique stable holder per slot. Pass each
   claimed contract unchanged to its worker. Never select or lock work through
   `ui.ui_surface`, SQL, timestamps, a local list, or conversation memory.
   The Work Loop row's `claim_holder`, `claimed_at`, and `lease_expires_at` are
   the exact checkout audit trail.
3. **Serialize the live Browser lane.** The host has one machine-wide isolated
   in-app Browser. Claims, source audits, repairs, and tests may run in parallel,
   but the coordinator grants live Browser ownership to exactly one worker or
   verifier at a time. Everyone else stays in static/code work. The owner closes
   every tab and resets Browser state before handoff. Any viewport/theme/menu
   evidence captured while another pilot worker owned or used the Browser is
   invalid and must be rerun. This makes the existing no-shared-browser rule
   operational; it does not reduce Work Loop claim concurrency.
4. Heartbeat active claims before half the lease elapses. Ownership loss stops
   writes immediately.
5. Settle each worker through `complete`, `retry`, or `defer`, then refill the
   slot. `complete` means a full candidate; it is not certification.
6. Let the service create an independent verifier. A passed verifier promotes
   the durable `ui.ui_surface.last_check`; rejection creates repair work at a
   higher priority than untouched backlog. Claim a known verifier or repair
   follow-up with its exact `canonical_key`, then assert the returned key and
   role before dispatch. Queue priority is ordering, never identity. If either
   value differs, release the accidental claim without doing work and repair
   the coordinator contract before proceeding.
7. Continue while claimable work exists. Report pilot/review batches from
   durable state, never from agent recollection.

## Settlement rules

- **Complete:** every S1–S18 result is `pass`/`fixed`/`na`, checklist and rule
  versions match, all four fresh live viewport/theme proofs exist, console and
  Error Inspector are clean, and evidence refs are durable. Submit
  `candidate-pass`; do not write final certification.
- **Retry:** a routine obstacle, failed check, unavailable isolated Browser,
  missing live proof, stale base commit, lost claim, or verifier rejection.
  Record the failed section, root cause, completed repairs, and exact next
  action. Repeated retry must fix or escalate the failure class; it must not
  replay the same attempt indefinitely. At the item's retry ceiling, persist a
  visible failed state with the last evidence; do not reset attempts or quietly
  return it to untouched backlog.
- **Defer:** only the item contract's one named human-only boundary. Persist the
  requested decision/action, evidence already gathered, and resume condition;
  park the item and continue the campaign. Authentication, fixtures, tooling,
  tests, preview state, and ordinary product judgment are not human boundaries.
- **Repair:** verifier rejection or a later rule change creates a new atomic
  item tied to the original surface, certification, evidence, and failed
  sections. The repair worker fixes the class and reruns the entire live matrix;
  it never patches only the screenshot the reviewer happened to notice.

## Independent verifier

The verifier did not build the change. It opens a fresh isolated Browser
session, loads the current commit and real target data, assumes the candidate is
wrong, and reruns the full live matrix plus the sections most affected by the
diff. Worker screenshots are leads, not proof. The verifier returns only:

- `passed` with its own durable evidence, verifier identity, timestamp,
  checklist version, rule version, and commit; or
- `rejected` with failed section(s), exact reproduction, and durable evidence.

Only `passed` may write final `result: "pass"` and `last_checked_at`. A worker,
static check, deferred visual, incomplete theme/viewport matrix, old rule
version, or manufactured fixture can never certify a surface.

## Rule updates and retroactive rechecks

When Arman identifies a missed requirement:

1. update the owning skill/checklist and bump
   `SURFACE_CERTIFICATION_RULE_VERSION` in the same change;
2. preserve the feedback as a concise rule reference in new item contracts;
3. compare every active eligible `ui.ui_surface.last_check` with the current
   checklist/rule versions and required evidence keys;
4. enqueue every mismatch with a stable key for the new version, prioritizing
   surfaces certified after the earliest affected rule/evidence date;
5. independently verify each repaired page before promotion.

Never mutate a prior certification to look current. The old record is evidence
of what was proved under the old contract; the new item is the audit trail.

## Discovery is a separate lane

Certification covers registered surfaces only. A separate
`surface-discovery` task compares route, overlay, window-panel, and manifest
inventories and emits candidate registration work. It never inserts discovered
pages directly into an active pilot and never shares a claim with certification.
After registration is independently verified, add the new surface through
`work_loop(action="add_items")` at the current rule version.

## Pilot gate

Before unattended operation, choose five eligible surfaces that differ in
feature owner, interaction model, route/overlay form, data shape, and mobile
behavior. Run them in parallel through worker plus independent verifier. Present
only verifier-passed review routes and their durable checklist summaries to
Arman. Feedback updates the rule version and triggers retroactive rechecks; the
recurring coordinator proceeds only after all five are human-confirmed.
