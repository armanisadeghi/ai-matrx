---
name: create-agent
description: Create a hyper-specialized, production-grade AI Matrx platform agent through the hosted AI Dream MCP (agent_author / agent_catalog / agent_run), usually paired with a registered content-IR kind for its output. Use whenever anyone asks to create, build, author, or configure a platform agent; needs an agent that produces a specific deliverable; wants a structured/kind-emitting agent; or asks to improve, rename, or re-instruct an existing agent. NOT for Claude Code subagents, .claude/agents files, or aidream's in-process code-runner lane (that lane is aidream's matrx-agents skill).
---

<!-- SYNCED COPY — do not edit here.
     Canonical: common-docs/skills/create-agent/SKILL.md
     This file is distributed to every consuming repo by
     common-docs/meta/scripts/sync_skills.py. Edit the canonical, run the
     sync, and commit each repo. Edits made here are overwritten and lost. -->

# create-agent — hyper-specialized platform agents, done right

## What our agents are (and are not)

AI Matrx is **not Claude Code**. Claude Code hands a capable generalist a vague goal and
lets it figure things out — mistakes are cheap and get fixed. AI Matrx is the opposite: a
platform whose promise is that **mistakes are not made**, because every agent is
hyper-specialized — the exact instructions, the exact variables, the exact context, the
exact tools, and the exact response shape it needs to produce one specific deliverable
with near-perfect reliability. **Nothing more, nothing less.**

- **Specificity is the product.** A great agent takes a complex task and makes it easy by
  being highly specific — so specific that small models match the best models on earth.
- **Duplication is NOT a concern.** Five thousand agents, hundreds nearly identical with
  slight variations, is a platform strength — hyper-focused variants are what we do best.
  The defect to fear is the opposite: a **generic** agent that stuffs everything into user
  input and hopes the model figures it out. That is Claude-Code thinking and it is the
  single most common way coding agents botch our system.
- An agent is a versioned DB row (`agent.definition`); every edit auto-creates an
  immutable version. The MCP (`agent_catalog` / `agent_author` / `agent_run`) is your
  interface — never a raw insert, never SQL.

**The gold standard to study before you build anything:** `agent_catalog get_agent` on
`80e453a0-68e0-4750-868d-3198d3a33639` ("Keyword Analysis Master"). A builder-made family
that followed this skill end to end (kinds first, workflow-bound, first run green): the
Study Pack v2 composers — `21bb212a-6ae8-4b4c-b507-f82efbb7f972` (notes),
`79c667eb-0061-46ae-9ec3-9ffdcc51ee23` (flashcards), `3d0632fd-399c-4684-882c-f60122992d8a`
(quiz), `bb88d07b-4ab8-41d3-af0f-84b9cfb565a7` (lessons). Its kind pair lives at
`matrx-frontend/features/content-ir/kinds/keyword-research.ts` and renders through
`components/mardown-display/blocks/keyword-research/KeywordResearchBlock.tsx`. Every rule
below is visible in that one agent.

## The order of operations

Work these steps in order. Skipping ahead (especially straight to "call create") is how
bad agents get made.

### 1. Source the intent, then nail the exact task and deliverable

**Where the task comes from matters as much as what it is.** If the agent is part of a
designed system (a feature, a Masterwork tier, a mandate), its goals live in that
system's VISION/FEATURE docs — read them FIRST, and search EXHAUSTIVELY: the vision is
usually plural (`systems/<domain>/VISION.md` + DECISIONS/STATE, ratified design records,
archived corpora, repo-local design-of-record docs), and the agent or feature may have
carried other names. One document is not the vision — the Plan Steward's first fix was
rebuilt from one corpus and missed the approved design of record naming its second,
co-equal caller. The call site only tells you delivery mechanics; an existing agent
definition is NOT evidence of intent (it may itself be the botched thing you're
replacing — restructuring it faithfully just polishes the drift).
The Plan Steward incident (2026-08-22) is the canonical case: authored from its call
site, it became a note-taking scribe with the emission verbs sitting unused in its own
tool, while the vision said "plans exist to be emptied out." Capability present, mission
forbidden — because nobody read the vision.

