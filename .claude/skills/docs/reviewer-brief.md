---
type: Reference
title: "docs — the fresh-reader reviewer brief"
description: "The brief sent verbatim to the fresh reviewer agent in the docs skill (§8): the named reader, the tells, the verdicts, and the output table."
tags: [docs, review, brief]
timestamp: 2026-09-27T00:00:00Z
---

# Reviewer brief (send verbatim; fill the two slots)

**Documents:** `<paths>`
**Mode:** `<REPORT — return findings only, edit nothing>` or `<APPLY — the writer is gone; you make the edits>`

You are reviewing documents written by another agent. You were given nothing but the documents on
purpose. Do not look for the story behind them before step 3 below.

**You hunt one defect class only:** text shaped by what the writer went through rather than by what
the future reader needs. Clarity, wording, duplication, structure, style, and whether a claim about
the product is accurate are **not findings** here, even when you notice them — another review owns
them. A finding must name which of the tells below it is; if none fits, drop it.

## Your reader

A capable agent arriving **next month**, after every fix these documents mention has shipped,
about to do an ordinary task in this area. It has never heard of the bug, the session, or the person
who wrote this. For every sentence ask:

1. **After the fix:** if everything this document says was fixed has been fixed, is this sentence
   still true?
2. **For this reader:** without this sentence, would that reader make a mistake? If not, it does not
   belong here.
3. **Scope:** is the subject one specific thing (a table, an ID, a count, a day, one conversation)
   while the rule is universal ("always", "never", "on this platform")?

## The tells

1. **Story in a rulebook** — past tense, dates, "we found", "turned out", "spent hours".
2. **A warning the document itself cancels** — a warning plus "fixed" nearby.
3. **A one-off stated as a law** — "always/never" attached to one ID, table, count or date.
4. **A workaround or temporary truth with no expiry** — no condition saying when it stops applying.
5. **References only the writer understands** — "the bug", "the earlier approach", "the new helper".
6. **An undated snapshot as a fact** — "currently 2 of 41", "only 3 left".
7. **Emphasis out of proportion** — alarm emoji, bold, or a paragraph on something few readers hit;
   the writer's pain sized it, not the reader's need.
8. **A remark stretched into doctrine** — a person's situational instruction ("skip X for now")
   turned into a standing rule.
9. **Wrong place** — true, but for 1 reader in 100, in a file every reader loads.
10. **"Be careful" with no mechanism** — a real, lasting danger belongs in a guard in code.

**Not a tell:** a short provenance citation for a rule (`(Arman, 2026-09-24)`); a lasting hazard that
is still live (a retired system that is still writable); plain how-it-works description. Keep them.

**A document of distilled rules** (lines drawn from someone's words): tell 8 is the main hunt. For each
line ask whether it reads like an answer to one situation — a named screen, one incident, "for now" —
promoted to a law.

**Softening is not fixing.** Rewriting a one-off as "observed once" or keeping the incident as a
"why this rule exists" paragraph still carries the writer's story. The reason for a rule is at most one
clause; an observation the reader does not need is `CUT`.

## Verdicts

- `CUT` — delete it.
- `REWRITE` — replace with the lasting, reader-facing rule; give the exact new text. The rewrite is
  shorter than or equal to the original.
- `MOVE` — true and useful, wrong file; name where it belongs.
- `ASK` — you cannot tell from the text whether it is still true, or whether a remark was general;
  write one yes/no question, and name the source that would settle it (code, DB, git, or the
  person's recorded words). An `ASK` is a fact question for the writer or a fact-checker — never a
  question for Arman.
- `GUARD` — a real lasting danger that code should block; say what the guard checks.

**You never add.** No new warning, caution, context, background, or history. Every verdict makes the
document shorter or leaves it the same length.

## Steps

1. Read each document whole. Judge by the text alone. Build the findings table.
2. **REPORT mode:** stop and return the table.
3. **APPLY mode:** for each `ASK`, check live code, the database, or `git log -S` yourself. Settled →
   convert to CUT/REWRITE/keep. Not settled → leave the sentence unchanged and mark it unresolved.
   Then apply every CUT/REWRITE/MOVE in place. Never edit a VISION doc, an `authority: owner` doc, a
   doc awaiting Arman's approval, or anything under `inbox/` — for those, settle the `ASK` rows the
   same way, then return the table without editing.

## Output

| # | Quote (≤15 words) | Tell | Verdict | New text / destination / question / guard | Applied? |
|---|---|---|---|---|---|

Then one line: counts per verdict, and the document's length before and after.
