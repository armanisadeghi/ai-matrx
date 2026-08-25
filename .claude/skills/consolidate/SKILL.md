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
inside your own feature dir whose name shares none of your terms is exactly the one you will miss.

🚨 **Read every file over ~200 lines in your lane, whatever its name suggests.** Wave 2 listed a
513-line `README.md`, skipped it as boilerplate, and discovered at the proof gate that it was the
node's ONLY vision document. `README.md`, `GOAL.md`, `notes.md` — size decides, not the filename.

**Every IN-LANE file gets its own census row** — path, one-line subject, verdict. **OUT files are
grouped by justification class**, not enumerated: a foundational node's term sweep hits a tenth of
the repo, and 238 individual rows is noise that crowds out the work. Classes that recur:
neighbour-node doc · archive · generated file · repo skill · mention-only.

The four verdicts:

- **MEANING** — yours, moves to the kit, source deleted.
- **LANDMINE** — stays in the repo under the Step 3 cap.
- **SEAM** — real meaning that belongs to a NEIGHBOUR node. Never absorbed, never deleted, never
  rewritten. You record the seam and plant a pointer; fixing it is that node's run.
  🚨 **SEAM beats MEANING.** A neighbour's content is left standing however meaning-shaped it is.
  Destroying homeless truth is a worse error than the duplication you came to remove.
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

**The cap counts NON-IMPERATIVE lines only. Imperatives and file maps are uncapped.** A file that
finishes at 111 lines because 68 of them are pure "never do X, use Y" invariants has PASSED — cutting
a real code-safety rule to hit a number is the worst outcome this skill can produce. The number is a
smell threshold for prose, not a budget for guards.

It is scoped three further ways. It counts only *your node's* lines — a neighbour's meaning in the
same file is left verbatim as a SEAM. It governs `FEATURE.md`-class docs, **not** a repo's or
package's `CLAUDE.md`/`AGENTS.md` (an agent rulebook — plant the pointer, leave it standing). And a
survivor that arrived pure needs no surgery at all.

**A landmine may carry the minimum of its own "why".** The ban is on restating the product story,
not on the one clause that makes a trap comprehensible — *"`p_user_id` must never be inserted
directly (it bypasses the RLS check)"* is a landmine, not meaning. A guard nobody understands gets
"cleaned up" by the next agent.

**Four file classes have fixed verdicts — do not re-litigate them:**

| Class | Verdict |
|---|---|
| **Generated** (`<!-- AUTO: -->` blocks, `*.generated.md`, `openapi.json`, `api-types.ts`) | Never edited, never deleted. Fix the generator or the source docstring; file the drift. |
| **Repo `SKILL.md`** | Procedure, not node truth. Leave it. Repoint its dead links; if its body is stale, flag it — rewriting it is not this run. |
| **Repo changelog inside a `FEATURE.md`** | The still-true FACTS migrate (to STATE, or as a landmine). The narrative stays in git. Never copy months of entries into STATE — that is the bloat this system exists to prevent. |
| **Archived doc under `docs/archive/**`** | Noted, not moved, not deleted. |
| **Bannered "STALE"/"SUPERSEDED" doc in a LIVE path** | Extract anything still true, then DELETE. A banner is not a home — leaving 4,000 lines of contradicted spec in a live directory is the disease, not the cure. |
| **CODE ARTIFACT — a `.md` that code reads or a guard scans** | Never absorbed, never deleted, whatever it contains. Confirm by grepping the repo's `.py`/`.ts`/scripts for its filename before you touch it. (Wave 2: 11 `ner_*.md` files are the declared source of truth for agent slots and a guard script scans them — deleting them would have broken the guard.) |
| **PUBLISHED PAYLOAD — shipped inside a package tarball** (a `README.md`/`CHANGELOG.md` listed in `package.json` `files:`) | Never deleted; it is a public artifact. Plant the pointer, leave it. |
| **A repo's working-backlog lane** (`.research/`, `.matrx/`, `FOUND_DEFECTS.md`, task registers) | Left standing, recorded as survivors. A register that cites a doc you deleted gets a one-line annotation, not a rewrite. |
| **A PROTECTED lane — `common-docs/inbox/` and any repo's `.arman/`** | 🚨 **Never deleted, never edited, never "tidied" — no exceptions, whatever it looks like.** And never called a duplicate without a byte-level diff: **the protected copy is frequently the fuller ORIGINAL**, and the repo copy the trimmed derivative. Wave 2 nearly deleted a folder literally named `junk/` on the assumption it duplicated deleted repo docs — a diff showed the protected copies were LONGER, carried a whole route-architecture section the repo copies had dropped, and two files had no repo twin at all. **Diff first, report second, delete never.** |