Then write one sentence: what goes in, what comes out, and who/what consumes the output
— **and one more: what DONE looks like for this agent.** If you cannot state the
deliverable and DONE exactly, you are not ready to create an agent.

### 2. Decide the exact inputs — variables vs context

- A **variable** is immutable and delivered once, at turn 1. It substitutes `{{name}}`
  into the agent's own authored messages. Anything whose value can change during the
  conversation is **by definition context** (a context policy: re-resolved every turn,
  size-tiered inline/deferred, optionally mutable).
- List every variable and every context value, and mark each **mandatory or optional**.
  Exact inputs — not "the user's message with everything in it."
- **`user_input` is human-typed text only.** Never smuggle a document, transcript, JSON
  payload, or schema through it; never fuse five things into one blob variable; never
  deliver the same value through two channels. (`aidream/scripts/check_user_input_law.py`
  polices this.)
- A **conversational agent** is a deliberate shape: zero variables, system prompt only,
  because the user's typed text IS the first turn. Run and test it with `user_message`,
  never `variables`.
- **THE SYSTEM-PROMPT LAW (Arman, 2026-08-22).** The system prompt carries the agent's
  core, static instructions — role, rules, definitions, output format, earned examples.
  The specifics of THIS run — ids, the object being worked on, the task — go in the
  **first user message** (immutable values as variables embedded in conversational human
  language) or in **context** (anything that can change during the conversation). Models
  were trained on a static system prompt + specific user turns; breaking that shape
  degrades every result, and interpolating a "current snapshot" into the system prompt
  guarantees it is stale by message two. The only legitimate system-prompt variable is a
  **behavior switch** (verbose/terse, strict/exploratory, audience) — never the task — and
  it sits LOW in the prompt, after the core guidelines. Canonical offender: the Plan
  Steward opened its system prompt with `{{plan_id}}`, `{{definition_id}}` and a
  `{{plan_snapshot}}` block — converted 2026-08-22 (ids → opening user message, snapshot →
  a `plan_snapshot` context policy the client re-delivers each turn).

### 3. Decide tools and skills — minimal by design

Our agents do not fumble through chains of tool calls to find what they need — we hand
them exactly what they need, when they need it, in the form they need it. Most
specialized agents need **zero tools**. Assign tools only when the job genuinely requires
an action, using canonical names from `agent_catalog list_tools` via the `tools` field
(`tool_config` does NOT assign tools — a `tools` key inside it is rejected).

**Skills on agents are the exception, not the rule.** Our system delivers instructions in
the system prompt directly, not behind an extra tool call. Attach skills only to
deliberately highly-agentic agents.

### 4. Decide the exact response — markdown or kinds, nothing else

Two legitimate response forms:

- **Free-form text/markdown** — only when the output is purely presentational prose (a
  blog post, a podcast script, an answer a human reads).
- **Content-IR kinds** — for everything else. Any output that gets passed to another
  agent, rendered as a component, or consumed by any part of the system is emitted as
  `__kind` JSON. The agent can return **one kind or several kinds embedded in its text
  response** — the platform captures them perfectly either way. An `output_schema`
  (`create_structured`, provider-enforced) is for when the consumer needs guaranteed
  parseable JSON; embedded kinds in a text response need no schema at all.

