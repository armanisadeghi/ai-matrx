---
name: agent-provision
description: Design the PROVISION for a call site — the exhaustive menu of values that place in the code can realistically produce, shaped so any candidate agent can be swapped in and actually do the job better. Covers the answerability test (can this question be answered at all with what we send?), condensation and scale tiers, the full-value output rule, and ground-truth verification that catches fabrication. Use BEFORE creating or fixing any mandate/agent that reasons about anything larger than its own input, and whenever an agent's output "looks right" but nobody checked whether it COULD have been right. NOT a substitute for create-agent — that builds the agent; this decides what exists for it to consume.
---

<!-- SYNCED COPY — do not edit here.
     Canonical: common-docs/skills/agent-provision/SKILL.md
     This file is distributed to every consuming repo by
     common-docs/meta/scripts/sync_skills.py. Edit the canonical, run the
     sync, and commit each repo. Edits made here are overwritten and lost. -->

# agent-provision — what the call site offers, and proving the agent knew it

## The three things, and why they are three

| | What it is | Who authors it | Named for |
|---|---|---|---|
| **Provision** | The exhaustive menu of values THIS PLACE IN THE CODE can realistically produce | the developer who owns the call site | the call site / the data |
| **Mandate** | A named job to be done at that place, with an input and output contract | the developer who owns the feature | the job |
| **Agent** | One candidate that consumes some of the menu to do the job | the platform, swappable from a UI | itself |

Get this wrong and everything downstream is theatre.

## 🚨 THE PROVISION LAW — a provision describes the CALL SITE, never one agent

Authored correctly, a provision answers: *"standing at this point in the code, what could I
get my hands on?"* — **everything**, including the same underlying fact offered in several
shapes. Mandates then pick from the menu, and any candidate agent picks differently.

Authored backwards — **the disease** — someone looks at the agent they already have, lists its
variables, and calls that list the provision. Now provision ≈ mandate ≈ agent, one to one to
one. Every layer is decoration: a different agent bound to that mandate can only ever see the
same values, so it can never do the job differently, let alone better. **You paid for three
indirections and bought nothing. You should have just called the agent from code.**

**Measured 2026-08-23:** 218 provisions — **152 (70%) serve exactly one mandate**. 368 mandates
— and **2 bindings have ever been created**. The swap layer this entire architecture exists for
is, in practice, unexercised.

### Three tests, cheapest first

1. **The naming test (instant).** If the provision name, the mandate name and the agent name
   are all the same idea, it is fake. `content_plan.page_family` → `content_plan.p3_family` →
   *Website Factory Family Analyst* is three names for one thing.
2. **The swap test (real).** Could a genuinely different agent be bound to this mandate and do
   the job **better**, using values the current agent ignores? If there is nothing to reach for,
   you did not build a menu.
3. **The stuck test (proof).** If fixing the agent requires editing the provision, the provision
   was derived from the agent. That is the whole disease in one sentence.

The canonical case: `content_plan.p3_family` offers 12 values and **not one of them represents
the site**. So the fabricated internal links cannot be fixed by re-authoring the agent, by
picking a smarter model, or by binding a different agent. The data does not exist to offer.
Nothing about that failure is recoverable at the agent layer.

### Variations ARE the point

A provision is where one fact is offered in several shapes, so different mandates and different
agents can choose the cost/detail trade-off without a code change:

- the **full** list, and the **selected** top-N, and the **summarized** counts/clusters;
- the record with **every** key, and the record with the **few** keys that decide this job;
- the **verbatim** text, and the **condensed** line.

Offering three shapes of one fact is not waste — unused offers are normal and free. Offering
only the shape today's agent happens to want is how you get stuck.

### Provisions live beside their feature

Not in a catch-all. **Measured:** `client_mandates.py` is **4,275 lines, 102 mandates, 35
different feature domains**. Co-location is what reminds the next person which values belong to
which job. `podcast_mandates.py` and `education_mandates.py` show the right shape; anything
still in the catch-all should move to its own feature module as it is touched.

## THE FAILURE THIS SKILL EXISTS TO KILL

An agent is asked a question it **cannot possibly answer** with what we send. It answers
anyway — fluently, plausibly, in the right shape. Someone clicks the button, sees prose and
valid JSON, and marks it done. The output is fabricated, and it gets **stored**, so every later
step treats fabrication as evidence.

This is worse than the feature not existing. A missing feature is a known gap; a confidently
fabricating feature is **falsified evidence that compounds**, making the system look healthy
while moving it further from truth.

**The measured case (2026-08-23, `content_plan.p3_family`).** The mandate asks: *what does this
page cover, what does it leave to its siblings, where does it link?* Everything looked right —
provision declared, `{{family}}` declared and interpolated, well-formed output, rebuilt to the
create-agent bar, two green runs. Then someone measured what actually arrived:

| | |
|---|---|
| Pages on the site | **295** |
| Pages visible to the agent | **1 — itself** (0%) |
| Siblings delivered | **0** |
| Real routes it could legally cite | **2** |
| Internal links it proposed | invented |

`family_context()` returns parent + siblings + children; this page's parent had one child —
itself. So the family comparison ran against an **empty family**, while the genuinely competing
pages (`/research-and-experts/*`, `/learn/evidence/*`) stayed invisible. The one question the
mandate exists to answer was **structurally unanswerable**, and nothing noticed, because the
shape was valid and the prose was good.