🚨 **The classification pressure runs one way.** Calling meaning "local mechanics" is how 148 fat
`FEATURE.md` files got there in the first place. **When a passage could be read either way, it is
MEANING.** A landmine is one or two imperative sentences; if it takes a paragraph to explain, the
explanation is meaning and belongs in the node's STATE.md with the imperative left behind.

## Step 3.5 — Provenance: whose document is this? (the step that decides who wins)

Before you merge anything, establish who WROTE each source. This decides every conflict downstream,
and getting it wrong is how the platform's worst drift happened.

**Arman's documents are the bible.** His design records, his rulings, his vision — those state how
the system is SUPPOSED to work. Everything else is a report on how some agent believed it worked on
some day.

🚨 **THE DISEASE, in his words (2026-08-25):** *"agents tend to not use my documents, and they tend
to use the wrong ones… the ones that are agent authored feel easier to follow and usually include
the shortcuts and will affirm what you see in the code, because some agent made a stupid mistake and
then justified their stupid mistake by creating a document that backs it up — but it'll be totally
contrary to my rules."*

**The canonical example — read it before you rule on any conflict:**
[`/systems/workflows/dynamic-agent-graph-design-v2.md`](/systems/workflows/dynamic-agent-graph-design-v2.md)
— 1,371 lines of his architecture session stating exactly how workflows and Masterwork should work.
Things were then built in both systems directly contrary to it and nobody noticed. Note the
structural trap: that document is typed `Reference`, one of ~188 undifferentiated `Reference` docs,
so the type-based authority ladder ranks his bible BELOW any agent-written `State` doc.
**Type is not provenance. Check provenance.**

**How to read provenance when nothing declares it:**

| Signal | Reading |
|---|---|
| `authority: owner` in frontmatter | Settled — his. Highest authority, whatever its `type`. |
| First-person design reasoning, spoken cadence, verbatim quotes, an "Arman said/ruled" attribution with a date | Probably his → **nominate it** (below). |
| Reads as a tidy summary, has "Status: ✅ shipped" tables, agent changelogs, or restates the code back to you | Agent-authored. Useful, never authoritative. |
| Git author | **Useless here** — every commit in every repo is authored as Arman, including agents'. Do not use it. |

**You may NEVER set `authority: owner` yourself.** When you believe a document is his, you
**nominate** it: report it in Step 8 with its path and one line of evidence, and file one
attention-board row asking him to confirm. Marking your own writing as his authority is the
single worst thing you can do to this corpus — an agent already fabricated a `VISION.md` of
invented quotes this way.

**Dates arbitrate only between documents of EQUAL provenance.** A newer agent doc NEVER outranks an
older owner doc — recency is not authority. Between two agent docs, the newer wins on fact and the
older is corrected. Between two owner docs, you do not rule at all (see Step 3.6).

## Step 3.6 — Conflicts: resolve what you can, escalate what you cannot

**Resolve yourself, and say what you did:**

- **Fact vs fact** → reality arbitrates. Query the live DB, read the live code, check the deployed
  state. The doc that loses is corrected with the evidence in its changelog.
- **Stale vs current at equal provenance** → the verified-against-reality one wins.
- **Vocabulary drift** → [`/systems/platform/vocabulary/FEATURE.md`](/systems/platform/vocabulary/FEATURE.md) wins, always.
- **An owner doc's claim about BUILD STATE being out of date** → correct the build state; his
  intent is untouched. His docs go stale on facts like any other; they never go stale on intent.

🚨 **Escalate, and do NOT resolve:**

- **An owner document vs the code.** THE CODE IS THE DEFECT — never "fix" his doc to match what got
  built, and never record the code's behavior as the design. Write both readings into `DECISIONS.md`
  as an open conflict, file the attention-board row, and leave his document untouched.
- **Owner doc vs owner doc** — two of his statements that genuinely disagree. Never resolved by an
  agent, ever.
- **An agent doc that contradicts an owner doc and matches the code.** This is the disease above,
  not evidence. The agent doc is deleted or corrected; what it justified goes on the board.
- **Interpretation vs interpretation** — nobody disputes the measurements, two docs read them
  differently. Record both readings, decide neither.

