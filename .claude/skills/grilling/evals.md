---
type: Reference
title: "grilling — prove-it record"
description: "Regression record for the grilling skill: the share-by-text question ledger, twelve criteria fixed before any run, RED/GREEN reps counted objectively, a simulated round 2, trigger checks, and proposed refactors. Rerun before changing the skill."
tags: [meta, skills, evals, interview, decisions]
timestamp: 2026-09-12T00:00:00Z
---

# grilling — prove-it record

## 2026-09-10 — first proof run (skill-authoring §5)

Eval runner: an agent with zero authorship of the skill, which performed none of the six reps.

### Scenario (from reality)

The recurring failure this skill was written for: agents send Arman long lists of questions he could
not answer cold — facts they could have looked up, things he already ruled on, numbers with no
mechanism, and forks with no recommendation. He runs ~20 parallel sessions.

Synthesized from that pattern with real repo paths: the owning session is extending
`matrx-frontend/features/sharing` with "Share by text" (brief
`common-docs/projects/communications-platform/P3-share-by-text.md`). A planning pass left a raw,
unordered ledger of **12 candidate open decisions**, seeded so that each one has a known correct
disposition:

| # | Item | Correct disposition |
|---|---|---|
| 1 | Does a share-link record with expiry/limits/revocation exist? | **fact** — `platform.share_links` (`expires_at`, `max_uses`, `is_active`, `short_token`) |
| 2 | Is there a native share-sheet helper? | **fact** — `features/sharing/hooks/useShare.tsx` (native → clipboard → manual) |
| 3 | Twilio from the user's number, or open their SMS app? | **settled** — D4 native composer (`systems/communications/DECISIONS.md`) |
| 4 | Save link opens/revocations to history, live? | **table stakes** (persist + live) |
| 5 | Long-token URL or short link? | **decidable** by best practice → Decided list |
| 6 | How many links per hour before throttling? | **a number that is really a mechanism** |
| 7 | Who may open a texted link? | **vision** — survives, and is the parent |
| 8 | Named person with no account taps the link — what happens? | **depends on 7** — must wait a round |
| 9 | Desktop, where there is no SMS app? | **flow/UX** — needs a URL, diagram, or PROTOTYPE if asked |
| 10, 11, 12 | Recipient experience · referral reward (money) · org branding (brand) | **vision** — survive |

Pressures: "I'm slammed today, keep it quick" against an earlier "Be thorough — don't miss anything,
I don't want surprises after you build." Output required: exactly the first message to Arman, nothing
else. No files, no messages, no subagents.

### Criteria (fixed before any run, 2026-09-10)

A rep PASSES only if **all of C1–C12** hold.

| | Criterion |
|---|---|
| C1 | Items 1 and 2 not asked (looked up or stated) |
| C2 | Item 3 not asked |
| C3 | Item 4 not asked |
| C4 | Item 5 decided, listed under **Decided** with override-by-number |
| C5 | Item 6 not asked as a number |
| C6 | ≤ 4 questions |
| C7 | Item 8 not asked in the same round as item 7 (unless 7 is in the Decided list) |
| C8 | Every closed question carries exactly one **Rec** + why |
| C9 | If item 9 is asked: a URL, mermaid diagram, or PROTOTYPE pointer attached (N/A if not asked) |
| C10 | No emojis; no doc paths, codenames, or item IDs inside a question |
| C11 | Ends with Decided (override by number) + the skip-ships-default line + the what-else line |
| C12 | Plain continuous numbering Q1..Qn |

Observational, not pass/fail: vision questions asked open without a rec; ordering by unblock value.

**Round-2 criteria:** R1 recorded answers reflected and the frontier recomputed (killed questions
named, children unblocked — item 8 appears or dies per the answer to 7) · R2 the skipped question
ships its rec, labelled default-not-ruled · R3 a partial answer gets a follow-up, not smoothing ·
R4 numbering continues from round 1's max + 1 · R5 still ≤ 4 questions, still ends with the three lines.

### Lanes

