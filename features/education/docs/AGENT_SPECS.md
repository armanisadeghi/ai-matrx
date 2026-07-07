# Education / Flashcards — AI Agent Specs

Build-ready contracts for every AI step in the Flashcards + FastFire system. Each agent is invoked
from the FE via `launchAgentExecution({ agentId, runtime: { variables, userInput? }, config: {...} })`
and read back with `selectFirstExtractedObject(requestId)`. The FE codes against the **response
schema** below; you author + optimize the prompt/rubric. Paste the `json_schema` block straight into
the agent's `response_format`.

Conventions:
- **Inputs** are passed as agent **variables** (substituted into the prompt). `user_request` is an
  optional free-text field for extra guidance.
- **Audio/image inputs** are uploaded to a durable `file_id` first, then attached as a message part
  (`fileHandler.toContentPart` + `setUserInputMessageParts`) — NOT through `userInput` (a string).
- **Persistence** notes where the FE writes the result (or where a baked-in Matrx action auto-persists).

Priority for the current build: **P1** = needed for Wave 3 (create flows), **P2** = Wave 4 (FastFire),
**P3** = later modes.

---

## 1. `fc_generate_cards` — topic → cards  **(P1)**
**Goal:** Turn a topic + constraints into atomic, high-quality flashcards (minimum-information
principle; one idea per card). Honors grade level + difficulty + count.

**Variables:** `topic` (string), `count` (int, target), `difficulty` (`easy|medium|hard`),
`grade_level` (string, optional), `style` (`basic|rich`), `language` (string, optional).
**user_request:** optional ("focus on dates", "AP Bio Unit 3").

```json
{
  "type": "json_schema",
  "json_schema": {
    "name": "fc_generate_cards",
    "strict": true,
    "schema": {
      "type": "object",
      "properties": {
        "set_title": { "type": "string" },
        "cards": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "front": { "type": "string" },
              "back": { "type": "string" },
              "card_kind": { "type": "string", "enum": ["basic","cloze","concept","definition","image_prompt"] },
              "difficulty": { "type": "string", "enum": ["easy","medium","hard"] },
              "topic": { "type": "string" },
              "tags": { "type": "array", "items": { "type": "string" } }
            },
            "required": ["front","back","card_kind","difficulty","topic","tags"],
            "additionalProperties": false
          }
        }
      },
      "required": ["set_title","cards"],
      "additionalProperties": false
    }
  }
}
```
**Persist:** FE `fcService.createSetWithCards({ name: set_title }, cards)`.

---

## 2. `fc_generate_from_source` — knowledge/source → cards WITH lineage  **(P1)**
**Goal:** Turn an ingested source (PDF/notes/RAG chunk) into cards, each tagged with the exact source
passage it came from.

**Variables:** `source_ref` (object: `{ processed_document_id, chunk_ids?, page_range? }`),
`count` (int), `difficulty`, `style`. **user_request:** optional focus.

```json
{
  "type": "json_schema",
  "json_schema": {
    "name": "fc_generate_from_source",
    "strict": true,
    "schema": {
      "type": "object",
      "properties": {
        "set_title": { "type": "string" },
        "cards": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "front": { "type": "string" },
              "back": { "type": "string" },
              "card_kind": { "type": "string" },
              "difficulty": { "type": "string", "enum": ["easy","medium","hard"] },
              "source": {
                "type": "object",
                "properties": {
                  "processed_document_id": { "type": "string" },
                  "chunk_id": { "type": "string" },
                  "page": { "type": "integer" }
                },
                "required": ["processed_document_id","chunk_id","page"],
                "additionalProperties": false
              }
            },
            "required": ["front","back","card_kind","difficulty","source"],
            "additionalProperties": false
          }
        }
      },
      "required": ["set_title","cards"],
      "additionalProperties": false
    }
  }
}
```
**Persist:** cards + `fc_card → file` `source` lineage edges (`fcService.addCards` carries `source`).