**The escalation must be one he can act on cold** — a row on
[`operations/attention.md`](/operations/attention.md), guided-session shaped: plain-language
background in two or three sentences with no jargon or doc numbering, **a clickable path to the
document**, the two readings side by side, **the concrete consequence of each**, and your
recommendation. A question he cannot answer from what you gave him is a defect in your question,
not a hard question. Batch them; never page him one at a time.

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
- **`HANDOFF.md`** — forward work only, groomed not grown. **The test is "no closed items and no
  restated STATE", not a line count** — compressing a true backlog into 150 lines by writing dense
  prose trades readability for a number. **Re-verify every gap
  before you carry it forward** — the same evidence bar as a STATE claim. Wave 1 found several
  "open gaps" that had been closed for months. A stale to-do that outlives the work is the same
  disease in a different file.

**Satellites are allowed** (the registry policy provides for them): a long verified artifact that
would swamp STATE if inlined — a wire contract, a schema reference, a capability inventory, a
fixture spec. A satellite states a contract or an inventory; it never states status, vision, or
decisions. **A foundational node legitimately needs several** — nine satellites is the honest shape
of a node with nine contracts, and jamming 4,000 lines into STATE.md to avoid them is the failure,
not the discipline. There is no line ceiling on a satellite that is genuinely de-duplicated; the
test is whether every section is load-bearing and stated once.

**Before you finalise the kit, `git status` the bundle for files a CONCURRENT run just created.**
Consolidate runs overlap: wave 2 had two runs independently write satellites covering the same
contract. The proof gate cannot catch this — it greps for what you deleted, never for what a
sibling just wrote. Found one? Cut yours to a pointer.

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

🚨 **MOVE, NEVER COPY. One file at a time, write + delete in ONE commit.**

This is the ordering law, and it exists because breaking it corrupted the corpus. A run that
writes the kit first and defers the deletions to "later in Step 5" has, at every moment until it
finishes, **created the exact duplication this skill removes** — and if it dies there (API limit,
crash, interruption), it leaves the corpus WORSE than it found it. That is not hypothetical: a
batch-3 run died mid-flight having added 8 satellites (2,771 lines) with zero deletions, and every
one of those files then existed in two places.

So the unit of work is ONE file, moved:

1. write the kit file (or merge the content into an existing kit file)
2. `git rm` the source
3. repoint that file's inbound references
4. **commit all three together** — `git commit -m "<msg>" -- <kit path> <source path> <ref paths>`

Then the next file. **At no point may a file exist in both places across a commit boundary.**
Interrupt the run at any moment and the corpus is consistent: some files moved, the rest untouched.
Never batch the writes and then batch the deletions.

This is the step every prior sweep skipped. Do it in the same session, before you report.

1. **A file that was pure MEANING is DELETED.** Not stubbed, not slimmed, not "kept for safety",
   not moved to an archive folder. `git rm` it. Git keeps the history; deleting is the success
   state. (Arman, 2026-08-25: *"These are documents that never should have existed."*)

   🚨 **`git rm` ALWAYS stages. Commit it in the SAME command — never `git rm` and keep working.**
   `git rm <paths> && git commit -m "<msg>" -- <paths>`. This is not bookkeeping you can defer to
   Step 7; by the time you reach Step 7 the deletion has been exposed for twenty minutes. The
   failure is not hypothetical: in wave 2 a staged deletion was swept into an unrelated agent's
   commit about API authorization, a third agent saw doc deletions inside an API commit, reasonably
   concluded they were collateral damage, and committed *"restore unrelated documentation"* —
   **putting every deleted file back.** A swept deletion does not just lose provenance; it looks
   like a mistake to the next agent and gets reverted.
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

**Count from git, never from memory** — two wave runs published a wrong count in four places
before recounting. But **`git show --stat` on your own SHA under-reports**, because your deletions
may sit in another agent's commit. The reliable method is per-file:
`git log --diff-filter=D --name-only <baseline>..HEAD -- '*.md'`.

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
- **Board:** add your row to § Consolidate runs on
  [`operations/doc-migration.md`](/operations/doc-migration.md). **Key the row by your NODE SLUG,
  never by an integer** — concurrent runs claimed the number 66 twice in wave 2 and concatenated
  one row onto another. Re-reading the section first does not prevent that race; a slug key does.
