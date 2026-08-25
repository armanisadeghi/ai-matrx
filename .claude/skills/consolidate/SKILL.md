---
name: consolidate
type: Skill
title: "consolidate — pull one node's meaning out of every repo and delete the source"
description: "Take ONE registry node (Domain, Feature, or Sub-feature) and end its documentation sprawl: census every repo, extract everything that carries MEANING into the node's doc kit in common-docs, and DELETE it from the repos it came from — proven by a re-grep, not asserted. Repo docs survive only as capped landmine files (imperative code-safety rules + one pointer). Use with /consolidate <node>, and ALWAYS before /take on a node that has never been consolidated. NOT the topic-cluster ceremony with an Arman interview (doc-convergence) and NOT the disagreement sweep (dedupe-and-verify)."
tags: [meta, docs-system, centralization, migration, deletion]
timestamp: 2026-08-25T00:00:00Z
---

<!-- SYNCED COPY — do not edit here.
     Canonical: common-docs/skills/consolidate/SKILL.md
     This file is distributed to every consuming repo by
     common-docs/meta/scripts/sync_skills.py. Edit the canonical, run the
     sync, and commit each repo. Edits made here are overwritten and lost. -->

# consolidate — one node, all repos, meaning centralized and the source annihilated

**Arman, 2026-08-25 (the ruling this skill exists to enforce):** *"Things are defined in too many
places… you can have a feature doc in AI Matrx focused on the UI aspects or the utilities and
hooks that live in that project, but the vision for what the system does absolutely should not
live there."* And on the failure of every prior sweep: *"something that I am certain we never did
in the past — enforce deleting that stuff from the other places, so we get things into only a
single place."* **Reporting what you moved is not the deliverable. Proving nothing was left
behind is.**

You are a documentation agent. **You do not write or fix product code this session.** A code
defect you notice goes on the node's HANDOFF follow-ups or becomes a `feedback` item — never
fixed inline, never silently dropped.

## Required reading — before touching anything

1. [`/policies/document-types.md`](/policies/document-types.md) — the type taxonomy, the
   authority ladder, and § FEATURE.md — per-repo LOCAL MECHANICS only.
2. [`/policies/feature-registry.md`](/policies/feature-registry.md) — the node system and the
   Centralization ruling.
3. [`skills/cross-repo-docs/SKILL.md`](/skills/cross-repo-docs/SKILL.md) — one truth, pointer
   lines, zero mirrors; the OKF format rules you must keep conformant.
4. [`/policies/unfinished-work-alarm.md`](/policies/unfinished-work-alarm.md) — **docs are the
   only thing you delete. Never a purpose-built code artifact.**

## Step 1 — Resolve the node, exactly

`/consolidate <name>`. Resolve it yourself, in this order:

1. **The DB registry** — `platform.taxonomy_node` in the one platform DB, addressed only by URL
   (`https://db.matrxserver.com`; never by project ref):
   `select slug, level, status, docs_path, parent_id from platform.taxonomy_node where slug ilike '%<name>%';`
   The DB wins over [`meta/registry.yaml`](/meta/registry.yaml) on any disagreement.
2. No `docs_path`? The node's home is `systems/<domain>/<feature>/` — create it.
3. No node at all? Insert one with `status='proposed'` (agents never flip status) and continue.
4. Two rows match and **neither is an exact slug match** → ask ONE closed question with your
   recommendation, then go. An exact slug match is never ambiguous — a near-miss sibling
   (`voice` vs `voice-calls`) is a seam you record, not a question you ask.

**Your lane is that node and its descendants.** A sub-feature of your node is yours. A sibling
node is NOT — you record the seam and leave it alone. Resolve the lane before the census so you
can say "out of scope" with authority instead of drifting.

**A Domain-level run owns its Features' docs too.** Each child Feature that carries real truth
gets its OWN home (`systems/<domain>/<feature>/STATE.md`) with its `docs_path` set — never one
giant domain STATE holding four features. **Size the run before you start:** a foundational node
can hit 200+ candidate files (`agent-tools` did). That is normal; it does not license a shallower
pass.

## Step 2 — Census every repo

Repos live as siblings: `aidream`, `matrx-frontend`, `matrx-extend`, `matrx-local`,
`matrx-sandbox`, `matrx-ship` (plus common-docs itself). Sweep **all of them** — a node you think
of as server-side has a frontend half, and that assumption is the exact failure this skill exists
to end.

Search each repo for the node's subject: its slug, display name, aliases, its component and table
names, its route segments, its package/service directory names. Cover at minimum:

- every `FEATURE.md` in or near the node's code
- `docs/**` (including `docs/handoffs/`, `docs/archive/` — archives are noted, not moved)
- package/service `README.md` and `CLAUDE.md` sections
- root-level stray `.md` files
- `.arman/`, `.research/`, `notes/` and similar informal lanes

Exclusions, absolute: `node_modules/`, `.venv/`, `.git/`, `matrx-frontend/type-errors/`, any
`.claude/worktrees/` (another agent's transient checkout), and **anything under
`common-docs/inbox/` — Arman's lane, never touched by an agent, ever.**

**Term greps under-catch. Also `ls -R` the node's own code and doc directories** — a file sitting
inside your own feature dir whose name shares none of your terms is exactly the one you will miss
(`scopeable_entities.md` was found only after the proof gate).

**Every IN-LANE file gets its own census row** — path, one-line subject, verdict. **OUT files are
grouped by justification class**, not enumerated: a foundational node's term sweep hits a tenth of
the repo, and 238 individual rows is noise that crowds out the work. Classes that recur:
neighbour-node doc · archive · generated file · repo skill · mention-only.

The four verdicts:

- **MEANING** — yours, moves to the kit, source deleted.
- **LANDMINE** — stays in the repo under the Step 3 cap.
- **SEAM** — real meaning that belongs to a NEIGHBOUR node. Never absorbed, never deleted, never
  rewritten. You record the seam and plant a pointer; fixing it is that node's run.
- **OUT** — mentions your node while being about something else; archives; generated output.

## Step 3 — The line: MEANING or LANDMINE

Read each censused file and cut it against ONE line. This is the whole skill; get it right.

**MEANING — belongs in common-docs, gets DELETED from the repo:**
what the thing is · what it does · who it is for · why it exists · how it is supposed to work ·
architecture narrative · vision and any Arman quote · decisions and their rationale · status,
roadmap, what is built and what is pending · plans and phases · cross-repo contracts (wire
formats, schemas, security posture, rendering contracts) · anything another repo's agent would
need to read.

**LANDMINE — may stay in the repo:**
an imperative rule tied to a code path that an agent editing *that directory* must obey, and
nothing else. *"This table has a trigger that silently swallows the write — go through
`save_run()`."* *"Never import this directly; use the barrel."* Plus file/path maps and local
commands for that one directory.

**The cap — a repo file may NOT contain, after your cut:** any sentence of "why", any product
description, any status or roadmap, any decision or its rationale, any vision or quote, any
cross-repo contract, any plan. If YOUR NODE's surviving content runs past ~80 lines, meaning
survived — cut again.

**The cap is scoped, in three ways.** It counts only *your node's* lines — a neighbour node's
meaning in the same file is left verbatim and recorded as a SEAM, so a legitimately co-hosted file
can finish well over 80 lines. It governs `FEATURE.md`-class docs, **not** a repo's or package's
`CLAUDE.md`/`AGENTS.md` (an agent rulebook of imperatives — plant the pointer, leave it standing).
And a survivor that was already pure landmine needs no surgery at all; the cap is a ceiling, not a
quota.

**Four file classes have fixed verdicts — do not re-litigate them:**

| Class | Verdict |
|---|---|
| **Generated** (`<!-- AUTO: -->` blocks, `*.generated.md`, `openapi.json`, `api-types.ts`) | Never edited, never deleted. Fix the generator or the source docstring; file the drift. |
| **Repo `SKILL.md`** | Procedure, not node truth. Leave it. Repoint its dead links; if its body is stale, flag it — rewriting it is not this run. |
| **Repo changelog inside a `FEATURE.md`** | The still-true FACTS migrate (to STATE, or as a landmine). The narrative stays in git. Never copy months of entries into STATE — that is the bloat this system exists to prevent. |
| **Bannered historical / archived doc in a live path** | Noted, not moved, not deleted. If it is genuinely load-bearing truth, that is a finding you report, not a file you quietly absorb. |

🚨 **The classification pressure runs one way.** Calling meaning "local mechanics" is how 148 fat
`FEATURE.md` files got there in the first place. **When a passage could be read either way, it is
MEANING.** A landmine is one or two imperative sentences; if it takes a paragraph to explain, the
explanation is meaning and belongs in the node's STATE.md with the imperative left behind.

## Step 4 — Extract into the node kit

The node's home holds the kit — [`cross-repo-docs`](/skills/cross-repo-docs/SKILL.md) governs it.
**Never create a doc that competes with a kit file** (a second STATE, a parallel "overview", a
`RULES.md` restating DECISIONS). Everything lands in one of these four:

- **`VISION.md`** — Arman's words. Every verbatim quote you found, deduplicated, grouped by
  theme, each with source path + date. **Never paraphrase, never blend quotes, never write a
  vision he did not say.** Inferences are marked `(inferred)`. A node with no Arman words says
  `VISION MISSING` — do not invent one. 🚨 **You never rewrite, trim, or "fix" existing VISION
  content** — you only merge new verbatim quotes into it.
- **`STATE.md`** — the ONE verified truth: what it is, verified current state, the pending list.
  Merge in place; never append addenda. Carries a verification-date line, a **Repositories table
  (repo | role)** naming every repo the node touches, and a changelog.
- **`DECISIONS.md`** — settled rulings with dates, so they are never re-asked.
- **`HANDOFF.md`** — forward work only, ≤150 lines, groomed not grown. **Re-verify every gap
  before you carry it forward** — the same evidence bar as a STATE claim. Wave 1 found several
  "open gaps" that had been closed for months. A stale to-do that outlives the work is the same
  disease in a different file.

**Satellites are allowed, narrowly** (the registry policy provides for them): a long verified
artifact that would swamp STATE if inlined — a wire contract, a schema reference, a fixture spec.
A satellite states a contract; it never states status, vision, or decisions. When in doubt it is
not a satellite, it is a STATE section.

**Meaning with no home yet is never deleted.** If a cut turns up cross-repo truth that belongs to
a neighbour node whose docs do not cover it, record it in YOUR STATE and plant a seam pointer in
the neighbour's. Destroying homeless truth is worse than the duplication you came to remove.

**Verify before you carry.** A doc's own "verified ✓" is not evidence; a code comment is not
evidence. Before a claim enters STATE.md, confirm it against live code or the live DB — the file
is wired, the route renders, the RPC exists, the rows are there. Claims that fail verification are
corrected, not copied. Anything genuinely unverifiable (needs a deploy, a paid run, a human login)
is marked **UNVERIFIABLE** with what would prove it — never guessed.

**Contradictions between two source docs are flagged, not resolved by vote.** Reality arbitrates
fact-vs-fact. Vision beats a doc. **Two conflicting Arman statements are never resolved by an
agent** — one row on [`operations/attention.md`](/operations/attention.md) with both statements,
sources, dates, and the consequence of each reading.

## Step 5 — Annihilate the source

This is the step every prior sweep skipped. Do it in the same session, before you report.

1. **A file that was pure MEANING is DELETED.** Not stubbed, not slimmed, not "kept for safety",
   not moved to an archive folder. `git rm` it. Git keeps the history; deleting is the success
   state. (Arman, 2026-08-25: *"These are documents that never should have existed."*)
2. **A file that mixed the two** is rewritten down to its landmines under the Step 3 cap, plus one
   pointer line. If nothing survives the cut, it is deleted too.
3. **The pointer line** goes where an agent working on that code will trip over it — the nearest
   surviving `FEATURE.md`, else the repo's `CLAUDE.md`. One line, no content restated:
   `Cross-repo system-of-record: /Users/armanisadeghi/code/common-docs/<path> — read it before touching this feature in ANY repo.`
   Deleting a whole tree without leaving a pointer somewhere an agent will hit is an unfinished
   job. **Never create a stub file whose only content is a pointer** — the pointer joins an
   existing doc.
4. **Repoint every inbound reference, in every repo**, before the deletion lands. `grep` all repos
   plus common-docs for the old path; a broken pointer is worse than the duplicate you removed.
   **A doc path inside a code comment, docstring, banner, or guard allowlist is documentation —
   repointing it is this session's work, not the code editing you are forbidden.** Change the
   string, never the behavior. Wave 1 repointed ~50 Python docstrings this way in one lane.
   Generated mirrors of those strings are left alone (fix the source, file the drift).
5. **Never delete code.** Not a script, not a fixture, not a test, not a config. Docs only.
6. **Never delete anything under `common-docs/inbox/`.**
7. **In-bundle overlap is merged, not annihilated.** A `projects/` campaign doc covering your node
   is a PLAN with no authority over node truth — you merge its truth, point it at your kit, and
   leave the campaign its own life. "Annihilate the source" governs REPO docs.

## Step 6 — THE PROOF GATE (a run without this did not happen)

Run all three checks after the deletions land. A broad re-grep alone is not a gate — in a mature
repo it returns hundreds of files and drowns the signal.

1. **The deleted-path grep.** For every path you deleted or renamed, grep every repo plus
   common-docs for that exact path. **This is the check that actually catches a missed reference,
   and it must come back empty** (historical prose in archives and `log.md` excepted — those
   correctly describe what was true then).
2. **The member re-check.** Re-run the census against your IN-LANE members only. Each survivor
   gets one line: landmine file · SEAM (neighbour's node) · generated · repo skill · archive ·
   code file. **If you cannot justify a survivor, it was not consolidated** — go back to Step 5.
3. **The broad sweep, grouped.** Re-run the wide term search and group what is left by
   justification class with counts — not one row per file.

**Count from git, never from memory:** `git diff --cached --name-status` and `git show --stat`.
Wave 1 had a run report "23 deleted" in four places before recounting to 22.

Report per repo: **files deleted (and the lines they took with them)** · files cut down
(`before → after`) · **inbound references repointed** · survivors by class. The deleted-line count
and the repoint count are the two numbers that prove the job finished; the earlier version of this
skill asked for neither.

**Scope note:** this gate sees the six sibling repos. Another checkout of the same repo elsewhere
on disk still holds the old copies — out of scope, but say so if you find one.

## Step 7 — Bookkeeping, then ship

- **Registry:** set `docs_path` if it was null; stamp the review —
  `update platform.taxonomy_node set last_reviewed_at = now(), review_notes = '<one line: consolidated, what moved>' where slug = '<slug>';`
  Mirror any new node into [`meta/registry.yaml`](/meta/registry.yaml). An unstamped run didn't happen.
- **Board:** add your node's row + result to [`operations/doc-migration.md`](/operations/doc-migration.md) Wave 3.
- **Bundle conformance:** every new/moved file gets frontmatter with a non-empty `type`, an entry
  in the affected `index.md`, and a `log.md` line under today's date. Run
  `python3 meta/scripts/okf_lint.py` — it must print CONFORMANT (exit 0) before you commit.
- **Board:** the consolidate runs have their OWN section on the board (§ Consolidate runs) with
  its own row numbering — Wave 3 is repo-scoped by construction and your run is node-scoped. Take
  the next unused number in that section; re-read it first, since a concurrent run may have taken
  one since you looked.
- **Ship — the shared-checkout protocol. Read this before your first `git` command.** Other
  agents are working these same trees right now, and **they will not follow your rules.** In wave
  1 every single run had work swept into an unrelated agent's commit.
  - **`git commit -- <pathspecs>`, always.** A bare `git commit` after `git add` commits the WHOLE
    index — including whatever another agent staged seconds ago. "Never `git add -A`" is not
    enough protection; this is.
  - **Stage nothing you are not committing right now.** A `git rm` or `git mv` left sitting staged
    is a race you lose — commit each one in the same breath.
  - **Verify, don't assume:** `git show --stat HEAD` after committing, and confirm your files are
    actually in YOUR commit. If another agent already swept them, the content is fine — say so in
    the report and move on. Never try to rewrite their commit.
  - **Push every touched repo.** Unpushed consolidation is lost, and the deletions are the half
    that matters.

## Step 8 — The report

1. **The node** — slug, level, home path, and the lane you drew (what was in, what was a seam).
2. **Census counts** — files found per repo, and the MEANING / LANDMINE / SEAM / OUT split.
3. **What moved** — into which kit file, with anything notable you verified or corrected.
4. **The proof gate** — the per-repo table from Step 6: deleted (+ lines removed), cut down
   (`before → after`), references repointed, survivors by class. State the deleted-path grep came
   back empty, or what it found.
5. **Flagged, not resolved** — contradictions, `VISION MISSING`, UNVERIFIABLE claims, attention-board
   rows filed, code defects spotted.
6. **Blockers and friction** — anything that stopped you, and anything in THIS SKILL that was
   ambiguous, missing, or wrong when you tried to follow it. Be blunt; the skill is being revised
   from these reports.

## Definition of done

- [ ] The node resolved against the DB and the lane stated before the census began.
- [ ] Every repo swept (term greps AND `ls -R` of the node's own dirs); every in-lane file has one
      of the four verdicts; OUT files grouped by class.
- [ ] All MEANING lives in the node kit; vision merged verbatim and attributed; claims verified
      against live code/DB, not copied on faith.
- [ ] Every pure-meaning source file DELETED; every mixed file cut under the cap; every inbound
      reference repointed; pointer lines planted in surviving repo docs.
- [ ] All three proof-gate checks ran after the deletions: the deleted-path grep came back empty,
      every in-lane survivor is justified, the broad sweep is grouped. Counts taken from git.
- [ ] Registry stamped, migration board row added, `okf_lint.py` CONFORMANT, every touched repo
      committed AND pushed.

# Changelog

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