---

## 3. `fc_enrich_card` — basic card → rich `fc_detail` layers  **(P1, the "favorite")**
**Goal:** Given ONE card with focused context, write its supplementary detail layers. Run per-card so
the agent is fully focused. The platform's context system supplies what the learner is studying.

**Variables:** `front`, `back`, `topic`, `difficulty`, `existing_details` (array, optional),
`kinds` (array of which to produce, e.g. `["helper","example","detailed","mnemonic"]`).

```json
{
  "type": "json_schema",
  "json_schema": {
    "name": "fc_enrich_card",
    "strict": true,
    "schema": {
      "type": "object",
      "properties": {
        "details": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "kind": { "type": "string", "enum": ["helper","example","detailed","hint","mnemonic","simplified"] },
              "text": { "type": "string" }
            },
            "required": ["kind","text"],
            "additionalProperties": false
          }
        }
      },
      "required": ["details"],
      "additionalProperties": false
    }
  }
}
```
**Persist:** one `fc_detail` row per item (status `text_ready`; audio rendered later via `narrate()`).

---

## 4. `fc_write_helper` — batch "I'm confused" copy → durable audio  **(P1)**
**Goal:** For a batch of cards, write a short, spoken-friendly explanation (the "I'm confused" copy).
Then the FE calls `narrate()` to render durable audio.

**Variables:** `cards` (array of `{ card_id, front, back, topic }`), `voice_style` (string, optional).

```json
{
  "type": "json_schema",
  "json_schema": {
    "name": "fc_write_helper",
    "strict": true,
    "schema": {
      "type": "object",
      "properties": {
        "helpers": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "card_id": { "type": "string" },
              "text": { "type": "string" }
            },
            "required": ["card_id","text"],
            "additionalProperties": false
          }
        }
      },
      "required": ["helpers"],
      "additionalProperties": false
    }
  }
}
```
**Persist:** `fc_detail` (kind `helper`); then `narrate(text)` → `audio_file_id`, status → `audio_ready`.

---

## 5. `fc_grade_spoken` — FastFire: spoken answer → grade + spoken feedback  **(P2)**
**Goal:** Given the learner's spoken-answer audio + the card, return a structured grade + spoken
feedback. Use a native-audio model (e.g. Gemini 3.5 Flash) OR a realtime agent with a score tool.

**Variables:** `front`, `back`, `rubric` (string/object, optional), `seconds_allowed` (int).
**Audio in:** YES — the per-card clip (~1s overlap + buzzer markers), attached as a message part.

```json
{
  "type": "json_schema",
  "json_schema": {
    "name": "fc_grade_spoken",
    "strict": true,
    "schema": {
      "type": "object",
      "properties": {
        "correct": { "type": "boolean" },
        "score": { "type": "number", "description": "normalized 0..1" },
        "result": { "type": "string", "enum": ["correct","partial","incorrect"] },
        "rubric": {
          "type": "object",
          "properties": {
            "accuracy": { "type": "number" },
            "completeness": { "type": "number" },
            "clarity": { "type": "number" }
          },
          "required": ["accuracy","completeness","clarity"],
          "additionalProperties": false
        },
        "transcript": { "type": "string" },
        "audio_feedback": { "type": "string" },
        "missing": { "type": "array", "items": { "type": "string" } }
      },
      "required": ["correct","score","result","rubric","transcript","audio_feedback","missing"],
      "additionalProperties": false
    }
  }
}
```
**Persist:** `study_record_attempt({ itemType:'fc_card', method:'fast_fire', responseKind:'spoken',
result, scoreValue: score, score: <full object> })`. Ideally bake a Matrx action so it auto-persists
server-side before the client reads it.

---

## 6. `fc_help_live` — real-time contextual help (the AI Tutor)  **(P2)**
**Goal:** Answer a mid-drill/mid-study help request using the learner's FULL live context, so a small
fast model gives frontier-quality help. (VISION §4 — the Tutor.)