**A response is not a result. Valid JSON is not knowledge. "It returned something" is not a
test.**

## THE ANSWERABILITY TEST — before anything else

Take the question the mandate asks. Write down **every fact a competent human expert would need
to answer it**. For each, answer honestly:

1. **Do we have it?** Which table, column, or upstream artifact?
2. **Are we sending it?** Trace the real call site, not the provision. A declared offer nothing
   fills is not delivery.
3. **Is it complete enough?** A cap, a filter, or a tree-shaped slice can silently reduce a
   whole-site question to a one-page answer. Measure `visible / total` on REAL data.

If a required fact is missing there are exactly three honest moves — **inventing a plausible
answer is not one of them**:

- **Build the delivery** (usually a new condensed representation — below), and put it in the
  provision so every future agent can reach it;
- **Cut the question down** to what the data genuinely supports, and change the mandate's
  declared job to match;
- **Refuse**: raise with a named missing input, loudly.

**An agent handed an unanswerable question will always answer it.** That is not a model flaw to
prompt around; it is a design defect on our side.

## BUILDING THE PROVISION — the real work

**Step 1 — inventory.** Every data point that exists at this call site and could matter. Not
what is convenient; what exists. Go find it. This is the step people skip.

**Step 2 — necessity, per mandate.** Which of those does THIS job need? Cut decoration from the
mandate's consumption — but keep it in the provision if another job could want it.

**Step 3 — condensation.** Whatever a job consumes has to fit and be *readable by a model*,
which is not the same as complete. Design the smallest representation that preserves the
decision-relevant signal (for a site: route + short label + role, not page content). Ask:
*could a smart human make this call from this text alone?* If no, condense differently — do not
just add more.

**Step 4 — scale tiers, with a real fallback.** What works at 50 breaks at 6,000. Decide the
threshold BEFORE shipping and decide what happens past it: compartmentalize (relevant branch +
summary of the rest), summarize the far field into counts and clusters, or run a cheap
deterministic pre-filter that selects candidates. **A silent cap is the same defect as a missing
input and harder to see** — offer both shapes in the provision, record the ratio, log it.

**Step 5 — the output, and THE FULL-VALUE RULE.** If a question is worth assembling a large,
expensive context for, **take everything that context makes answerable**, not one slice. An
agent given the whole site to place one page should also write the missing SEO plan while it is
there. Paying for deep context and harvesting one field is the expensive twin of the same
carelessness — and it is what nested output kinds are for.

**Step 6 — the ground-truth check.** Decide in advance how you will verify the answer against
data you hold. Every entity the agent names — route, id, keyword, card, citation, chapter — must
be checkable against the set you sent. If you cannot state the check, the mandate is not
designed yet.

## VERIFYING — what a real test looks like

Three parts. Most "tests" have only the first.

1. **It ran.** Status, shape, schema. Necessary; proves nothing about truth.
2. **It could have been right.** Measure the input on real data — how much of the relevant
   universe did it see? Print the ratio. `1 of 295` is a failing test however good the prose.
3. **It IS right.** Cross-check every named entity against ground truth. Every route exists in
   the list you sent. Every cited id is in the input. Every quote is a verbatim substring.
   **Count the fabrications. The passing number is zero.**

Design tests to make failure visible, never to confirm success:

- **The trap case** — something the agent must catch (an overlapping page, a contradicting rule,
  a fabricated claim). Sailing past it means the test worked.
- **The near-miss** — looks like a hit, must NOT be flagged.
- **The honest-empty case** — the right answer is "nothing". An agent that never returns empty
  is an agent that invents.
- **The adversarial-scale case** — ten near-duplicate pages targeting one keyword. It can only
  be caught if the provision actually delivers the other nine.

🚨 **Never design a test you know you will pass.** A test built from data you hand-picked to
suit the agent proves nothing and manufactures false confidence. **Real data is what wins** —
and when two designs are both plausible, build both and let real data pick, rather than
reasoning your way to a favourite.

**Report what you measured, not what you concluded.** "1 of 295 pages visible; 4 of 4 proposed
links do not exist" is a result. "Verified — output looks good" is not a claim anyone should
accept.

## MANDATE HYGIENE

- **One mandate, one job.** A mandate reused across jobs cannot have a truthful provision,
  because the two callers need different facts.
- **Mandates never go inside workflow nodes.** A workflow step NAMES a mandate; it never embeds
  one.
- **Before changing inputs, find every place the mandate runs** — server pipeline, durable
  workflow twins, client surfaces, regeneration paths. A rename that misses one caller breaks it
  silently.
- **The provision is code; the agent is a DB row.** Never fix a delivery gap by editing a prompt.

## THE HONESTY BAR

Before writing that something works, you must be able to state:

1. **The question** the mandate asks, in one sentence.
2. **The facts required**, and where each comes from.
3. **The measured coverage** — visible / total, on real data, as a number.
4. **The ground-truth check** you ran, and the fabrication count.
5. **What happens at scale**, and when a required input is missing.
6. **The swap test result** — what a different agent could reach for that this one ignores.

Missing any of these, the correct completion note is **"not verified"** — never "done". Writing
"done" over unverified work is worse than writing nothing, because the next person believes you.
