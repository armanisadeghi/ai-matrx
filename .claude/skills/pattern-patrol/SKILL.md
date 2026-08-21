---
name: pattern-patrol
description: The Pattern Patrols system — recurring, certified sweeps that keep eradicated problem-patterns dead (dead ends, mobile breakage, light/dark violations, missing copy-for-AI, emojis, bare Loading text, unregistered coming-soon, type-suppression debt, and a growing registry). Use when (1) you ARE a patrol run (a scheduled or chip-launched sweep for a registered pattern), (2) you SPOT a violation of a registered patrol while on another mission (log a sighting, don't fix off-mission), or (3) you notice a RECURRING class of mistake that looks like a new patrol candidate (nominate it with evidence). Triggers on "patrol", "recurring sweep", "this keeps happening", "log a sighting", PATROL_SIGHTINGS, PATROL_REGISTRY, "schedule a check for this", or any assignment naming a P# patrol id. NOT for one-off bug fixes with no pattern behind them.
---

# pattern-patrol — keep eradicated problems dead

**Canonical system (read first):**
`/Users/armanisadeghi/code/common-docs/systems/improvement/pattern-patrols/FEATURE.md`
**Arman's target:** `.../pattern-patrols/VISION.md`
**The patrol list + status:** `.../pattern-patrols/PATROL_REGISTRY.md`
This skill is the matrx-frontend mechanics. Never duplicate the registry here.

## The one-paragraph model

A _patrol_ is a named pattern Arman wants permanently eliminated (or a good
pattern he wants present everywhere), backed by five parts: doctrine, one-time
sweep, a skill teaching the fix, a **scheduled recurring run** (executed in
Codex on a several-day cadence), and **adversarial certification** of every
fix batch. Ten patrols are registered (P1 dead-ends … P10 type-suppressions);
the list is meant to reach fifty. Three duties below — you always have at least
the last two, whatever your mission.

## Duty 1 — running a patrol (you were launched as one)

Follow the per-run template in `CODEX_OPERATOR.md` (same directory as the
system doc). The repo-specific facts it needs:

- **Ledger:** `.matrx/PATROL_SIGHTINGS.md`. **Permanent run history:**
  `.matrx/patrol-runs/<P#>/<run-id>.json` (append only through
  `pnpm patrol:run`; `latest.json` is only a projection). **Reports:** `.matrx/patrol-reports/<id>.md`
  (create the directory on first use; one file per patrol, overwritten each run
  — it carries your scan baseline).
- **Resume before discovering:** inspect `latest.json` and its permanent record
  before a new scan. An unfinished approval, fix, certification,
  infrastructure retry, or delivery resumes with its exact candidate first.
  Never strand it, overwrite its report, or ask Arman to repeat a decision.
- **Tiers (from the registry row — when unsure, downgrade):** R = report/rank
  only · M = mechanical fixes per the named skill, batches ≤15 files · C =
  write a precise chip, fix nothing.
- **Professional improvement standing authority:** automatically fix a
  verified defect or weakness when one remedy is clearly superior, reuses a
  canonical primitive or demonstrated industry standard, preserves product
  behavior/contracts, and fits a bounded certified batch. The skill need not
  enumerate the exact callsite. Known bugs and established quality upgrades do
  not wait for permission.
- **Decision routing:** ask Arman only when legitimate alternatives materially
  change product behavior, policy, workflow, permissions, data meaning,
  destructive impact, or visual intent. Missing evidence/machinery creates a
  focused task or infrastructure state. If the core repair is clear and an
  optional enhancement is debatable, ship the core and ask only about the
  enhancement. Tier R never turns implementation uncertainty into a pointless
  approval request.
- **Human decisions are item-scoped:** when Arman chooses among legitimate
  alternatives, apply only that decision. The resulting repair still uses a
  bounded Tier-M batch with normal gates and adversarial certification. Reports
  separate standing-authority fixes, genuine human decisions, unresolved
  evidence/machinery, and the batch verification/certifier verdict.
- **Hard rules, non-negotiable:** never disable a check, add a suppression,
  touch generated files, or change how a component enters a chunk (THE
  FRAGMENTATION LAW — `code-splitting` skill before ANY such change); fixing
  one side must not move the other (mobile↔desktop, dark↔light);
  `pnpm type-check` before any done-claim. Commit every coherent batch
  immediately and push it to a remote ref within 15 minutes. After independent
  certification names the exact candidate SHA, integrate it through the normal
  fast `origin/main` workflow within 45 minutes. Only deployment/release stays
  serialized.
- **Isolation:** scheduled patrols run in an isolated Codex worktree. If this
  run is in the shared checkout or sees unrelated dirty files, stop before
  mutation and repair the execution environment; do not treat concurrent work
  as patrol gate evidence. Patrols never change dependencies; when a fresh
  worktree lacks them, run `pnpm install --offline --frozen-lockfile`. Never
  symlink `node_modules` from the canonical checkout — Turbopack rejects it.
  Link ignored local env files when preview needs them; never print or track
  their contents.
- **Exclusive preview lease:** `pnpm preview:start` may reuse only a server
  owned by this exact checkout. If another worktree owns the machine-wide slot,
  the command fails and this patrol queues; never certify against the other
  worktree's URL. `pnpm preview:status` reports the global owner, and only that
  checkout may stop it. Read the machine-profile RSS cap from launcher status;
  the five-minute startup-progress cap remains fixed. The launcher never
  restarts automatically.
- **Certification (Tier M):** a second adversarial agent ("assume this batch
  broke something; find it") compares pre-edit and post-edit type/gate
  diagnostics. New batch-caused failures reject; unchanged baseline debt is
  loud but cannot reject. Apply `FEATURE.md`'s risk-based visual proof: every
  changed file gets scoped static coverage, repeated mechanical edits get one
  representative surface per distinct risk class, and shared primitive/layout/
  interaction/theme changes get the full relevant matrix. CERTIFIED ships;
  REJECTED requires a concrete batch defect and is fixed/reverted;
  INFRASTRUCTURE BLOCKED preserves the approved diff for retry. A broken preview
  is never proof that product code broke. Only one managed preview runs
  machine-wide; concurrent patrols queue and never reuse a different
  worktree's build. No independent verdict → invalid run.
- **Fast integration, serialized release:** push the candidate immediately.
  After an independent certifier records `CERTIFIED` for the exact candidate
  SHA, integrate it into `origin/main` through the normal shared workflow;
  preserve that commit as an ancestor. The machine-wide lease applies only to
  `./scripts/release.sh`. If a newer release already contains the candidate,
  record that version instead of creating another bump.
- **Scoping:** structural novelty (new `app/**/page.tsx` leaves, new
  `features/*` dirs, new files matching the patrol's surface signature) + the
  ledger + a full pass every Nth run. NEVER scope by raw git churn.
- **Loud degradation:** if a Tier-M patrol is forced down to report-only, or a
  required read, scan, fix, certification, gate, release, report, or memory
  update does not happen, follow `FEATURE.md`'s exact Loud Degradation
  Contract. Begin with `AUTOMATION DEGRADED — ACTION REQUIRED`; when Arman must
  act, end with `ARMAN, WE NEED YOU: <one specific next action>.` Counts alone
  are never an adequate warning.
- **Human-owned exceptions:** agents may propose an exception but never clear,
  suppress, allowlist, or approve one. Every proposal stays an open finding,
  includes a production review URL, and ends with `EXCEPTION APPROVAL REQUIRED`
  plus `ARMAN, WE NEED YOU`. After explicit approval, record a durable approval
  id/reason/reference in the patrol's typed allowlist and beside the source;
  detectors report approved exceptions separately instead of hiding them.

## Duty 2 — logging a sighting (you're on another mission)

You spot a live violation of a registered patrol. **Do not fix it** (unless it
is literally inside the lines you're already changing — boy-scout rule). Add
one line to `.matrx/PATROL_SIGHTINGS.md`:

```
- [ ] P4 | features/foo/Bar.tsx:120 | bg-white with no dark: pair on the modal shell | 2026-08-08
```

…and continue your mission. The patrol verifies sightings itself; yours is a
hint, not a promise, so thirty seconds is the right amount of effort.

## Duty 3 — nominating a new patrol (the list must grow)

When a mistake you're fixing looks like a PATTERN — same class in a third
place, something Arman has ranted about, a check you wish existed — **stop and
tell him**: the pattern in one sentence, grep-level evidence with real counts
(run the greps; no vibes), proposed tier + cadence. On approval: add the
registry row (or Candidate-bench line), spin the sweep chip, and note which of
the five parts already exist. Promotion patterns (presence of something good —
copy-for-AI, assists, admin-map rows) qualify exactly like elimination
patterns.

## Anti-patterns

- Fixing sightings off-mission (derails sessions — the ledger exists so you don't).
- A patrol "improving" style beyond its registered pattern.
- Reporting a clean run as wasted effort — zero findings is the system working.
- Marking a registry status ✅ that isn't (the registry must never lie).
- Giving a polished normal-looking summary for a degraded or incomplete run.
- Rejecting or reverting valid work because an unrelated baseline gate or the
  preview harness failed.
- Reusing a preview from another worktree, leaving owned work uncommitted or
  unpushed, or delaying certified work behind a fictitious integration gate.
- Treating a Markdown report or automation memory as more authoritative than
  the permanent run record, or rewriting an earlier lifecycle event.
- Stopping after detection when a clearly superior bounded repair is known, or
  asking Arman to approve an obvious professional improvement.
- Treating “looks intentional” or “false positive” as approval to suppress it.
- Growing this skill with per-patrol content — that belongs in the registry row
  or the pattern's own skill.