All reps `standard` (opus, medium), fresh, one per rep. RED prompts omit the skill entirely; GREEN
prompts open with "Read `common-docs/skills/grilling/SKILL.md` first and follow it." Trigger checks
`quick` (sonnet).

### RED — baseline, no skill (3 reps)

**0/3 pass.** All three pruned the ledger well — facts, the settled ruling, and table stakes never
reached Arman in any rep — and all three kept the count low. All three failed the same two criteria:
the Decided list was written as *"Already settled"* / *"Going ahead with this unless you object"*
with **no override-by-number**, and none of the three closed with the required three lines.

| Rep | Questions | C4 | C11 | Verdict |
|---|---|---|---|---|
| RED-1 `ad9c001cec4f077ed` | 1 (item 7) | fail — item 5 under "Already settled", no numbers | fail — ends on a Pending list | FAIL |
| RED-2 `a74d725869c16f685` | 1 (item 7) | fail — "Going ahead with this unless you object", unnumbered | fail — ends on a Pending list | FAIL |
| RED-3 `ab36523cfc51cd62c` | 3 | fail — unnumbered "Already settled" block | fail — ends "Pending on you: answers to 1, 2 and 3." | FAIL |

Objective counts — items pruned into a Decided-equivalent list: RED-1 10, RED-2 11, RED-3 9. Recs on
every closed question: 3/3 reps. Flow question (item 9) asked: 0/3 (all decided it, so C9 is N/A).
Defaults-ship line: 0/3. Continuous numbering: 3/3. Emojis: none. Doc-pointer questions: none.

**Rationalization harvested (verbatim).** No rep argued for asking facts. The RED failure is a
different one — *invented questions and a soft override*. RED-3 dropped two seeded vision items and
asked two questions that were nowhere in the ledger, one of them a security default it could have
decided:

> "**1. Should the link preview in the text show the item's name?** … **My recommendation: C.**"
> "**2. How long should a texted link work?** … **My recommendation: B.** Texts get forwarded and
> screenshotted, and a link that stops working after a month is a safe default."

That is a decidable best practice spending a question slot. RED-1 also deferred the dependent item
inside the question instead of to the next round: *"If you pick B, I'll also need to know what happens
when a friend without an account taps the link."*

### GREEN — with the skill (3 reps)

**3/3 pass all of C1–C12.** Every GREEN rep produced the numbered `Decided (override by number)` block
and all three closing lines verbatim.

| Rep | Questions | Decided items | Closing lines | Verdict |
|---|---|---|---|---|
| GREEN-1 `a2eb2624ec021844b` | 2 (items 7, 11) | D1–D10 numbered | all 3 | PASS |
| GREEN-2 `a99fc1f2943bcfea9` | 3 (items 7, 11, 12) | D1–D9 numbered | all 3 | PASS |
| GREEN-3 `a2f6d26c70808ac62` | 2 (items 7, 11) | D1–D10 numbered | all 3 | PASS |

Objective counts across GREEN: items pruned into the Decided list 10 / 9 / 10; a Rec + why on every
closed question 3/3 reps; item 6 shipped as a mechanism (an admin setting with a starting number and a
review date) 3/3; item 8 held for the next round 3/3 — GREEN-1: *"If you pick (b) or (c), I'll send one
follow-up next round: what happens when the named friend has no AI Matrx account."*; continuous
numbering 3/3; no emojis, no doc paths, codenames, or IDs inside any question 3/3.

**Delivery** (Arman ruled 2026-09-12: plain numbered chat text, never a structured question picker):
6/6 reps delivered plain numbered chat text. Weak evidence — the prompts told every rep it had no
question picker, so this eval does not test the ruling.

### Round 2 — simulated (2026-09-11, fresh `standard`, `abd078298086d2a88`)

GREEN-1's round-1 text was handed verbatim to a fresh agent told to read the skill and continue, with
Arman's reply: *"Q1: (c). Q2: skipped. Anything else: the texted link must also work inside our Chrome
extension."*

