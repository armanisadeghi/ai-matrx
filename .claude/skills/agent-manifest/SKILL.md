---
name: agent-manifest
description: Build the MANIFEST for a mandate — the deliberate, measured decision about exactly what an agent must be given to answer its question, how that data is condensed to fit context, what it returns, and how the result is verified against ground truth. Use BEFORE creating or fixing any agent/mandate that reasons about anything larger than its own input (a page inside a site, a card inside a deck, an episode inside a show, a rule inside a rulebook), and whenever an agent's output "looks right" but nobody has checked whether it COULD have been right. NOT a substitute for create-agent — that skill builds the agent; this one decides what the agent gets.
---

<!-- SYNCED COPY — do not edit here.
     Canonical: common-docs/skills/agent-manifest/SKILL.md
     This file is distributed to every consuming repo by
     common-docs/meta/scripts/sync_skills.py. Edit the canonical, run the
     sync, and commit each repo. Edits made here are overwritten and lost. -->

# agent-manifest — deciding what the agent must know, and proving it knew it

## THE FAILURE THIS EXISTS TO KILL

An agent is asked a question it **cannot possibly answer** with what we send it. It answers
anyway — fluently, plausibly, in the right shape. Someone clicks the button, sees prose and
valid JSON, and marks the feature done. The output is fabricated, and now it is **stored**,
so every later step treats fabrication as evidence.

This is worse than the feature not existing. A missing feature is a known gap. A confidently
fabricating feature is **falsified evidence that compounds** — it makes the system look
healthy while moving it further from truth.

**The measured case that produced this skill (2026-08-23, `content_plan.p3_family`).** The
mandate asks: *"what does this page cover, what does it leave to its siblings, and where does
it link?"* Everything looked correct — the mandate declared a provision, the agent declared and
interpolated a `{{family}}` variable, the call site built it, the run returned a well-formed
object with covered topics, deferred topics and internal links. It had been rebuilt to the
create-agent bar, run twice, judged "green".

Then someone measured what the agent actually received:

| | |
|---|---|
| Pages on the site | **295** |
| Pages visible to the agent | **1 — itself** (`0%`) |
| Siblings in the payload | **0** |
| Real routes it could legally cite | **2** (itself and its parent) |
| Internal links it proposed | several, all **invented** |

`family_context()` returns parent + siblings + children. This page's parent had exactly one
child — itself. So the "family comparison" ran against an **empty family**, and every route it
proposed was fabricated. Meanwhile the genuinely competing pages — a whole
`/research-and-experts/*` section and `/learn/evidence/*` — were invisible to it. The one
question the mandate exists to answer ("does this page overlap something else?") was
**structurally unanswerable**, and nothing in the pipeline noticed, because the shape was
valid and the prose was good.

**Say it plainly: a response is not a result. Valid JSON is not knowledge. "The agent
returned something" is not a test.**

## THE ANSWERABILITY TEST — run this before anything else

Take the question the mandate asks. Write down **every fact a competent human expert would
need to answer it**. Then, for each fact, answer honestly:

1. **Do we have it?** In which table, column, or upstream artifact?
2. **Are we sending it?** Trace the actual call site, not the provision. A declared offer that
   nothing fills is not delivery.
3. **Is it complete enough?** A cap, a filter, or a tree-shaped slice can silently reduce a
   whole-site question to a one-page answer. Measure the ratio (`visible / total`) on REAL
   data before you trust it.

If any required fact is missing, you have exactly three honest moves — **and inventing a
plausible answer is not one of them**:

- **Build the delivery** (usually: a new condensed representation — see below).
- **Cut the question down** to what the available data genuinely supports, and change the
  mandate's declared job to match.
- **Refuse**: the mandate raises with a named missing input, and the feature says so out loud.

The one thing you may never do is let the agent fill the gap. **An agent handed an
unanswerable question will always answer it.** That is not a model flaw to prompt around; it
is a design defect on our side.

## BUILDING THE MANIFEST — the real work

A manifest is not a list you dash off. It is the deliberate decision about **what goes into a
finite context window**, and it is the highest-leverage engineering in the whole platform.

**Step 1 — inventory.** List every data point that exists and is relevant. Not what is
convenient; what exists. Go find it: the tables, the prior steps' artifacts, the derived
values. This is research, and it is the step people skip.

**Step 2 — necessity.** For each item: does the agent need it to answer THIS question? Cut
what it does not. Every token spent on decoration is a token stolen from the thing that
actually decides the answer.

