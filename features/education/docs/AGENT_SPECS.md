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
