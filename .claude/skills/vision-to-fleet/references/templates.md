# Vision → Fleet: artifact templates

Every template below has a live worked example from the Education Hub run (2026-07) — read the
example alongside the template; the example carries the register and density the template can't.

| Artifact | Worked example |
|---|---|
| Vision doc | `app/(core)/education/VISION-education-hub.md` |
| Competitive insights | `docs/proposals/COMPETITIVE_INSIGHTS_AND_REPRIORITIZATION.md` |
| Master plan | `docs/proposals/education-projects/README.md` |
| Project brief | `docs/proposals/education-projects/P7-sharing-public-access.md` (best all-round), `P0-trust-layer.md` (contract-owner shape) |
| Assignment prompt | `docs/proposals/education-projects/ASSIGN.md` |
| In-flight addendum | `docs/proposals/education-projects/F1-flashcards-feature-adds.md` |
| Documented deferral | `docs/proposals/education-projects/W2-class-hub.md` |

---

## 1. Vision document

Location: beside the feature (`app/(core)/<area>/VISION-<area>.md`). Voice: **capability, not
aspiration** — write what the platform does/will do as fact; honesty lives in the ✅/🔲 status
table, not in hedged prose. Structure:

```markdown
# <Name> — Master Feature Document
> Purpose line: capability record, current + actively-building, written from capability not aspiration.

## Who We Serve            ← segments table: segment | range | key needs
## Core Feature Set        ← numbered sections, one per pillar; dense bullets;
                             signature features get their own section with full mechanics
## Platform Architecture   ← component | ✅ Live / 🔲 Roadmap | one-line detail (BE HONEST here)
## Features Coming Soon    ← infrastructure-exists-to-deliver items only
## Competitive Landscape   ← platform | strength | pricing | what we do that they don't
## Why We Win              ← numbered differentiators; each one sentence, concrete
```

Amendment rule (post-research): new pillars merge into their home sections in place; Why-We-Win
gains numbered entries; never a bolted-on "research addendum" section. Update any mirror in the
same commit.

## 2. Competitive insights doc

Location: `docs/proposals/`. Never edits the vision itself — §"proposed additions" is explicitly
FOR APPROVAL. Structure:

```markdown
# Competitive Insights & Re-Prioritization — <Area>
> Date · method (N parallel research passes, sources) · "does NOT rewrite the vision" note

## 0. The strategic thesis        ← the one paragraph that explains the whole market moment,
                                    ending in the positioning sentence (blockquote)
## 1. Top unmet market wants      ← ranked table: want | evidence (x/N passes) | do we have the pieces?
## 2. Per-competitor intel        ← table: competitor | nails (steal) | hated for (our wedge) | the ONE thing to take
## 3. Cross-cutting themes        ← grouped (TRUST/MONEY/SYSTEM/...), each theme lettered for citation
## 4. Proposed VISION elevations & additions (FOR APPROVAL)
## 5. Re-prioritized project/task set   ← maps onto the existing roadmap: NEW projects, ELEVATE existing, feature-adds
## 6. Re-ordered build priority
## 7. Notes & caveats             ← sourcing honesty: what's secondary, what's self-reported
## Change log
```

Add (new since education): `## Visual evidence` — pointer to `research-assets/` with the
screenshot index, and `## Design direction` — per-surface adopt/reject conclusions.

## 3. Master plan (the briefs folder's README.md)

The single source of truth for execution; supersedes prior roadmaps via loud pointers in THEM.

```markdown
# <Area> — MASTER PLAN (single source of truth for execution)
> Status date (vN) · what it merges · "every brief standalone, assign via ASSIGN.md" ·
  "every claim re-verified against live code + DB on <date>"

## 1. The strategic thesis        ← condensed from the insights doc
## 2. What the system is          ← ONE paragraph, every project named with its role in the loop
## 3. Current foundation          ← verified: built+live / stubs / greenfield / resolved anomalies
## 4. The project set             ← table: # | brief link | one-liner | priority tier;
                                    tiers = staffing order, NOT sequencing — all run in parallel
## 5. The contracts               ← table: contract | owner | consumers | typed interface;
                                    day-1 publication rule stated per contract
## 6. Cross-cutting mandates      ← the rules audited at Convergence A (e.g. TRUST)
## 7. Waves, convergences, fan-out ← Wave 1 → Convergence A (DoD) → B → C; Wave-2 fan-out list
## 8. Flags → DECISIONS RECORDED  ← every flag with Arman's verbatim-ish answer once given
## Change log
```

## 4. Project brief

One file per project, `P<N>-<slug>.md`. The blind-handoff test governs every section. ~120–200
lines; longer means the project is two projects.

