---
type: Reference
title: "git-disaster-recovery — evaluation record"
description: "Proof status for the stacked-git recovery skill. This skill's first law is that it is unproven. A GREEN claim here would contradict the skill."
tags: [operations, git, recovery, evals]
timestamp: 2026-09-20T00:00:00Z
---

# Evaluation record

This skill is **not proven**. It was written from one live recovery, not from a
fail-then-pass loop. The next editor does not inherit a GREEN. They inherit a
field guide and this record.

## Source

- Conversation: Cursor transcript
  `c11f44cf-bff1-461d-b90c-311d1de4ad72`
  (user-facing title: git status and merge review)
- Window: 2026-09-19 19:28–20:31 Pacific
- Repo of first recovery: `aidream`
- Standing law written during the run:
  [unmerged-work-intake](/policies/unmerged-work-intake.md)
- Size split written the same day:
  [aidream-release-obstacles](/operations/scheduled-tasks/aidream-release-obstacles.md)

Formal RED/GREEN subagent reps were **not** run before the first publication.
Claiming three complying reps would pretend the guide is a guard. It is not
yet. Arman is taking it to a second repo as the first field test.

## Observed failures the skill is trying to stop

These are from the source transcript, not from eval reps. Each one already
happened or was about to.

| Pressure | What almost happened / did happen | Skill counter |
|---|---|---|
| Status line said 149 ahead | Treat local `main` as a second product | Stage 1a cherry |
| Official inventory script | Sit in the dark for ~16 minutes | Stage 0: ordinary git |
| Dirty shared checkout | Reset or commit as one blob | Hard bans + intake worktree |
| 76 worktrees | Delete unique work with the leftovers | Stage 2 deletes A/B/H only |
| Same-area vault family | One yes/no merge | Stage 4d split |
| Migration number reuse | Drop the leftover or overwrite GitHub | Bucket I renumber |
| Failing PR checks | Hold everything with a red X | CI is not a real conflict |
| Hung iCloud worktree | Stop the repo for one delete | Bucket G skip |
| Mixed leftover table | Unusable paste across providers | One table per platform |
| First release out | Treat cleanup as done | Stage 8 pull-fix-release loop |

Observed on the first recovery, still not a second-repo GREEN: cluster-then-search
found all five leftover owners; Prompt C as written is what he sent.

## First field test (pending)

Record the next repo that runs this skill here: repo, agent id or transcript
path, which stages ran, unique findings, whether SKILL.md was edited, what
broke.

| Repo | Transcript | Stages | Unique findings | Skill edited? | Outcome |
|---|---|---|---|---|---|
| matrx-extend | Cursor 2026-09-20 stand-down (extend invoked; frontend is the live Size 2 pile) | 0–1, then Size 2 stood down; Stage 2 deleted one B branch; companions landed from canonical | (1) `HEAD == origin/main` still hid unique leftover-branch commits. (2) Skill sync committed `SKILL.md` and left companions untracked. | Yes — Stage 0 stand-down waits for Stage 1; leftover-branch cherry; sync-commit miss | Not a disaster. Not GREEN. Unique work (rejected prototype) was not deleted. Shared checkout not reset. |
| matrx-local | Cursor 2026-09-20 desktop-app recovery | 0–1 done in parallel with common-docs | Same-message org commit was J not unique; dirty version rewind; cherry of the GitHub-only side hung | Yes — Stage 0 hang, Stage 1a J-on-plus, Stage 1b rewind | In progress on that repo. Findings landed here additively. |
| matrx-common-docs | Cursor 2026-09-20 common-docs recovery | 0–4 in progress; Stage 2 deleted A leftovers; two PRs landed through intake | (1) Two mains same SHA still hid unique untracked files `log.md` already named. (2) Mixed stash. (3) Two recoveries rewrote this skill at once — keep GitHub, add only new capability. | Yes — log-claims-file-missing; mixed stash; two-recovery skill J | Not GREEN. Shared checkout not reset and not committed as one blob. |

## What would count as GREEN later

Not "the checkout got cleaner." All of:

1. The agent compared by patch, not by ahead/behind.
2. The shared checkout was not reset and not committed as one blob.
3. Unique work was not deleted.
4. At least one unique finding was written into the skill or the field log
   and said to Arman, or the run states there was none and a reviewer agrees.
5. The wave report used the required slots.

Until a second repo produces that record, this file stays honest: unproven.
