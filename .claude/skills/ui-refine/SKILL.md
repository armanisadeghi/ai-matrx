---
name: ui-refine
description: >-
  Improve an existing UI in the AI Matrx app without reinventing it — the safest,
  most consistent, lowest-variance posture. Keep the user's mental model and the
  current structure intact, and raise the quality bar: cleaner hierarchy, spacing on
  the scale, humanized labels, real loading/empty/error states, fixed mobile breakage,
  polished details. Trigger this when the current page is roughly right and you want it
  sharpened without surprises, or when consistency with the rest of the app matters more
  than novelty. One of the ui-* family (ui-sharp / ui-reimagine / ui-refine / ui-dense,
  orchestrated by ui-bakeoff) — this is the safe, improve-what-exists one.
---

# ui-refine — improve what's there, don't reinvent it

## The result this gives

A confident improvement to what already exists: same systems, same concepts, executed much better. **Safest, most consistent, lowest-variance** posture. You keep the user's mental model intact and raise the bar — cleaner hierarchy, better spacing, fixed rough edges, polished states. You do **not** reinvent the paradigm.

Run this when the current page is roughly right and you want it sharpened without surprises, or when consistency with the rest of the app outranks novelty.

## Read first

- `/Users/armanisadeghi/code/matrx-frontend/.claude/ui-skills/shared/ground-rules.md` — the non-negotiable floor (above all: **build it real, never fake**).
- `/Users/armanisadeghi/code/matrx-frontend/.claude/ui-skills/shared/design-system-anchors.md` — exact tokens / glass / components to reuse.

## Interview first — 2-3 questions, in plain conversation, skippable

Ask in normal prose (never a multiple-choice UI). Skip if the user already covered it. These keep your refinement aimed at the real target:

1. **What specifically is wrong with the current page / what must change?** — refinement targets the real pain; don't guess at it.
2. **What's working and must be kept?** — preserving the good is your strength; make the list explicit so you don't sand it off.
3. **Any existing page, pattern, or component in the app this should stay consistent with?**

## How you work

- **Study the current implementation closely.** Keep its structure and the user's mental model. You are sharpening, not replacing.
- **Model your polish after a great product solving the same problem** — borrow its refinements (spacing rhythm, type hierarchy, state design), not a new paradigm. Name the reference.
- **Fix the rough edges that drag quality down:** ugly machine labels (`some_underscore_key`) humanized for humans; cramped headers given room (e.g. the back button and title share a row when there's space); inconsistent spacing put on the 4/8/16/24/32 scale; weak or missing loading / empty / error states made real; mobile breakage fixed.
- **Reuse app primitives aggressively** — it's the fastest path to consistency (`GenericDataTable`, official cards/sheets, `LoadingComponents`).

## Guardrail

"Improve" must mean *meaningfully* better, not a timid reskin. High floor is the goal, not low effort — if a fresh eye wouldn't notice the page got better, you didn't refine it, you just touched it.
