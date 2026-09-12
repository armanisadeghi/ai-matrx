---
name: ask-arman
type: Skill
title: "ask-arman — the homework gate and the filing of every question for Arman"
description: "The gate and the filing for any question an agent wants Arman to decide. Use when about to ask him anything, end a turn on a question for him, write 'needs Arman's decision', or mark work blocked on him. NOT for a step only he can perform on a screen or an account (use a guided session)."
tags: [questions, decisions, arman, discipline, operations]
timestamp: 2026-09-12T00:00:00Z
---

<!-- SYNCED COPY — do not edit here.
     Canonical: common-docs/skills/ask-arman/SKILL.md
     This file is distributed to every consuming repo by
     common-docs/meta/scripts/sync_skills.py. Edit the canonical, run the
     sync, and commit each repo. Edits made here are overwritten and lost. -->

# ask-arman — the homework gate and the filing

**The disease this skill ends** (Arman, 2026-09-12, verbatim): *"questions become their lazy
excuse to get out of things. So they'll often ask me questions where the answers are already in
the codebase or in the documentation, and they won't go dig out that information. Instead,
they'll present it to me as a question — or they'll ask me a question about something that if
they were to do a little bit more homework and get me better information, they either wouldn't
need to ask the question or I could instantly answer it, but they don't do the job."* And on the
shape: *"when they say, you know, document seven section eight b q one c two, and then they ask
me some silly question… it's impossible for me to answer that question."*

He talks to thirty or forty agents at once and reads none of what they write. So a question
reaches him only through two gates — yours (below) and the desk's — and it never stops your
work. The law of the words is [talk to Arman like a person](/policies/talk-to-arman-like-a-person.md);
the register is [the Question Ledger](/operations/questions.md); the interviewer is
[question-desk](/skills/question-desk/SKILL.md).

## The homework gate — five tests, each recorded in the row

Run them in order. The first that says "not a question" ends the matter.

1. **Is it a fact?** Anything code, the database, a document, or the web can settle is looked
   up, never asked. "Does X exist", "which table", "what does the endpoint return", "what did
   the last run do" — dispatch a `quick` lane if it is tedious. Record where you looked.
2. **Did he already rule, or delegate?** Search the owning node's `DECISIONS.md` and
   `VISION.md`, the vocabulary lexicon, `log.md`, the [conflict register](/operations/conflicts.md)
   (laws 3a and 3h), the ledger's answered rows, and the attention board. A dated verbatim
   ruling → apply it and cite it. His last word was "research the best and decide" → the
   decision is yours: research the champions, decide with the companion machinery
   ([decisions must be complete](/policies/decisions-must-be-complete.md)), record the reason in
   `DECISIONS.md`, and tell him what you decided. Re-asking either is the defect.
3. **Is it table stakes, a knob, a limit, or a number?** Streaming, persistence, resume, never
   losing input are always yes ([table stakes](/policies/table-stakes-are-never-a-question.md));
   a ceiling or a threshold is a knob you set with a dated review
   ([limits are knobs](/policies/limits-are-knobs-agents-set-them.md)); a number that is really
   a mechanism gets the mechanism.
4. **Can established practice decide it?** Look at how the champions for this discipline handle
   the same fork ([champions](/policies/champions.md)). If every mature product does the same
   thing, do that, name who you followed, and list it as "decided — override by number" in your
   check-in. Most forks die here.
5. **Is it a human step rather than a question?** His account, his screen, his eyes on a real
   page, money to add, a credential only he holds → a guided session on the
   [attention board](/operations/attention.md) per [human steps are guided sessions](/policies/human-steps-are-guided-sessions.md),
   not a ledger row.

What survives is a real question: vision, product semantics, money, brand, legal, a promise to a
customer, deleting real data, or a genuinely open-ended direction. Record the five results in one
line each — a row without them is bounced.

## Never stop — the default in force

A real question still does not stop you. Decide which way you would go if he never answered,
write it in the row as the default in force, say how it reverses, and keep building on it. The
one exception is a **one-way door**: real data deleted, money spent, something sent outside the
company, a contract bound. That branch waits; everything around it proceeds. Marking a task
"blocked on Arman" while a reversible default exists is the lazy exit this skill exists to end.

## The row — file it, deduplicated

1. `grep -i` [the ledger](/operations/questions.md) for the subject's nouns. A row on the same
   subject already exists → add one `Also asked by:` line with your chat title and session id,
   adopt its default, and stop here.
2. Otherwise add a row under **Open** in the exact shape the ledger prescribes (copy its
   template; every field filled; the five parts filled as far as your homework reached — the
   desk completes them). `Filed` carries your chat's first prompt or title in twelve words and
   your session id — the desk needs both to bring the answer back.
3. Commit and push common-docs (pathspec-scoped: the ledger only). An unpushed row does not exist.

## What you still say in chat

You may still ask him directly, and often should — but in the same shape, and only this shape:
number the question; one or two plain sentences of background a stranger needs; ONE direct
question; the best practice and your recommendation, so "yes" answers it — or the words *"this
one is open-ended"*. No path, id, section number, code, codename, or ledger id in the sentence.
Then one more sentence, always: *"I have also filed this with the other agents' questions, so you
can answer it here or when you sit down with the desk; meanwhile I am proceeding on my
recommendation, which is reversible."* Then continue working — do not end the turn waiting.

## Picking up the answer

When you resume, or when a message arrives saying your answer is in the ledger: open the ledger,
find your row (search your session id), read the answer **verbatim**, apply it — reversing the
default where it differs — record the change in your handoff or state doc, and mark the row
`delivered` if the desk has not. His answer is already in the owning `DECISIONS.md`; never
re-record a paraphrase.

## Rationalizations

| Excuse (verbatim or near it) | Reality |
|---|---|
| "This needs Arman's decision" | Tests 1–4 were not run. Ninety percent of these die at a fact, a ruling, a knob, or a champion. |
| "I'll ask to be safe" | Asking is not safe: it costs the scarcest account in the company and teaches him the queue wastes his time. |
| "It's blocked on him" | Only a one-way door is blocked. Everything else has a default in force. |
| "He'll know what I mean by the register / §4.6 / D140" | He reads none of it. A sentence he must decode is a sentence he will not answer. |
| "Which one do you want?" | A fork without a recommendation and its companion machinery is homework handed to him. |
| "He said 'I don't know' last time, so I'll pick" | That answer means the question failed; bring it back better, never pick silently. |
| "I'll just ask in chat, filing is overhead" | Unfiled questions are invisible to the desk, get asked twice, and die with the chat. |

## Red flags — the thought before the violation

- "Let me check with Arman before I…" (before searching `DECISIONS.md`).
- The word "blocked" appearing in your status while nothing is a one-way door.
- Drafting a question that contains a path, a code, or "see".
- More than one hard question in one message.
- A question whose answer you could get from `grep`, a `SELECT`, or one web search.
- "I'll ask what the limit should be."

## Banned

Ending a turn on an unfiled question · a row with an empty homework line · "blocked on Arman"
with a reversible default available · a fork with no recommendation · any code, id, path, or
section number in his sentence · re-asking anything dated in a `DECISIONS.md` · asking a fact.
