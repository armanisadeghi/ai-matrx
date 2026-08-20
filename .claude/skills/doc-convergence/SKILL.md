---
name: doc-convergence
type: Skill
title: doc-convergence — converge a feature cluster's docs into one verified set
description: Converge one feature cluster's sprawling documentation into a single verified, build-ready set. Use whenever Arman names features or topics — not necessarily documents — and wants their docs merged, verified, and condensed. Triggers on "/doc-convergence <topics>", "converge the X docs", "consolidate everything about X", "merge the X and Y documentation", "where are we really on X". First step is always a scope confirmation with Arman (he often does not know all the documents); then an autonomous census + code-verification + convergence; then a turnover with a URL tour of the built features and a batched interview that empties the question ledger. NOT for grooming a single handoff (handoffs skill) or the periodic rot sweep (handoff-cleanup).
---

<!-- SYNCED COPY — do not edit here.
     Canonical: common-docs/skills/doc-convergence/SKILL.md
     This file is distributed to every consuming repo by
     common-docs/meta/scripts/sync_skills.py. Edit the canonical, run the
     sync, and commit each repo. Edits made here are overwritten and lost. -->

# doc-convergence — one cluster, one verified truth

A feature cluster's documentation grows past what anyone can hold: overlapping handoffs,
satellite docs, duplicated claims, stale "done" lists, questions scattered across a dozen files.
This skill converges it into **one small, TRUE set** in which done work is code-confirmed and
removed, pending work is code-confirmed pending, Arman's vision is merged verbatim in one place,
every open question sits in one ledger — and then **the ledger gets emptied by interviewing him**
before turnover.

You are a documentation-and-verification agent for the middle phases. **You do not build or fix
code this session.** A defect with a known fix gets spun off as a background chip/session; an
uncertain one goes on the converged pending list. Never fixed inline, never silently dropped.

**The format exemplar is the first run's output:**
`common-docs/projects/content-engine/STATE.md`. Match its structure and bar — identity, merged
verbatim vision, verified state, grouped pending list, question ledger, boundary map, census.

## Required reading — before touching anything

1. `/Users/armanisadeghi/code/common-docs/skills/handoffs/SKILL.md` — the handoff format you
   converge toward: identity block, verbatim vision, the tail law, delete-when-done.
2. `/Users/armanisadeghi/code/common-docs/skills/handoff-cleanup/SKILL.md` — the verification
   verdicts (DONE / ACTIVE-rotted / VISION MISSING / DRIFT-intentional / DRIFT-unclear) and the
   register-reconciliation rules. This skill runs a scoped, deeper version of that sweep.
3. `/Users/armanisadeghi/code/common-docs/skills/cross-repo-docs/SKILL.md` +
   `/Users/armanisadeghi/code/common-docs/policies/document-types.md` — where converged docs live.
4. `/Users/armanisadeghi/code/common-docs/operations/unassigned-handoffs.md` — the register. Its
   rows are the staffing interface; you update links, never delete rows.
5. `/Users/armanisadeghi/code/common-docs/policies/unfinished-work-alarm.md` — never recommend
   deleting purpose-built CODE artifacts; docs are the only thing you delete.
6. `/Users/armanisadeghi/code/common-docs/systems/vocabulary/FEATURE.md` — canonical names only.

## Phase 0 — Scope confirmation with Arman (interactive, fast, ALWAYS first)

Arman names topics or features, not documents — assume his list is incomplete. Before any deep
work:

1. **Quick sweep** (minutes, not an audit): matching rows in the unassigned-handoffs register;
   grep the cluster's topic terms across `common-docs/` (systems, projects, operations),
   `matrx-frontend/docs/`, `aidream/docs/`, and any other repo the topics implicate; follow the
   first ring of links from what you find.
2. **Propose the scope in ONE message**: the anchor entries (register rows or master docs), the
   IN-scope list, the BOUNDARY list (systems touched only at the seam where their data enters
   this cluster), and the OUT list — each with a one-line reason. Where you are genuinely unsure
   which side of the boundary something falls on, ask as a closed choice with your
   recommendation first (AskUserQuestion fits; batch everything into one round).
3. **Wait for his yes / corrections.** Only then go autonomous. Do not make him wait while you
   run a full census first — this confirmation is cheap and prevents converging the wrong scope.

Record the confirmed scope at the top of your working notes; it becomes the census's law.

## Phase 1 — Census: every related document, dispositioned

From the confirmed anchors, follow **every** link transitively (`vision:` frontmatter, sibling
pointers, attached-work tables, named `FEATURE.md`s, project dirs). Then sweep independently —
grep the topic terms again, wider. Links alone are not a search; a grep alone is not a search.

