---
type: Reference
title: "consolidate — changelog"
description: "Version history (v1 to v5) of the consolidate skill and the wave evidence behind each rule, read when revising the skill or tracing why a rule exists. Companion to the consolidate skill."
tags: [consolidate, skills, history]
timestamp: 2026-09-10T00:00:00Z
---

# consolidate — changelog

- 2026-08-25 (v5 — the ordering law, learned from a crash). **MOVE, NEVER COPY.** The unit of work
  is ONE file: write the kit entry, `git rm` the source, repoint its references, and commit all
  three together, then move to the next. Previously the skill let a run write the kit and defer the
  deletions, which means that for the whole middle of a run the corpus holds BOTH copies — and a run
  killed there leaves it worse than it found it. A batch-3 run died exactly there, adding 8
  satellites (2,771 lines) with zero deletions and duplicating all 8 against live repo sources. The
  new rule makes every crash point safe: interrupt at any moment and some files are moved, the rest
  untouched, none duplicated.
- 2026-08-25 (v4 — Arman's provenance ruling; the corpus-level fix). **Provenance now outranks
  type**, in this skill (new Steps 3.5/3.6) and in the ladder itself
  ([`document-types.md` Rung 0](/policies/document-types.md)). His documents are the bible whatever
  their `type:` — the trigger was his own 1,371-line agent-graph-v2 design record being typed
  `Reference`, so the type ladder ranked it below any agent's `State` doc while work got built
  contrary to it. Adds: the named disease (an agent justifies its mistake with a doc that reads
  easier than his, matches the code, and contradicts his rules — that is drift, not truth); dates
  arbitrate only at equal provenance; the resolve-vs-escalate split (reality arbitrates fact-vs-fact;
  owner-doc-vs-code means the CODE is the defect and his doc is never edited to match it; owner-vs-owner
  and interpretation-vs-interpretation are never agent-resolved); escalation shaped as a
  guided attention-board row with a clickable path, both readings, and each one's consequence;
  `authority: owner` as the marker with agents NOMINATING only; owner-conflicts, wrong-claims, and
  protected-lane finds reported at the TOP with links, never buried; and protected lanes
  (`inbox/`, any repo `.arman/`) never deleted or edited AND never called duplicates without a
  byte-level diff — wave 2 nearly deleted a `junk/` folder whose protected copies turned out to be
  the FULLER originals.
- 2026-08-25 (v3, revised from wave-2 evidence — 5 more parallel runs; both waves together deleted
  201 repo docs and 62,836 lines, measured from git). Fixes: **`git commit -m "msg" -- <paths>`** —
  v2's own mandated syntax was broken (git parses everything after `--` as pathspecs) and two runs
  hit it; the deletion-commit imperative moved INTO Step 5, because a staged deletion swept into an
  unrelated commit got REVERTED by a third agent as apparent collateral damage; an honest statement
  of what the pathspec protocol does and does not protect (it stops you committing others' work, not
  others committing yours); enumerate paths as you touch them (never from `git status`); zsh
  word-splitting; count deletions with `git log --diff-filter=D`, since `git show --stat` on your
  own SHA under-reports when you have been swept; the scratchpad documented as contended, with
  read-back-your-DB-writes; bookkeeping verified with `git diff --stat` because a passing lint
  proves nothing; **the cap now counts non-imperative lines only** (a survivor that is 68 lines of
  guards has PASSED — four runs hit this); a landmine may carry the minimum of its own why; **SEAM
  beats MEANING**; two new fixed verdicts — **CODE ARTIFACT** (a `.md` that code reads or a guard
  scans; a literal v2 reading would have broken a guard script) and **PUBLISHED PAYLOAD** (shipped
  in an npm tarball); working-backlog lanes ruled, with a repo `.arman/` protected exactly like
  `inbox/`; bannered-STALE-in-a-live-path now extract-and-delete, distinguished from
  `docs/archive/`; satellites plural for foundational nodes, plus a check for a CONCURRENT run
  writing the same satellite; read every file over ~200 lines whatever its name (a 513-line README
  turned out to be a node's only vision doc); HANDOFF judged by content not line count; board rows
  keyed by node slug after two runs claimed the same integer; proof-gate exception for the kit's own
  required provenance lines.
- 2026-08-25 (v2, revised from wave-1 evidence — 5 parallel runs, 70 repo docs deleted, ~20,400
  lines removed). Every change below fixes something at least two runs hit independently:
  satellites permitted (the old text contradicted the registry policy and would have forced a
  415-line wire contract into STATE); the shared-checkout git protocol (`git commit -- <paths>`,
  stage-nothing, verify-it-landed — all five runs had work swept into other agents' commits);
  the proof gate rebuilt around the deleted-path grep + per-member re-check + grouped sweep, with
  deleted-line and repoint counts; the line cap scoped to your node's content and exempted for
  `CLAUDE.md`-class rulebooks; SEAM named as a fourth verdict; fixed verdicts for generated files,
  repo skills, repo changelogs, and bannered historical docs; comment/docstring repointing ruled
  documentation rather than code; homeless truth protected; Domain runs give child Features their
  own homes; `ls -R` added to the census; the DB addressed by URL rather than project ref
  (the v1 text violated standing doctrine on its first instruction); board rows moved to their own
  section; counts taken from git, not memory.
- 2026-08-25 — Created from Arman's centralization ruling: node-scoped extraction, the
  MEANING/LANDMINE line with the ambiguity-resolves-to-MEANING rule and the ~80-line cap,
  outright deletion of pure-meaning files, and the proof gate that makes deletion verifiable
  instead of asserted. Intended as the mandatory step before `/take` on an unconsolidated node.
