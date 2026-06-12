---
name: ui-reimagine
description: >-
  Redesign a UI for the AI Matrx app by reinventing it from scratch — the boldest,
  highest-ceiling, highest-variance posture. Throw out the current structure and ask
  "what should this actually BE?": merge separate screens, rethink the core interaction
  model, build the ideal tool for the job as if it didn't exist yet. Trigger this when
  you want to break the frame rather than polish it, when you want surprising new
  paradigms, or when you want an idea generator (running it more than once yields
  genuinely different concepts). One of the ui-* family (ui-sharp / ui-reimagine /
  ui-refine / ui-dense, orchestrated by ui-bakeoff) — this is the break-the-frame one.
---

# ui-reimagine — the bold from-scratch reinvention

## The result this gives

The boldest reconception. You ignore the current layout and ask *"what should this be?"* — a from-scratch design that can genuinely surprise. This is your **highest-ceiling, highest-variance** posture and your idea generator: run it to break the frame, not to polish. Run it twice and you'll get two different concepts — that's the point, not a flaw.

## Read first

- `/Users/armanisadeghi/code/matrx-frontend/.claude/ui-skills/shared/ground-rules.md` — the non-negotiable floor (above all: **build it real, never fake**).
- `/Users/armanisadeghi/code/matrx-frontend/.claude/ui-skills/shared/design-system-anchors.md` — exact tokens / glass / components to reuse.

## Interview first — 2-3 questions, in plain conversation, skippable

Ask in normal prose (never a multiple-choice UI). Skip if the user said "just go." These three target your specific blind spots:

1. **How far should I push — a bold refresh, or fully reinvent the paradigm** (merge screens, change the core interaction model)?
2. **First-glance test: must a brand-new user operate this with zero explanation, or is a power-tool with a short learning curve acceptable?** — This calibrates how far toward complexity you may go. Your #1 failure mode is building something powerful that needs a tutorial; this question tells you whether that's allowed.
3. **What in the *current* version already works well and must be preserved or beaten — never lost?** — Your #2 failure mode is reinventing so hard you regress good existing behavior (a working animation, a fast path). Get this list before you start.

## How you work

- **Reconceive from the data and the job, not the current layout.** Ask: if the ideal tool for this task didn't exist yet, what would it be? Model after the most ambitious real product that fits the job, and name it.
- **Maximize the axes the job rewards:** density-with-clarity, capability, streaming-as-experience, fewer clicks, everything-in-one-place when that genuinely serves the user.
- **Honor the approachability answer.** Power must not cost the user a tutorial unless they blessed it — build the on-ramp (progressive disclosure, sensible defaults, a calm first screen that deepens on use).
- **Give every surface and state the same ambition.** The most common way a reimagine disappoints is a brilliant primary screen shipped beside a weak secondary one, or a stunning happy-path with a broken error/empty/stall state. Equal craft everywhere (ground-rules §2-3).

## Guardrail

Bold is never an excuse for unusable, unreal, or regressed. Before you ship, re-read ground-rules §1 (build it real — handle the silent stream, the error, the empty), §2 (don't lose what worked), §3 (every state first-class). The reimagination is only a win if it's also *real and complete*.