```markdown
# P<N> — <Name> <(FOUNDATIONAL CONTRACT — publish day 1) if applicable>
> Status date · wave + priority tier · pointers to master plan + the vision sections it delivers
  · one line on WHY (market evidence) if research-driven

## Objective                ← one paragraph tying it to the vision + the market wedge
## Current state (verified) ← what exists to build on, with file paths, agent UUIDs, row counts;
                              what is explicitly NOT yours (e.g. a lookalike table resolved as
                              another feature's); recent motion to reuse
## Scope
  **IN**                    ← the substantial list; competitive mandates as their own block
  **OUT**                   ← every OUT names its owner ("P5 reads your data") — OUT without an
                              owner is how work falls through
## Deliverables / Definition of done   ← numbered, each independently verifiable
## Surfaces touched         ← routes, features/ dirs, DB areas, cross-repo (aidream) pieces
## Dependencies & contracts ← consumes (with day-1 stub note) / publishes / coordinates-with
## Build guidance           ← which repo skills to invoke, the pattern-reference implementation
                              to copy, the 2–3 gotchas that would otherwise cost the agent a day
## Verification             ← how it's proven live (no mocks), ending with "hand Arman exact
                              routes + a test script"
## Open questions           ← only genuinely open ones; product-semantics go to Arman directly
```

Rules that made education's briefs work:
- **Current state is re-verified the day the brief is written**, not copied from an older doc.
- **Contract owners** (gates, entitlements, trust, converters) say so in the title line and put
  the day-1 publication first in Deliverables.
- **Build guidance names skills** (`db-change`, `type-safety`, `overlay-system`,
  `code-splitting`, `shape-system`, `protected-resources`, `finalize-and-ship`, ...) so the
  agent loads the paved road instead of rediscovering it.
- Kickoff addenda: when concurrent work lands on a brief's turf before assignment, prepend a
  dated `⚠️ KICKOFF ADDENDUM` block telling the agent what to audit first.

## 5. ASSIGN.md — the assignment prompt

Fresh session per project; F-addenda go to the owning agent's live session. Keep the prompt
lean — the briefs carry the content. Include an Assigned? tracking column. Canonical prompt
(includes Arman's own additions — Commits + Loop — keep them):

````markdown
```
You are taking ownership of ONE project from the <Area> master plan.

Brief directory:        docs/proposals/<area>-projects/
Your project and brief: {P3 — Study Media | `P3-study-media.md`}

Do this, in order:
1. Read the master plan (README.md) — you are one of ~N parallel agents; it defines the shared
   contracts, the cross-cutting mandates, and who owns what.
2. Read your brief top to bottom. It is your contract: objective, verified current state, scope
   in/out, deliverables, and verification are all binding. Scope OUT means another agent owns
   it — integrate via the named contract, never build it.
3. Re-verify the brief's "current state" claims against live code + the live DB before building.
   If reality has moved, adapt and note it — don't build against a stale picture.
4. If your brief says you publish a day-1 contract, publish it (typed interface + doc) before
   anything else.
5. Build to done per the brief, following CLAUDE.md and the skills it names. Work on main;
   commit as you go; pull before starting and re-pull before each commit.
6. Verify for real (live app, live DB, no mocks), then report: what shipped, what's open, and
   the exact routes + steps for me to test.

Coordination: where your brief names another project as a dependency, check whether its
contract/stub already exists before waiting on anything. If you're genuinely blocked or a
product decision is mine to make, ask me directly (the AskUserQuestion tool is fine) — don't
guess on product semantics, and don't silently shrink scope.

Commits: Make small commits. Don't stash other people's work. If your work gets accidentally
added to another commit, that's ok — just don't let your work get lost.

Loop: Work in a loop with your sights set on making every part of my vision a reality. Make
improvements and enhancements when you see the opportunity. Apply all best practices. Use
adversarial agents to check your work. When you truly have nothing more you can do and are
totally blocked, come back with clear questions that set the stage for me to answer quickly.
```
````

## 6. F-addendum (work routed to an agent already in flight)

`F<N>-<owning-feature>-feature-adds.md`: header states it is an addendum, not an assignment;
**Added items** (priority-ordered, each with the market/why line and exact file anchors);
**Hand-offs OUT** (items leaving this agent's queue, marked APPROVED + effective date once
Arman confirms); **Still yours, unchanged**.

## 7. Documented deferral (Wave-2+ item Arman wants remembered)

`W2-<slug>.md`: full brief-shaped doc marked "WAVE 2 — documented so it is not forgotten; do
NOT assign yet", with the assignment trigger ("after Convergence B"), the design insight that
makes it cheap (write this while it's fresh), draft scope, and draft DoD. Linked from the master
plan's fan-out list.