**Kind nesting doctrine (Arman's):** a `__kind` wrapper around a blob of raw JSON is
useless. Shapes are **nested** — any time there is a list, the list items get their own
kind, and the whole result gets a wrapper kind. One layer is rarely enough; three or more
is sometimes needed; **most shapes end up two levels** (e.g. `keyword_list` items inside
`keyword_relationship_research`).

### 5. Create and register the kind FIRST

Before creating the agent, create its output kind and component so the first test runs
exercise both. A kind without a registered shape/component is useless — and so is a
component-less `__kind` wrapper.

- Via MCP: run the kind-builder agents with `agent_run` — **`kind_architect`**
  (`9d484ce1-1e2b-4db7-8469-d3ba8550cdd8`, admin one-shot: `kind_create` composes the
  nested child kinds from ONE `__kind`-marked sample, then component + skill + content
  blocks + `kind_activate`). It is **variable-driven**: pass
  `variables={"user_data_sample": <the __kind JSON sample, nested>, "task_brief": <slug,
  label, what the component must do, which lists stream>}`. **`kind_creator`**
  (`4f4ffd49-db15-4a2e-b9fe-341ffafc1323`) is the conversational guided loop — drive it
  with `user_message`. Check `get_agent` before driving either; the shape can change.
- **Two mechanics observed 2026-08-23 (flashcards wave):** (a) `agent_run` on Kind Architect
  ALWAYS exceeds the MCP call timeout — the run keeps going server-side, so treat it as
  fire-and-track: check `content_ir.kind_definition` (or `conversations search <slug>`) a
  couple of minutes later instead of re-firing (a re-fire mints duplicates). (b) Kind
  Architect writes kinds under the CALLER's org as `visibility=internal`; a **platform** kind
  (anything a mandate declares as `output_kind`) must then be promoted to the system org
  `39c38960-d30c-4840-b0c1-c9960de95582` + `visibility=public` — definition, components,
  examples, edges — or learners outside your org get the generic renderer. Feedback
  `91bd0093` asks for a `scope`/`kind_promote` fix; until then, promote by hand.
- Component bar: dense (minimal padding, no wasted space), mobile-friendly, interactive
  where the data invites it (drag-and-drop, sort, edit, add/remove for lists), one-click
  copy per section plus compact whole-result copy affordances (JSON / MD / CSV / TXT /
  XML-for-AI), and **streaming-first — a requirement, not a feature**: the value arrives
  progressively during the LLM stream, so the component ships its own brief skeleton that
  mimics the finished layout (never the generic fallback, never spinner-until-complete),
  renders each list item the moment it parses, lets prose grow as it streams, and reveals
  structured details in chunks. A component that waits for the complete object is broken
  by definition. Expect to iterate with the builder agent several times — first output is
  never the final component.
- Never hand-insert `content_ir` rows or build a parallel registry.

### 6. Hand the structure to the trained builder

`agent_author create` (or `create_structured` when a provider-enforced schema is needed).
Supply structure — the trained builder writes the prompt:

- `name` — a **Title Case Pretty Name** ("Keyword Analysis Master"), never
  `snake_case_garbage`. Verify after create; fix with `update` if the builder mangled it.
- `goals` — the exact job, the deliverable, and the non-negotiable guardrails as intent
  bullets. Include the exact output format you decided in step 4 (the `__kind` structure,
  field by field).
- `variables` — the exact list from step 2, each with **teaching help text** (see below),
  marked required/optional.
- `sample_inputs` (+ `sample_output` for structured) — real, runnable sample data; long
  values by location, never pasted blobs.
- `model_guidance` — cost/speed/intelligence priorities only; the builder never picks
  your final model (you do, next step).

**What the builder gets wrong, observed (2026-08-22, Study Pack v2):** it writes a
strong system prompt and even sensible input components, but its authored **user turn
comes back form-like** ("Topic: {{topic}}\nAudience: {{audience}}"). Read the agent back
and rewrite that turn as a real human request (see "Anatomy" below) with
`update({"messages": [...]})` — `messages` is editable and replaces the whole array, so
resend the system message verbatim. `variable_definitions` is ALSO editable (full-array
replace: `[{name, helpText, required, defaultValue}]`) — the way to add or re-document
variables (`variables` itself is refused). One `update` may carry `model_id` +
`variable_definitions` + `messages` together, so a whole agent flip is one versioned call. Optional variables render as empty strings, so keep
them on labeled lines after the conversational opening rather than mid-sentence.

For structured output, the schema must pass the provider gate: object root,
`additionalProperties: false` on every object, every property in `required` (optional =
`["<type>","null"]` union). Iterate with `validate_schema`; `create_structured` creates
nothing on failure.

### 7. Immediately override the model

The builder's default model is never the final answer. `agent_author update` with a
`model_id` chosen from `agent_catalog list_models`. Current favorites (Arman, 2026-08 —
verify against `list_models`, favorites change monthly):

- **Gemini Flash (current gen)** — the default for most everything: intelligent and fast.
- **Anthropic Opus (current gen)** — high intelligence where the run will NOT become a
  long tool-call chain (cost).
- **Anthropic Sonnet (current gen)** — intelligence WITH tool calls.

Then tune `settings` for that model (max_tokens, temperature, streaming) and re-check the
`tools` assignment. 🚨 **When moving an agent ONTO an Anthropic model, strip any
`reasoning_effort` / `reasoning_summary` keys from `settings` if the agent has an output
schema** — the reasoning + structured-output combination silently truncates at ~800
tokens and backfills required fields with literal "placeholder" strings (feedback
`0788c8a5`, found 2026-08-23 when ten re-tiered agents carried legacy Gemini settings).
Also drop any legacy `settings.response_format` block — the platform derives structured
output from `output_schema`; a stale provider-tuned duplicate is a second copy of the
schema that can only drift.

### 8. Run, assess, refine — at least twice

`agent_run` with your real sample data (`variables` for variable-driven agents,
`user_message` for conversational ones). Judge the output against the deliverable from
step 1. Refine the system prompt with `update` and run again. Two runs minimum — this
also exercises the kind component twice so you catch shape problems now, not in
production. An agent that has never been run is not created; it is a liability.

### 9. Earn the examples

Examples inside a system prompt are one of the most powerful levers we have — and
**fabricated examples are banned.** Quality examples cannot be invented up front; they
come from tuning. The flywheel: tune the agent → when a run produces a genuinely great
response, capture that response → bake it into the system prompt as an example → the
agent gets permanently better. Never let an agent (including you) pad a prompt with
plausible-looking invented examples; that is fake specificity.

## Anatomy of a great agent

What the Keyword Analysis Master shows, and every agent you create should have:

1. **Title Case Pretty Name.** (The snake_case agents in the catalog are the known-bad
   ones — the ugly name is the marker.)
2. **A description that informs and sells** — what this agent does and what it is the
   best in the world at. When one agent calls another, the description and variable help
   text are ALL the calling agent can see. Write for that reader.
3. **A system prompt that teaches the HOW — and above all, the goal.** Its composition:
   role and identity — including its POSTURE: an agent whose job is an outcome must be
   told it OWNS the outcome ("users bring you ideas; you build the thing"), or it will
   act as a polite assistant awaiting instructions · **the goal and what DONE looks like
   (the single most important part — clear, unambiguous instructions about the primary
   task)** · the available information and where truth comes from · the tools AND how
   each one serves the goal — **tool definitions do not drive behavior; an agent with a
   specific job must be taught the job, tool by tool** · **the reference data the job
   always needs, embedded directly** (THE BAKED-KNOWLEDGE LAW: anything the agent will
   ALWAYS end up needing — a catalog of step types, a fixed vocabulary, the platform's
   contracts — goes verbatim in the system prompt, where it is cached; making every
   session fetch or guess what it always needs is waste and produces guessing. The
   Steward guessed step-type names 'agent'/'ai_agent' live because nobody gave it the
   catalog. Things it MAY need go in skills — NAMED in the prompt, with when-to-use) ·
   output specifications (the exact format, a literal `__kind` JSON template when
   structured) · adaptation — when to act versus when to ask · strict rules with
   precedence, precise definitions of every term of art, and hard-earned examples. The
   user message then carries the WHAT: it puts the agent to work on the result,
   immediately.
4. **An authored user message with variables embedded in conversational human language.**
   This is one of the most important factors in our whole system. Models are trained on
   trillions of tokens of human input — a natural request outperforms a structured dump
   every time. Structure your input, yes, but frame it as a real person asking:
   > "I need assistance with keyword research for this extremely important project.
   > Please give me an in-depth list of keywords for {{primary_keyword}}. …"
   Never a bare `{{variable}}` dump, never a wall of key: value pairs as the user turn.
   The user message is also WHERE the run's specifics live (ids, the object in hand) —
   per THE SYSTEM-PROMPT LAW the system prompt never anchors itself to one run.
5. **Teaching help text on every variable.** Help text is critical for humans AND for
   agent-to-agent calling. It teaches — what the value is, how to choose it, what to do
   when you don't have one — not "enter a value":
   > "Enter the primary keyword you are targeting, and if you don't have a primary
   > keyword, then choose the best keyword that represents the product, service or topic
   > you are focused on."
6. **Context policies** for anything mutable or large; **run-time user text** reserved
   for focusing or modifying behavior on a given run (e.g. "keep it dynamic, modern,
   professional, with a touch of color"), never for delivering the inputs.
7. **A category and tags reused from the live facet tree** (`list_agents` with no filter
   shows it). Inventing "Research & Analysis" when "Analysis & Research" exists is how
   the catalog became unfilterable.

## Mechanics you must not get wrong

- Every `update` auto-creates a version. **Pin a version** (`list_versions` → newest →
  `is_version=true`) for any code or long-lived caller; run the live row only ad-hoc.
- `update` refuses unknown keys — loudly. That is a feature; fix your key, don't retry
  blind. Known-editable: `model_id`, `settings`, `category`, `tags`, `tools`, `tool_config`,
  `skill_config`, `output_schema`, `card_visibility`, `messages` (replaces the whole array —
  resend the system message verbatim), `variable_definitions` (replaces the whole list —
  the way to drop a variable the builder invented, e.g. a learner's question that belongs on
  `user_input`).
- `updates.tools` REPLACES the whole tool set; omitted = unchanged; `[]` = remove all.
- Never claim success without the returned `agent_id` + `version_id`, a read-back
  (`get_agent`), and at least one real run.
- An agent destined to fulfill a **mandate**: match the mandate's declared shape (the
  Provision is its input contract; `output_kind` its output). A `launch_agent` /
  assist-chip mandate agent must be the conversational zero-variable shape. A
  structured-output agent that any page with write targets can launch needs
  `tool_config.auto_tools_disabled = true`, or it pauses forever calling
  `apply_surface_write` instead of returning JSON.

## Rescuing a blob agent — the proven conversion recipe

Many existing agents were built lazily: one or two `digest` / `*_json` variables the call
site `json.dumps`es a whole dict into — plausible at first glance, awful in practice.
Converting one is a two-sided operation (agent + call site). This recipe was proven live
on the Masterwork Approach Selector and Coherence Partner (2026-08-22):

1. **Read the call site FIRST.** The Provision declared beside the mandate already names
   the granular offer — that IS your variable list. The census of blob sites lives at
   `aidream/docs/mandates/INPUT_CHANNEL_VIOLATIONS.md`; update the row when you convert.
   🚨 If the call site is a factory-generated NamedAgent (imported from
   `internal_agents/_generated/`), STOP — its typed `Inputs` class and spec govern the
   variables, and rebuilding via `scripts/build_agents.py` re-runs the trained builder,
   which CLOBBERS hand-tuned live prompts. That family converts through the factory spec
   with the prompt-preservation question settled first, never by a DB-side agent edit.
   Likewise stop if the mandate is client-invoked from matrx-frontend and the census for
   it hasn't run — renaming variables would break callers you cannot see from aidream.
2. **Hunt for prompt lies while you're in there.** Blob agents routinely claim inputs
   they never receive (the Selector's prompt promised "Audition results" no call site
   sends) and carry enums out of sync with the code's contract. The prompt must describe
   exactly what arrives; code contracts win on enums and keys.
3. **Update the agent first, then the call site, in the same session.** New agent + old
   code fails LOUD (missing required variables, retried next run); new code + old agent
   fails QUIET (an empty `{{blob}}` and granular values reaching nothing). Loud beats
   quiet — agent first.
4. **Pass raw dicts and lists as separate variables at the call site** — the prompt door
   (`prompt_safe_value`) canonicalizes them, so delete every `json.dumps`. An offered
   value the agent doesn't consume simply stays offered; unused offers are normal.
5. **Don't rewrite what's working.** Delivery is often the whole crime while the system
   prompt is genuinely good (the Coherence Partner's was). Judge each part separately:
   name, description, variables + help text, system prompt, user message, delivery.
6. **Test with trapped scenarios, never happy paths**: a recency/ledger block it must
   honor, a maturity gate, false candidates it must drop, settled memory it must not
   re-raise, and a case where the honest answer is zero/empty. Tune the prompt from what
   real runs show (a leaked id, a jargon slip), then re-run to confirm the fix.
7. **Close the loop**: run the guards (`check_user_input_law.py`) and the owning
   service's tests, update the register row, and commit agent + code changes together.

## Anti-patterns — reject on sight

| Anti-pattern | Why it's a defect |
|---|---|
| Generic do-anything agent | The opposite of what our platform is; genericness, not duplication, is the failure |
| Values stuffed into `user_input` | Violates the user-input law; inputs are variables/context |
| Blob-in-a-variable (`everything_json`) | Silent-failure hedge; defeats granular delivery |
| `snake_case` or ugly names | Known marker of botched agents; names are Title Case Pretty Names |
| "Enter a value" help text | Help text must teach — it's the agent-to-agent API surface |
| Invented examples in the prompt | Examples are earned from great real runs, never fabricated |
| Skills attached by default | Instructions belong in the system prompt; skills are for highly-agentic exceptions |
| Tool piles "just in case" | Agents get exactly what they need; they don't forage |
| Variables on a conversational agent | Zero-variable shape is deliberate; run with `user_message` |
| Task ids / the current object / a snapshot in the SYSTEM prompt | THE SYSTEM-PROMPT LAW — specifics ride the first user message (ids) or context (mutable); a snapshot in the system prompt is stale by turn 2 |
| Mutable value sent as a variable every turn | Variables substitute once at turn 1; later sends reach nothing — declare a context policy |
| Flat `__kind` wrapper around raw JSON | Kinds are nested; lists get item kinds; ~2 levels typical |
| Kind emitted with no registered shape/component | A kind without a component is useless |
| Invented category/tags | Reuse the live facet tree |
| Never actually run | Two real runs minimum before "done" |
| Raw `agx_agent` insert / SQL | Everything goes through the MCP and the trained builder |
| Agent authored from its call site or its existing definition | The vision/FEATURE docs are the intent source; the call site is mechanics; the old definition may BE the drift |
| No goal / no DONE in the system prompt | An agent that hasn't been told its mission optimizes for being agreeable, not for the result |
| Tool list as the teaching | Tool definitions don't drive behavior — each tool needs a "how this serves the goal" in the prompt |
| Always-needed reference data left out of the prompt | The agent fetches or GUESSES it every session (the Steward invented step-type names live); bake it in — it caches |
| Outcome-owning agent framed as an assistant | It defers to the user instead of solving; posture is part of identity |

## The four showable artifacts — how this skill is enforced

The minimum-effort failure is real: coding agents asked to "define an agent" as one step
of a bigger task reliably do the least that produces a row. So a create or update is
**rejected work** — by any reviewer, human or agent — unless its author can show, on
request:

1. **The intent sources** — the vision/FEATURE docs actually read, by path.
2. **The goal + DONE sentences** — verbatim from the system prompt.
3. **The tool→goal mapping** — for every assigned tool, the line in the prompt that
   teaches how it serves the mission.
4. **The WHAT user message** — the authored conversational user turn that puts the agent
   to work on the result.

No artifacts, no agent. "It has the right tools" is not a defense — tools without a
taught mission produced a Steward that refused to build.

## Done means

Intent sourced from the vision/FEATURE docs (paths citable) · goal + DONE stated in the
system prompt · every tool taught in service of the goal · deliverable stated exactly · inputs split correctly into variables/context with
mandatory/optional marked · kind(s) registered and component rendering · agent created
via the builder with a pretty name, teaching description and help text, conversational
embedded user message · model overridden and settings tuned · tools exact and minimal ·
run at least twice on real sample data and judged against the deliverable · `agent_id` +
pinned `version_id` recorded for any code caller.