- **Ship — the shared-checkout protocol. Read this before your first `git` command.** Dozens of
  other sessions work these same trees, and **they will not follow your rules.** Every run in both
  waves had work swept into an unrelated agent's commit. Know exactly what the protocol does and
  does not buy you:
  - **`git commit -m "<msg>" -- <pathspecs>`, always.** Note the order: `-m` BEFORE `--`. Git
    parses everything after `--` as pathspecs, so `git commit -- <paths> -m "msg"` fails with
    *"pathspec '-m' did not match any file(s)"*. For a multi-line message use `-F <file>`.
  - **What it protects, honestly:** it stops YOU committing another agent's staged work. It does
    **nothing** to stop another agent's bare `git commit` from vacuuming up yours. There is no
    command that prevents that — only committing fast enough that the window never opens.
  - **Edit-and-commit in one breath, per unit of work.** Anything staged, and anything merely
    edited, is exposed until committed.
  - **Enumerate the paths you touched AS you touch them.** Never build a pathspec list from
    `git status` — in a busy tree that list is full of other agents' work, and you will sweep
    THEIR files into YOUR commit (wave 2 did exactly this).
  - **zsh does not word-split unquoted variables.** `git commit -- $PATHS` sends one giant
    pathspec and fails, sometimes silently. Pass paths literally or use an array.
  - **Verify, never assume:** `git show --stat HEAD` after committing, and re-check the remote SHA
    before believing a push error — a `cannot lock ref` failure in a busy tree often means your
    commit already landed via someone else's push. If your files were swept, the content is fine:
    say so in the report and move on. **Never rewrite another agent's commit.**
  - **Push every touched repo.** Unpushed consolidation is lost, and the deletions are the half
    that matters.
- **The scratchpad is NOT isolated.** Four wave-2 runs had working files overwritten mid-run by
  other sessions — one had three registry `UPDATE`s silently execute someone else's script and
  report success. Give every scratch file a unique name, never share a scratch path with a
  subagent, and **read back anything you write to the DB** (`RETURNING`, or a follow-up `select`).
  An unexpected output shape is a FAILED WRITE, not a formatting quirk.
- **Verify your bookkeeping landed with `git diff --stat` — `okf_lint.py` passing proves nothing
  about whether your edits exist.** A wave-2 heredoc died on an encoding error and the chained
  lint still printed CONFORMANT over a board row and log line that had never been written.
- **If you delegate a lane to a subagent, verify its commits landed yourself.** One wave-2
  subagent did its work correctly and ended with everything staged and uncommitted.

## Step 8 — The report

1. **The node** — slug, level, home path, and the lane you drew (what was in, what was a seam).
2. **Census counts** — files found per repo, and the MEANING / LANDMINE / SEAM / OUT split.
3. **What moved** — into which kit file, with anything notable you verified or corrected.
4. **The proof gate** — the per-repo table from Step 6: deleted (+ lines removed), cut down
   (`before → after`), references repointed, survivors by class. State the deleted-path grep came
   back empty, or what it found.
5. **Flagged, not resolved** — contradictions, `VISION MISSING`, UNVERIFIABLE claims, attention-board
   rows filed, code defects spotted.

   🚨 **These three go at the TOP of your report, each with a clickable path — never buried at the
   end, never summarised away:**
   - **Owner-doc conflicts** — anything built or written contrary to one of Arman's documents.
   - **Claims that were WRONG** — a doc that sent agents at a dead table, a fictional contract, a
     "shipped" that isn't, a "pending" that is. Say what was wrong, what is true, and how you
     proved it. You will find these constantly; they are the most valuable thing you produce.
   - **Anything found in a PROTECTED lane** (`inbox/`, a repo `.arman/`) — reported with its path
     and your byte-level comparison, for HIM to decide. You touched nothing.
6. **Nominated as owner-authored** — documents you believe are Arman's, each with path and one line
   of evidence, so he can confirm and they can be marked `authority: owner`.
7. **Blockers and friction** — anything that stopped you, and anything in THIS SKILL that was
   ambiguous, missing, or wrong when you tried to follow it. Be blunt; the skill is being revised
   from these reports.

## Definition of done

- [ ] The node resolved against the DB and the lane stated before the census began.
- [ ] Every repo swept (term greps AND `ls -R` of the node's own dirs); every in-lane file has one
      of the four verdicts; OUT files grouped by class.
- [ ] All MEANING lives in the node kit; vision merged verbatim and attributed; claims verified
      against live code/DB, not copied on faith.
- [ ] **Provenance established for every source before merging.** No agent doc was allowed to
      outrank an owner doc; no owner doc was edited to match the code; every owner-vs-code and
      owner-vs-owner conflict is on the attention board with a clickable path and both readings.
- [ ] Nothing in a protected lane was deleted or edited; anything found there is reported with a
      byte-level comparison.
- [ ] Every pure-meaning source file DELETED; every mixed file cut under the cap; every inbound
      reference repointed; pointer lines planted in surviving repo docs.
- [ ] All three proof-gate checks ran after the deletions: the deleted-path grep came back empty,
      every in-lane survivor is justified, the broad sweep is grouped. Counts taken from git.
- [ ] Registry stamped, migration board row added, `okf_lint.py` CONFORMANT, every touched repo
      committed AND pushed.

# Changelog

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