Every discovered doc gets a census row: path, one-line subject, disposition —

- **CORE** — in scope; merged into the converged set or kept as code-side truth.
- **SEAM** — boundary; record the seam + pointer, never absorb.
- **OUT** — out of scope; listed so the next agent knows you saw it, untouched.

An undispositioned doc is a defect in your work. Watch for **name collisions** (the first run
found two docs whose "content" and "plan node" meant different systems) — a topic-term hit is a
candidate, not a member.

## Phase 2 — Verification: the doc set is presumed to be lying

Fan out parallel Explore subagents against reality — live code on `origin/main` in every cluster
repo, and the live DB via the Supabase MCP (project `brsgrqvjdzwihsvnfqkf`) for table/RPC/row
claims. Rules of evidence:

- **A code comment is not evidence. A doc's own "verified ✓" is not evidence.** Verify artifacts
  and behavior: the file is wired, the RPC is live, the route renders, the rows exist.
- **Claimed DONE → quick confirmation.** One targeted probe per claim. Confirmed → it leaves
  every work list, surviving as at most one line pointing at the code. Not confirmed → NOT done;
  back to pending with what is actually missing.
- **Claimed PENDING → prove it is still pending.** Search for evidence it shipped: code,
  `FEATURE.md` change logs, `git log`, applied migrations, live DB state. Shipped → record where
  and remove it. Pending → onto the converged list, independently actionable, with paths and
  traps. Where the claim is half-wrong, say what is *narrower* than written (the first run found
  "no producer" claims where the producer existed and only the runner was missing).
- **Drift:** classify per handoff-cleanup. **Never resolve unclear drift by assuming the code is
  right** — vision wins by default; unclear cases become ledger questions with both sides stated.
- Anything genuinely unverifiable (needs a deploy, a paid run, a human login, a real mouse) is
  flagged **UNVERIFIABLE** and becomes a "only you can test" ledger item — never guessed.

## Phase 3 — Convergence: produce the set

Two structures are law: the register's rows (each staffed Feature/Program keeps its own handoff —
the row's link target) and the handoffs-skill format. Within that:

1. **One cluster STATE doc** — placement per the Feature Registry (ruled 2026-08-20): the
   owning node's home per `common-docs/meta/registry.yaml` (target shape
   `systems/<domain>/<feature>/STATE.md`; a genuinely cross-feature cluster converges in its
   `projects/<slug>/` campaign dir with a `touches:` list). **STATE.md now ABSORBS any
   in-bundle `systems/*/FEATURE.md` for the same node** — merge it in and delete the
   FEATURE.md with a repointed trail; never leave two docs both claiming verified truth.
   Update the registry (`docs:` path, `status`) in the same session. Structure per the
   exemplar:
   - **Identity** — the cluster in one sentence, its staffed parts, the pipeline in one line,
     and the facts that keep getting re-derived wrong.
   - **Vision — Arman's words, merged.** Every verbatim quote from every CORE doc, deduplicated,
     grouped by theme, each with source + date. **Never paraphrase, never blend quotes.**
     Indirect-speech rulings are marked as such; inferences marked `(inferred)`; a part with no
     Arman words says `VISION MISSING`. Include a "settled — never re-ask" table.
   - **Verified current state** — built and confirmed, one line + code pointer each.
   - **The pending list** — code-confirmed remaining work, grouped by owning register row so
     staffing still works, ordered, each item independently actionable.
   - **Question ledger** — every open Arman decision, merged, deduplicated, dead questions
     removed with the answer recorded. Filter by THE ROUTING RULE: only questions needing Arman
     PERSONALLY (product ruling, naming, money, an account only he holds, his own review/test);
     everything a competent engineer could decide from code + doctrine is ordinary pending work.
   - **Boundary map** — the seams, one line each on what crosses.
   - **Census** — the Phase 1 table.
2. **Slim each anchor handoff** to the handoffs format: identity block, its slice of the pending
   list, resources, pointer to the STATE doc. Target ≤150 lines. Preserve sister/attachment
   pointers.
3. **Delete superseded satellite docs — in EVERY cluster repo.** Cross-repo deletion is in this
   skill's mandate (the first run wrongly held back 13 superseded files in another repo). Git
   keeps history; deleting is the success state. Before each deletion, grep all repos +
   common-docs for inbound references and repoint every one. Docs other features still need get
   a pointer stub per cross-repo-docs; pure duplication is deleted outright.
4. **Fix stale claims in the system-of-record `FEATURE.md`s** you verified against (with
   change-log lines), per the context-docs discipline.

## Phase 4 — Register + hygiene + ship

- **Register:** never delete a row (you are consolidating, not taking the build work). Update a
  row's link if its handoff moved; move Features → Tails only under the tail law; Notes stays one
  sentence; add `VISION MISSING` where true.