**Variables:** `front`, `back`, **learner context:** `session_score`, `recent_correct` (array),
`recent_wrong` (array), `struggled_topics` (array), `due_count` (int), `time_on_card_ms` (int),
`card_history` (this learner's past attempts on this card). **user_request:** the learner's question.

```json
{
  "type": "json_schema",
  "json_schema": {
    "name": "fc_help_live",
    "strict": true,
    "schema": {
      "type": "object",
      "properties": {
        "answer": { "type": "string" },
        "hint_level": { "type": "string", "enum": ["nudge","partial","full"] },
        "followups": { "type": "array", "items": { "type": "string" } }
      },
      "required": ["answer","hint_level","followups"],
      "additionalProperties": false
    }
  }
}
```
**Persist:** none (ephemeral). Source-grounded (RAG) per the vision.

---

## 7. `fc_review_batch` — the "professor" grader (per ~10 cards + end of session)  **(P2)**
**Goal:** Review a batch of answers together — patterns, systematic misconceptions, connect-the-dots
narrative, and (when live-adaptation is on) a reorder directive for the not-yet-seen queue. (VISION §3.)

**Variables:** `transcript` (string), `attempts` (array of `{ front, result, score, transcript }`),
`aggregate` (object), `remaining_cards` (array of `{ card_id, front }`).

```json
{
  "type": "json_schema",
  "json_schema": {
    "name": "fc_review_batch",
    "strict": true,
    "schema": {
      "type": "object",
      "properties": {
        "summary": { "type": "string" },
        "strengths": { "type": "array", "items": { "type": "string" } },
        "weaknesses": { "type": "array", "items": { "type": "string" } },
        "revisit_card_ids": { "type": "array", "items": { "type": "string" } },
        "secondary_score": { "type": "number" },
        "reorder": { "type": "array", "items": { "type": "string" }, "description": "card_ids, new order for the remaining queue" }
      },
      "required": ["summary","strengths","weaknesses","revisit_card_ids","secondary_score","reorder"],
      "additionalProperties": false
    }
  }
}
```
**Persist:** append to `study_session.session_review` (jsonb).

---

## 8. `fc_make_quiz_items` — Learn/Test distractors  **(P3)**
**Goal:** Turn a card into an adaptive multiple-choice item with plausible distractors.

**Variables:** `front`, `back`, `topic`, `distractor_count` (int).

```json
{
  "type": "json_schema",
  "json_schema": {
    "name": "fc_make_quiz_items",
    "strict": true,
    "schema": {
      "type": "object",
      "properties": {
        "question": { "type": "string" },
        "correct": { "type": "string" },
        "distractors": { "type": "array", "items": { "type": "string" } },
        "explanation": { "type": "string" }
      },
      "required": ["question","correct","distractors","explanation"],
      "additionalProperties": false
    }
  }
}
```
**Persist:** transient; attempts still write `study_attempt` (method `learn`/`test`).

---

## 9. `fc_expand_card` — struggled card → atomic sub-cards (hierarchy)  **(P3)**
**Goal:** When a learner struggles, split one card into smaller atomic cards and link them.

**Variables:** `front`, `back`, `topic`, `struggle_signal` (string — recent wrong attempts/notes).

```json
{
  "type": "json_schema",
  "json_schema": {
    "name": "fc_expand_card",
    "strict": true,
    "schema": {
      "type": "object",
      "properties": {
        "sub_cards": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "front": { "type": "string" },
              "back": { "type": "string" },
              "relation": { "type": "string", "enum": ["expands_into"] }
            },
            "required": ["front","back","relation"],
            "additionalProperties": false
          }
        }
      },
      "required": ["sub_cards"],
      "additionalProperties": false
    }
  }
}
```
**Persist:** new `fc_card` rows + `fc_card → fc_card` `expands_into` hierarchy edges.

---

## 10. `fc_spoken_question` — authored spoken front/back  **(P3)**
**Goal:** Write the auditory phrasing of a card (the front as a spoken question), distinct from the
literal text → narrate to durable audio.

**Variables:** `front`, `back`, `which` (`front|back`).

```json
{
  "type": "json_schema",
  "json_schema": {
    "name": "fc_spoken_question",
    "strict": true,
    "schema": {
      "type": "object",
      "properties": { "spoken_text": { "type": "string" } },
      "required": ["spoken_text"],
      "additionalProperties": false
    }
  }
}
```
**Persist:** `fc_detail` (kind `spoken_front|spoken_back`) + `narrate()`.

---

## 11. `fc_micro_coach` — per-card micro-coaching tip  **(P3, stretch)**
**Goal:** A one-line, cheap/fast-model tip surfaced immediately after grading a SINGLE card — not the
end-of-session narrative `fc_review_batch` already owns. Optimize for latency (small model, short
output) over depth; this fires on every grade, so it must be near-instant and never block advancing to
the next card (FE dispatches it fire-and-forget — see `features/flashcards/data/tutor/microCoach.ts`).

**Variables:** `front`, `back`, `result` (`correct|partial|incorrect`), `prior_attempts` (array,
optional — this learner's past attempts on this card, for "you keep missing X" specificity).

```json
{
  "type": "json_schema",
  "json_schema": {
    "name": "fc_micro_coach",
    "strict": true,
    "schema": {
      "type": "object",
      "properties": {
        "tip": { "type": "string", "description": "one sentence, spoken-friendly, no markdown" }
      },
      "required": ["tip"],
      "additionalProperties": false
    }
  }
}
```
**Persist:** none (ephemeral, shown as a toast). Register the agent id in
`features/flashcards/data/agents.ts` (`FC_AGENTS.microCoach`) to light this lane up — until an agent
exists, `microCoach()` is a clean no-op.

---

---

## Trust addendum — every agent carries the TrustEnvelope  **(P0, cross-cutting)**

> Contract + types: [`../trust/TRUST_ENVELOPE.md`](../trust/TRUST_ENVELOPE.md) +
> `features/education/trust/types.ts`. This addendum amends the schemas above; it does not replace
> them. At Convergence A, any generation/grading agent NOT honoring this is a defect.

**Every generation agent** (`fc_generate_cards`, `fc_generate_from_source`, `fc_make_quiz_items`,
`fc_enrich_card`, and the P1–P4/P6/P9 generators) adds a `trust` object to each generated item
(per card / per quiz question / per segment) — and MAY repeat it on the containing set:

```json
"trust": {
  "type": "object",
  "properties": {
    "citations": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "sourceId":   { "type": "string" },
          "sourceKind": { "type": "string", "enum": ["document","chunk","section","file","url","scope","transcript","web"] },
          "locator":    { "type": "string" },
          "excerpt":    { "type": "string" },
          "title":      { "type": "string" }
        },
        "required": ["sourceId","sourceKind"],
        "additionalProperties": false
      }
    },
    "confidence": { "type": "string", "enum": ["grounded","inferred","not_in_material"] },
    "groundedIn": { "type": "string" }
  },
  "required": ["citations","confidence"],
  "additionalProperties": false
}
```

Rules baked into the prompt (not a client-side filter):

- **Grounded generation (`fc_generate_from_source` + all P9 kit generators):** each item's
  `trust.citations[]` MUST reference the exact source passage it came from. When the source is fed
  with `### Chunk <chunk_id>` markers (as `CreateFromSource` does), echo that `chunk_id` as
  `sourceId` (`sourceKind:"chunk"`), the page as `locator`, and the verbatim supporting sentence(s)
  as `excerpt`. `confidence:"grounded"`. If a requested item cannot be supported by the material,
  DROP it rather than invent one.
- **Ungrounded generation (`fc_generate_cards` from a topic):** no corpus ⇒ `citations:[]`,
  `confidence:"inferred"`, `groundedIn` omitted. Honest by construction.
- **Grounded answering (`fc_help_live` / the tutor):** answer from the learner's material when it
  supports the question (`confidence:"grounded"`, cite it). When it does NOT, **refuse honestly**:
  return `confidence:"not_in_material"`, `citations:[]`, and phrase the answer as the explicit
  choice — *"That isn't in your material. Want me to answer from general knowledge?"* — never a
  confident fabricated answer. The FE presents the escape hatch; the agent never pretends.

**Grade-on-meaning** (`fc_grade_spoken` today; P1 typed/short-answer next) grades MEANING, not
strings — a paraphrase, synonym, or reordered answer conveying the required idea is `correct`.
Typed/short-answer graders return the `GradeVerdict` shape (adopted as P1's one grading path):

```json
{
  "correct": { "type": "boolean" },
  "partial": { "type": "boolean" },
  "misconception": { "type": ["string","null"], "description": "the NAMED wrong idea, if any" },
  "explanation": { "type": "string", "description": "why, in meaning terms — never 'wrong exact words'" }
}
```

Reference retrofits: `fc_generate_from_source` (real citations) + `fc_help_live` (honest refusal).

---

## P5 — Study Intelligence agents (LIVE, authored 2026-07-07)

Both gemini-flash-class, authored via `agent_author` + verified with `agent_run`. Ids in
`features/education/study/planner/agents.ts` (`STUDY_AGENTS`). Wired with the standard
`launchAgentExecution({ jsonExtraction:{enabled:true}, config:{autoRun:true, displayMode:"direct"} })`
+ `selectFirstExtractedObject` pattern (`usePlannerAgent` / `useAnalyticsNarrative`).

### `Study Planner` — anti-burnout day-by-day schedule  (id `49d3c256-…`)
**Variables (builder-shaped):** `goal_title`, `start_date`, `exam_date`, `daily_minutes`,
`rest_days` (comma-separated weekday NAMES, e.g. "Sunday"), `study_snapshot` (formatted text —
see `coercePlan.buildStudySnapshot`; due/weak/studied counts + weak topics).
**Output:** `{ overall_rationale, days:[{ day_date, is_rest_day, rationale, blocks:[{ target_kind
(review|learn|weak_area|quiz|practice_test|rest|custom), label, estimated_minutes, estimated_items,
topic, method, rationale }] }] }`. Coerced to a generator-agnostic `PlanDraft` (`coercePlanDraft`);
deterministic `buildPlan.ts` is the offline fallback that emits the SAME shape.

### `Study Analytics Narrator` — the narrative over the numbers  (id `13c31086-…`)
**Variables:** `item_label`, `accuracy_pct`, `mastered_count`, `learning_count`, `struggling_count`,
`due_count`, `accuracy_trend` (JSON), `topic_breakdown` (JSON), `total_minutes`, `current_streak`.
**Output:** `{ headline, insights:[{title,detail,severity: good|watch|urgent}],
recommendations:[{action, why, target_kind, topic}] }`. Grounded in the supplied numbers only
(never invents a figure); coerced by `analytics/narrative.ts`.

---

> **Adaptive next-batch selection is NOT an agent** — it's an FSRS algorithm + query over `item_mastery`
> (due/struggle) + `study_goal` topics + the dimension graph. See `lib/srs/fsrs.ts`.

## How the FE invokes one (reference)
```ts
const { requestId } = await dispatch(launchAgentExecution({
  agentId: "<the agent id you create>",
  runtime: { variables: { topic, count, difficulty, style } },
  config: { autoRun: true, displayMode: "direct",
            llmOverrides: { response_format: /* the json_schema block above */ } },
})).unwrap();
const out = selectFirstExtractedObject(requestId)(getState()); // typed object
```
