---
name: context-docs
description: Use whenever you edit, extend, reorganize, or trim an instruction/context doc that agents read — `CLAUDE.md`, any `FEATURE.md`, `PRINCIPLES.md`, `KNOWN_DEFECTS.md`, a feature `README.md`, or a `SKILL.md`. Triggers on any change to these files: adding a rule, documenting a new section/feature, recording an invariant, leaving a pointer, or compressing. Enforces the house style — every edit is a full-document review, maximum punch per word, "before you do X, read Y" pointers, and important rules organized not lost. NOT for product code, UI copy, marketing, or user-facing prose.
---

# context-docs — edit instruction docs that pack a punch

These docs are read by agents *before* they touch code. `CLAUDE.md` loads on **every turn** — every word is a tax paid for the life of the repo. Treat word count as a budget, not free space. The goal: same punch, every point landed, far fewer words.

## Rule 0 — every edit is a full-document review

You are **never just appending.** Before you save any change:

1. **Read the whole doc**, top to bottom — not only the section you came to edit.
2. **Put the change where it belongs**, not where you happened to be. A new file rule → the file section. Never bolt a paragraph onto the end.
3. **Reconcile.** Does your addition duplicate, contradict, or weaken something already there? Merge, don't stack. Two rules saying the same thing → collapse to one.
4. **Leave it more aligned than you found it** — one voice, no drift, no orphaned "addendum" blocks.

An edit that ignores the rest of the document is a regression *even if its own content is correct.*

## Voice — punch, not prose

- **State the rule, then stop.** "X is banned. Use Y." Not "we've found over time it's generally better to avoid X because…"
- **Bold the word that carries the rule.** Agents skim; the bold is the signal.
- **One idea per bullet.** A bullet with an "and also" → split it.
- **Present tense, absolute.** Cut "currently", "in the future", "we should probably", "it's recommended." Rules are not opinions.
- **Concrete anchors beat description.** Name the file, function, table, or skill. `selectIsSuperAdmin` > "the admin-check helper."
- **One line of failure earns the rule.** "A signed URL expires days later" justifies the rule better than a paragraph of theory. No stories, no history, no journey.

## "Before you do X, read Y" — the highest-value line

For any area with real depth, don't inline the depth — point to it:

> **Invoke the `protected-resources` skill** before touching `public.admins`…
> Read [`features/scopes/FEATURE.md`](…) before any scope/context code.

`CLAUDE.md` is a **router, not an encyclopedia.** Load-bearing invariant + one-line pointer stays; the full table / design spec / catalogue lives in the feature's own `FEATURE.md` or skill. A reference section growing past ~8 lines is the signal to **extract it and leave a pointer.**

## Never lose a rule

Compression ≠ deletion.

- When you tighten a section, **every invariant, file path, function name, and pointer survives.** Cut connective tissue, never the rule.
- Unsure whether a clause is load-bearing? It stays.
- Removing a rule is a **deliberate act you call out to the user** — never a silent side effect of "cleaning up."

## Before you save — checklist

- [ ] Read the whole doc; the change sits in the right section.
- [ ] No new duplication or contradiction; merged where it overlapped.
- [ ] Every prior rule still present — paths, names, pointers intact.
- [ ] New content is rule-not-prose: bolded signal, present tense, no hedging.
- [ ] Depth pushed to a pointer if the section was bloating.
- [ ] Word count rose only as much as the new rule genuinely needs.
- [ ] If this is a `FEATURE.md`, the Change Log got a dated one-line entry.

## Anti-patterns

- An "Update 2026-XX" / "Note:" block tacked on instead of integrating the change.
- A second section restating a rule already stated elsewhere.
- Narrating the journey ("originally A, then B, now C") instead of stating the current rule.
- Inlining a 15-row reference table into `CLAUDE.md` when it belongs in a `FEATURE.md`.
- "Cleaning up" by dropping a rule you didn't understand.