- **Conformance:** new/moved common-docs files get frontmatter, an `index.md` entry, and a
  `log.md` line; `python3 meta/scripts/okf_lint.py` must not add violations.
- **Ship:** commit in small pathspec-scoped batches (shared checkout — never blanket adds, never
  destructive tree-wide git) and **push every touched repo**. Unpushed convergence is lost.
- **Spin off repairs:** each concrete, sessionable defect found during verification becomes a
  background chip/session with a self-contained prompt (the first run did this for the frozen
  loops and a committed `.venv` — that is the standard).

## Phase 5 — Turnover: the tour, then the interview. NOT optional.

The convergence is not done when the docs are written. It is done when Arman has seen the
important things and **no unknown remains unaddressed**.

### 5a. The tour — exact URLs

Give Arman a short ordered list (most important first) of **exact, clickable URLs** where he can
see the cluster's most important built features working. Production URLs by default; a localhost
route only when the surface is unshipped, with the one command to run it. Each row: the URL, one
line on what he will see, and any state needed to see it meaningfully (which site/record to pick,
login surface, a row that must exist). Include the UNVERIFIABLE "only you can test" items here —
each with the URL where he can test it and what to look for.

### 5b. The interview — empty the ledger

Bring the ledger to Arman in **batches of 3–4 questions** and keep going until it is empty.

🚨 **A QUESTION HE CANNOT ANSWER FROM WHAT YOU GAVE HIM IS A DEFECT IN YOUR QUESTION.**
(Arman, 2026-08-20: *"how the hell am I ever going to be able to answer this? ... There's nothing
that guides me on this."*) A question about a flow, a surface, or a path is **unanswerable as
prose** — you owe him the **exact URL to open**, the **exact place in the UI to look**, or a
**mermaid diagram of what actually happens**, and then the question asked against that. Check your
recommendation too: a recommendation that brushes the problem under the rug (he rejected "give the
agent a web search tool" as papering over a broken path with guessing) makes the question worse
than not asking. **And read what the question tells YOU first** — if a surface can reach a state
where an agent has nothing to work from, the PATH is broken; that is the finding, and your question
was a symptom of it. "I need to see this in a UI first" is a legitimate answer: record it as a
deferral WITH the URL he needs, never as an open question.

Every question is fully self-contained — he must be able to answer cold:

- **Short background** — 2–3 plain sentences of fact. No doc-internal numbering, no shorthand.
- **The question** — one concise sentence.
- **Open-ended** when you want his vision: ask it open, let him talk, capture his words.
- **Closed** otherwise: be very specific, state the **best practices** for that topic in a
  sentence or two, then give **your recommendation**. AskUserQuestion fits closed questions —
  recommended option first, labeled "(Recommended)".

After EVERY batch, before asking the next one:

1. **Record each answer where it belongs**: vision answers → verbatim quotes in the STATE doc's
   vision section; rulings → the "settled — never re-ask" table with the date; answers that
   create work → the pending list (and the owning handoff); answers that kill work → remove it.
2. **Commit** the update (small, pathspec-scoped).
3. An incomplete answer, or an answer that raises new unknowns, spawns follow-up questions in
   the next batch. Do not smooth over a partial answer — chase it until it is settled.
4. "Defer" is a legal answer: record it as an explicit dated deferral in the ledger (it stays,
   marked deferred — never silently open, never silently dropped).

The interview ends only when every ledger entry is **answered** or **explicitly deferred**.

### 5c. Final report

1. **Census counts** (N docs → CORE/SEAM/OUT) and the confirmed scope.
2. **Verification results**: claims checked, false-done and false-pending counts with what was
   actually true, drift verdicts, spun-off repair sessions.
3. **The converged set**: links to the STATE doc and each slimmed handoff; deleted files;
   line-count deltas per doc (e.g. `396 → 98`) — proof the volume shrank.
4. **The tour** (5a) and the **interview outcome**: questions answered, deferred, and the zero
   remaining.

## Definition of done

- [ ] Scope was confirmed by Arman BEFORE the census; every discovered doc has a disposition.
- [ ] Every pending item code-confirmed pending; every removed item artifact-confirmed done.
- [ ] Vision merged verbatim + attributed; zero paraphrase; VISION MISSING stated where true;
      settled rulings tabled so they are never re-asked.
- [ ] Anchor handoffs ≤150 lines; superseded satellites deleted in every repo; inbound links
      repointed; register rows intact with current links.
- [ ] The tour delivered as exact URLs; the interview ran in batches until the ledger holds
      zero open questions (answered or explicitly deferred, dated).
- [ ] okf_lint added no violations; every touched repo committed AND pushed.
