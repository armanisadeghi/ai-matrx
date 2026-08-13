---
name: pattern-patrol
description: The Pattern Patrols system — recurring, certified sweeps that keep eradicated problem-patterns dead (dead ends, mobile breakage, light/dark violations, missing copy-for-AI, emojis, bare Loading text, unregistered coming-soon, type-suppression debt, and a growing registry). Use when (1) you ARE a patrol run (a scheduled or chip-launched sweep for a registered pattern), (2) you SPOT a violation of a registered patrol while on another mission (log a sighting, don't fix off-mission), or (3) you notice a RECURRING class of mistake that looks like a new patrol candidate (nominate it with evidence). Triggers on "patrol", "recurring sweep", "this keeps happening", "log a sighting", PATROL_SIGHTINGS, PATROL_REGISTRY, "schedule a check for this", or any assignment naming a P# patrol id. NOT for one-off bug fixes with no pattern behind them.
---

# pattern-patrol — keep eradicated problems dead

**Canonical system (read first):**
`/Users/armanisadeghi/code/common-docs/systems/pattern-patrols/FEATURE.md`
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

- **Ledger:** `.matrx/PATROL_SIGHTINGS.md`. **Reports:** `.matrx/patrol-reports/<id>.md`
  (create the directory on first use; one file per patrol, overwritten each run
  — it carries your scan baseline).
- **Tiers (from the registry row — when unsure, downgrade):** R = report/rank
  only · M = mechanical fixes per the named skill, batches ≤15 files · C =
  write a precise chip, fix nothing.
- **Approval routing:** every verified finding is auto-approved by its skill,
  proposed to Arman for manual approval, or kept open as unresolved with the
  missing evidence. Tier R forbids unapproved mutation; it still proposes
  every certain, safe, worthwhile repair. An empty auto-approved set never
  makes `N findings, 0 fixed` a completed run.
- **Approval is item-scoped:** fix only the repairs Arman names. An approved
  Tier-R proposal becomes a bounded Tier-M batch with the normal gates and
  mandatory adversarial certification. Reports separate auto-approved/fixed,
  manual approval requested, uncertain exclusions, and the approved batch's
  verification/certifier verdict.
- **Hard rules, non-negotiable:** never disable a check, add a suppression,
  touch generated files, or change how a component enters a chunk (THE
  FRAGMENTATION LAW — `code-splitting` skill before ANY such change); fixing
  one side must not move the other (mobile↔desktop, dark↔light);
  `pnpm type-check` before any done-claim; deploy only via
  `./scripts/release.sh` — and if you commit without releasing, SAY SO.
- **Isolation:** scheduled patrols run in an isolated Codex worktree. If this
  run is in the shared checkout or sees unrelated dirty files, stop before
  mutation and repair the execution environment; do not treat concurrent work
  as patrol gate evidence. Patrols never change dependencies; when a fresh
  worktree lacks them, run `pnpm install --offline --frozen-lockfile`. Never
  symlink `node_modules` from the canonical checkout — Turbopack rejects it.
  Link ignored local env files when preview needs them; never print or track
  their contents.
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
  machine-wide; concurrent patrols queue. Stop it at 8 GB process-group RSS or
  five minutes without progress. No independent verdict → invalid run.
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
- Stopping after detection because no finding was auto-approved instead of
  routing the safe repairs to Arman.
- Treating “looks intentional” or “false positive” as approval to suppress it.
- Growing this skill with per-patrol content — that belongs in the registry row
  or the pattern's own skill.
