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

1. **The DB registry** — `platform.taxonomy_node` (Supabase project `brsgrqvjdzwihsvnfqkf`):
   `select slug, level, status, docs_path, parent_id from platform.taxonomy_node where slug ilike '%<name>%';`
   The DB wins over [`meta/registry.yaml`](/meta/registry.yaml) on any disagreement.
2. No `docs_path`? The node's home is `systems/<domain>/<feature>/` — create it.
3. No node at all? Insert one with `status='proposed'` (agents never flip status) and continue.
4. Two rows match, or the name is genuinely ambiguous → **ask ONE closed question with your
   recommendation, then go.** Never guess between two features.

**Your lane is that node and its descendants.** A sub-feature of your node is yours. A sibling
node is NOT — you record the seam and leave it alone. Resolve the lane before the census so you
can say "out of scope" with authority instead of drifting.

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

**Every discovered file gets a census row** — path, one-line subject, and its Step 3 verdict. An
undispositioned file is a defect in your work. A term hit is a *candidate*, not a member: a doc
that merely mentions your node while being about something else is OUT, recorded so the next
agent knows you saw it.

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
cross-repo contract, any plan. If what remains is over ~80 lines, meaning survived — cut again.

🚨 **The classification pressure runs one way.** Calling meaning "local mechanics" is how 148 fat
`FEATURE.md` files got there in the first place. **When a passage could be read either way, it is
MEANING.** A landmine is one or two imperative sentences; if it takes a paragraph to explain, the
explanation is meaning and belongs in the node's STATE.md with the imperative left behind.

## Step 4 — Extract into the node kit

The node's home holds a fixed kit — [`cross-repo-docs`](/skills/cross-repo-docs/SKILL.md) governs
it. **Do not create new parallel doc files**; everything lands in one of these:

- **`VISION.md`** — Arman's words. Every verbatim quote you found, deduplicated, grouped by
  theme, each with source path + date. **Never paraphrase, never blend quotes, never write a
  vision he did not say.** Inferences are marked `(inferred)`. A node with no Arman words says
  `VISION MISSING` — do not invent one. 🚨 **You never rewrite, trim, or "fix" existing VISION
  content** — you only merge new verbatim quotes into it.
- **`STATE.md`** — the ONE verified truth: what it is, verified current state, the pending list.
  Merge in place; never append addenda. Carries a verification-date line, a **Repositories table
  (repo | role)** naming every repo the node touches, and a changelog.
- **`DECISIONS.md`** — settled rulings with dates, so they are never re-asked.
- **`HANDOFF.md`** — forward work only, ≤150 lines, groomed not grown.

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
5. **Never delete code.** Not a script, not a fixture, not a test, not a config. Docs only.
6. **Never delete anything under `common-docs/inbox/`.**

## Step 6 — THE PROOF GATE (a run without this did not happen)

Re-run your Step 2 census searches against every repo, from scratch, after the deletions. For
every file that still matches, state in one line **why it legitimately survived** — landmine file,
out-of-scope neighbor, archive, code file, another node's doc.

Report the numbers, per repo: files deleted · files cut down (with `before → after` line counts) ·
files left standing and why. **If you cannot justify a survivor, it was not consolidated** — go
back to Step 5. A residue you chose to leave is a finding you report, never something you omit.

## Step 7 — Bookkeeping, then ship

- **Registry:** set `docs_path` if it was null; stamp the review —
  `update platform.taxonomy_node set last_reviewed_at = now(), review_notes = '<one line: consolidated, what moved>' where slug = '<slug>';`
  Mirror any new node into [`meta/registry.yaml`](/meta/registry.yaml). An unstamped run didn't happen.
- **Board:** add your node's row + result to [`operations/doc-migration.md`](/operations/doc-migration.md) Wave 3.
- **Bundle conformance:** every new/moved file gets frontmatter with a non-empty `type`, an entry
  in the affected `index.md`, and a `log.md` line under today's date. Run
  `python3 meta/scripts/okf_lint.py` — it must print CONFORMANT (exit 0) before you commit.
- **Ship:** commit in small pathspec-scoped batches — **shared checkout, never a blanket `git add
  -A`, never a tree-wide destructive git command** (other agents have dirty files here). **Push
  every touched repo.** Unpushed consolidation is lost, and the deletions are the half that
  matters.

## Step 8 — The report

1. **The node** — slug, level, home path, and the lane you drew (what was in, what was a seam).
2. **Census counts** — files found per repo, and the MEANING / LANDMINE / OUT split.
3. **What moved** — into which kit file, with anything notable you verified or corrected.
4. **The proof gate** — the per-repo table from Step 6: deleted, cut down (`before → after`),
   survived + why.
5. **Flagged, not resolved** — contradictions, `VISION MISSING`, UNVERIFIABLE claims, attention-board
   rows filed, code defects spotted.
6. **Blockers and friction** — anything that stopped you, and anything in THIS SKILL that was
   ambiguous, missing, or wrong when you tried to follow it. Be blunt; the skill is being revised
   from these reports.

## Definition of done

- [ ] The node resolved against the DB and the lane stated before the census began.
- [ ] Every repo swept; every discovered file has a verdict; no undispositioned files.
- [ ] All MEANING lives in the node kit; vision merged verbatim and attributed; claims verified
      against live code/DB, not copied on faith.
- [ ] Every pure-meaning source file DELETED; every mixed file cut under the cap; every inbound
      reference repointed; pointer lines planted in surviving repo docs.
- [ ] The proof gate ran after the deletions and every survivor is justified in one line.
- [ ] Registry stamped, migration board row added, `okf_lint.py` CONFORMANT, every touched repo
      committed AND pushed.

# Changelog

- 2026-08-25 — Created from Arman's centralization ruling: node-scoped extraction, the
  MEANING/LANDMINE line with the ambiguity-resolves-to-MEANING rule and the ~80-line cap,
  outright deletion of pure-meaning files, and the proof gate that makes deletion verifiable
  instead of asserted. Intended as the mandatory step before `/take` on an unconsolidated node.