**Step 3 — condensation.** Whatever survives has to fit, and it has to be *readable by a
model*, which is not the same as complete. Design the smallest representation that preserves
the decision-relevant signal. For a site, that is usually the route + a short label + a role,
not the page's content. Ask: *"could a smart human make this call from this text alone?"* If
no, condense differently — do not just add more.

**Step 4 — scale tiers, with a real fallback.** A representation that works for 50 items
breaks at 6,000. Decide the threshold BEFORE you ship, and decide what happens past it. Never
"just send more" and never silently truncate. Legitimate strategies past the threshold:
compartmentalize (send the relevant branch plus a summary of the rest), summarize the far
field into counts and clusters, or run a cheap deterministic pre-filter that selects the
candidates and hand the agent only those. **A silent cap is the same defect as a missing
input, and it is harder to see** — record the ratio and log it.

**Step 5 — the output, and THE FULL-VALUE RULE.** If you have decided this question is worth
assembling a large, expensive context for, then **take everything that context makes
answerable, not one slice of it.** An agent that has just been given the whole site in order
to place one page should not return only that page's placement — if the SEO plan is missing
and it now has everything needed to write one, it writes one. Paying for deep context and
harvesting one field is the expensive twin of the same carelessness. This is exactly what the
kind system is for: a nested output shape that carries every valuable thing the call earned.

**Step 6 — the ground-truth check.** Decide, in advance, how you will verify the answer
against data you hold. Every entity the agent names — every route, id, keyword, card,
citation, chapter — must be checkable against the set you sent it. If you cannot state the
check, you have not finished designing the mandate.

## VERIFYING — what a real test looks like

A test that proves an agent worked has **three** parts. Most "tests" have only the first.

1. **It ran.** Status, shape, schema. Necessary; proves nothing about truth.
2. **It could have been right.** Measure the input on real data: how much of the relevant
   universe did it actually see? Print the ratio. `1 of 295` is a failing test even when the
   output is beautiful.
3. **It IS right.** Cross-check every entity it named against ground truth. Every proposed
   route exists in the route list you sent. Every cited id is in the input. Every quote is a
   verbatim substring of the source. **Count the fabrications. The passing number is zero.**

Design tests to make failure visible, never to confirm success:

- **The trap case.** Put something in the data the agent must catch (a genuinely overlapping
  page, a contradicting rule, a fabricated claim). If it sails past, the test found a defect —
  that is the test working.
- **The near-miss.** Put something that looks like a hit but is not. It must NOT be flagged.
- **The honest-empty case.** A case where the correct answer is "nothing". An agent that never
  returns empty is an agent that invents.
- **The adversarial-scale case.** Ten near-duplicate pages targeting one keyword. If the
  mandate is supposed to catch competition, it must catch this one — and it can only catch it
  if the manifest actually delivers the other nine.

**Report what you measured, not what you concluded.** "1 of 295 pages visible; 4 of 4 proposed
links do not exist" is a result. "Verified — output looks good" is not a claim anyone should
accept, from a human or an agent.

## MANDATE HYGIENE (rulings that bound this work)

- **One mandate, one job, one call site.** Do not reuse a mandate across jobs — a shared
  mandate cannot have a truthful manifest, because the two callers need different facts.
- **Mandates do not go inside workflow nodes.** A workflow step names a mandate; it never
  embeds one.
- **Before changing a mandate's inputs, find every place it runs.** Server pipeline, durable
  workflow twins, client surfaces, regeneration paths. A variable rename that misses one caller
  breaks it silently. If a mandate genuinely has multiple instances, every one is your problem.
- **The manifest lives in code; the agent lives in the DB.** The provision (what is offered) and
  the assembly (what is actually sent) are code. The instructions are the agent's stored
  definition. Never fix a delivery gap by editing the prompt.

## THE HONESTY BAR — for whoever writes the completion note

Before you write that something works, you must be able to state:

1. **The question** the mandate asks, in one sentence.
2. **The facts required** to answer it, and where each one comes from.
3. **The measured coverage** — visible / total, on real data, as a number.
4. **The ground-truth check** you ran, and the fabrication count.
5. **What happens at scale**, and what happens when a required input is missing.

Missing any of these, the correct completion note is **"not verified"** — never "done". Writing
"done" over unverified work is the failure this entire skill exists to prevent, and it is worse
than writing nothing, because the next person believes you.