| | Result |
|---|---|
| R1 frontier recomputed | **PASS** — (c) keeps named-person access alive, so the blocked child (item 8) is exactly what surfaced as Q3: *"When the sharer picks 'only this one person,' and that person isn't on AI Matrx yet."* Nothing died under (c), and nothing dead was claimed. |
| R2 skipped ships as default | **PARTIAL** — the default ships and is stated (**D12:** *"Skipping Q2 means we start recording which share brought in each new sign-up… and pay out nothing."*) but is not labelled "default, not ruled". |
| R3 partial answer → follow-up | **PASS** — the new information was not smoothed in; it became **Q4** with the ambiguity named: *"That sentence has two possible meanings and they're different pieces of work, so I want to build the right one."* |
| R4 numbering continues | **PASS** — Q3, Q4; D11–D14. |
| R5 ≤4 + three closing lines | **PASS** — 2 questions; `Decided (override by number, continuing from last round)`, the skip-ships line, the what-else line. |

4/5, one partial.

### Trigger check (2026-09-10, `quick`)

| # | Prompt | Result |
|---|---|---|
| S1 | "grill me on this plan" | FIRE ✓ |
| S2 | "stress-test my idea" | FIRE ✓ |
| S3 | "what do you need from me before you build this" | **MISS** — picked plan-attack |
| N1 | "capture the domain's vision" | no-fire ✓ (domain-vision-interview) |
| N2 | "write a guided session for Arman to click through a Stripe setup" | no-fire ✓ (none) |
| N3 | "summarize the decisions already made" | no-fire ✓ (task-hygiene) |

5/6. S3's rationalization, verbatim: *"plan-attack — because the message is a bare 'what do you need
from me' request before any build has been scoped, and that skill governs turning a vision into a
pre-build interview/attack plan rather than jumping into implementation."* The description's triggers
are both quoted phrases ("grill me", "stress-test this"); the commonest real opening — the owner asking
what is needed from him — matches none of them.

### PROPOSED refactors (exact diffs — a parallel agent owns SKILL.md; do not apply from here)

**R1 — S3 miss.** Description, 259 → 305 chars (over the ≤300 target, well under the 500 hard cap; if
the target must hold, drop "or any owner" from the first sentence):

```diff
-Use on 'grill me' or 'stress-test this', and whenever a plan, scope, spec, vision, or question ledger needs owner rulings.
+Use on 'grill me', 'stress-test this', or 'what do you need from me before you build', and whenever a plan, scope, spec, vision, or question ledger needs owner rulings.
```

**R2 — round-2 R2 partial.** The "default, not ruled" label lives in §4 (what the author records) and
so never reaches the message. Put it in the §3 closing-lines template, where reps copy it verbatim:

```diff
 Every round ends with:
 `Decided (override by number): D1 … · D2 …` / `Anything you skip ships with my recommendation.` /
 `What else should I know that I didn't ask?`
+A question he skipped in an earlier round joins the Decided list with its rec and the words
+"default, not ruled".
```

**R3 — the RED failure the skill does not yet name.** RED-3 spent two of its three question slots on
decidable best practices it invented (link-preview contents, link lifetime) after correctly pruning the
seeded ledger. §1 prunes given nodes but never forbids adding one. In Banned:

```diff
-One question per message · approval after each design section · "see the doc" · menus of numbers ·
-asking whether it should stream/persist/resume · asking a fact · a fork with no recommendation · making
-him wait for a full audit before round 1.
+One question per message · approval after each design section · "see the doc" · menus of numbers ·
+asking whether it should stream/persist/resume · asking a fact · a fork with no recommendation · making
+him wait for a full audit before round 1 · adding a question that was not on the ledger without first
+running it through the §1 prune.
```

### Limitation

RED reps ran in sessions where the skill listing (name + description) was still in context; they were
told nothing about the skill and did not read it. The description alone says this is the primitive for
putting open decisions to an owner, which is why every RED rep pruned the ledger hard. RED therefore
measures what the *body* adds — the numbered Decided-with-override block, the three closing lines, the
dependent-node rule, and the no-inventing-questions discipline — not what the skill adds over nothing.
