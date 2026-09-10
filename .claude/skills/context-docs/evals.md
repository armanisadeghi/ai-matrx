---
type: Reference
title: "context-docs — prove-it record"
description: "Regression record for the context-docs skill: scenarios, lanes, RED/GREEN results, trigger checks, and the structural decision they forced. Rerun before changing the skill."
tags: [meta, skills, evals, docs-system]
timestamp: 2026-09-10T00:00:00Z
---

# context-docs — prove-it record

## 2026-09-10 — consolidation of the aidream + matrx-frontend bodies into one canonical

**Change.** Two repo bodies (Rule 0, voice, never-lose-a-rule, checklist maintained separately) and a
workspace-root router → one canonical. Rule survival: a needle re-grep of every old rule line against
the canonical, 95/95 present; an independent zero-authorship audit classified every old rule.

**Lane for every run:** `standard` (opus), fresh subagent, zero authorship, dry run (proposed files
written to a scratch dir; repo checks run read-only).

### Round 1 — repo mechanics in a per-repo companion (`<repo>/.claude/context-docs.md`) — RED

| Repo | Scenario (real) | Outcome |
|---|---|---|
| aidream | Make the absolute `FILE_HANDLING_LAWS.md` pointer in `aidream/CLAUDE.md` relative | Invoked `aidream:context-docs`, ran `check_doc_links.py`. **Never opened the companion.** |
| matrx-frontend | Correct the pnpm / TypeScript floors in `CLAUDE.md` § Stack | Invoked `matrx-frontend:context-docs`, ran `check:doc-claims` — reached via `CLAUDE.md`, **never opened the companion.** |

Both read the skill body end to end and skipped the Step 1 pointer to a second file. The independent
audit added: a companion left untracked while the pointing `SKILL.md` was pushed strands an aidream-only
sandbox. **Decision (§3 form change, not more words):** per-repo mechanics became labeled blocks inside
the synced canonical; the companions were deleted.

### Round 2 — mechanics inline — GREEN (rules that live ONLY in the skill)

| Repo | Scenario (real) | Skill-only rule | Outcome |
|---|---|---|---|
| aidream | Collapse the duplicated handoff link in `.claude/skills/error-capture/SKILL.md` | `check_doc_links.py --all` for a repo-local skill | Invoked `aidream:context-docs`, ran `--all` (exit 0). **Pass.** |
| matrx-frontend | Retitle the H1 of `docs/official/browser-testing.md` | `pnpm check:docs-guards` after a retitle | Invoked `context-docs`, ran `check:docs-guards` (exit 0). **Pass.** |

### Independent audit (zero authorship)

- Round 1 audit: REOPEN — one weakened rule (Change Log required on any `FEATURE.md` edit), one false
  exemplar pointer, the sandbox gap, imprecise docs-guards wording, aidream's `check_docs_guards.py`
  missing, feature `README.md` trigger lost. All fixed.
- Scoped re-verify: every finding ADDRESSED, no rule weakened or dropped; REOPEN on one new false claim
  ("release-blocking" — `release.sh` only warns since 2026-08-18; the claim was copied from the script's
  own stale docstring). Fixed in the skill and at the source (docstring + `release.sh` comment).

### Trigger check (description rewritten)

| Prompt | Expected | Fired |
|---|---|---|
| Demote the "Nothing runs at commit time" bullet out of matrx-frontend `CLAUDE.md` | fire | `matrx-frontend:context-docs` — also planned `check:doc-claims --strict` |
| New aidream `FOUND_DEFECTS.md` entry | fire | `aidream:context-docs` — header `### AD227 —` from ledger max |
| Add a rule to the workspace-root `CLAUDE.md` | fire | `context-docs` |
| A `features/*/README.md` restating its `FEATURE.md` | fire | `matrx-frontend:context-docs` |
| Punchier hero copy on the marketing landing page | silent | `module-landing-pages` only |
| Where the token-broker contract doc lives | silent | `cross-repo-docs`, `token-broker`, `token-broker-client` |
| Docstring for `candidate_targets` in `check_doc_links.py` | silent | none |

No near-miss fired, so the description carries no `NOT for` clause.

### Rationalizations harvested

None — no run argued against a rule. Round 1's failure was silent omission of a pointer-followed file,
which is why the fix was structural.

### Class defect surfaced by the runs

`aidream/scripts/check_doc_links.py` never scanned `.claude/skills/`, so "every pointer resolves" was
unverifiable for a `SKILL.md`. `--all` now scans repo-local skills (synced copies are linted in
common-docs). Guard proof: a planted broken skill link exited 0 before the change, 1 after.
