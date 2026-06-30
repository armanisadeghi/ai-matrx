<agent export="basics">
<context>
<location>AI Matrx — Agent View</location>
<url>https://www.aimatrx.com/agents/1fd0cb1f-5b95-49f0-a7f8-79308dc50f58</url>
<route>/agents/1fd0cb1f-5b95-49f0-a7f8-79308dc50f58</route>
<copied-at>2026-06-30T06:12:09.412Z</copied-at>
<export-mode>basics</export-mode>
</context>

<details>
Agent details:

Agent Name: Flashcard Generator
agentType: "user"
Version: 2

This agent's permanent ID that always tracks the latest version is:
Agent ID: 1fd0cb1f-5b95-49f0-a7f8-79308dc50f58

If you need a permanent pointer to this exact version that will be frozen, you must use:
is_version=True
id="ea25a624-f757-4d1e-8504-3c9439a75c82"

Model ID: 979205fd-e10d-494f-8512-972309dc34e5
Model name: gemini-3.5-flash

"variableDefinitions":
[
  {
    "name": "topic",
    "helpText": "What topic should the flashcards cover? Be as specific or broad as you like — e.g. 'Mitosis and Meiosis', 'The French Revolution', 'JavaScript Promises'.",
    "required": false
  },
  {
    "name": "count",
    "helpText": "How many flashcards do you want generated?",
    "required": false
  },
  {
    "name": "difficulty",
    "helpText": "Choose the overall difficulty level for the card set.",
    "required": false
  },
  {
    "name": "grade_level",
    "helpText": "Who is this card set for? This calibrates vocabulary, depth, and framing.",
    "required": false
  },
  {
    "name": "user_request",
    "helpText": "Optional: any additional focus or constraints — e.g. 'focus on key dates', 'AP Bio Unit 3', 'emphasize mechanisms over definitions', 'include image prompts for diagrams'.",
    "required": false
  }
]
</details>

</agent>

<agent export="basics">
<context>
<location>AI Matrx — Agent View</location>
<url>https://www.aimatrx.com/agents/f728ac6b-8504-4b8c-83fc-5f9df947d6a9</url>
<route>/agents/f728ac6b-8504-4b8c-83fc-5f9df947d6a9</route>
<copied-at>2026-06-30T06:12:20.930Z</copied-at>
<export-mode>basics</export-mode>
</context>

<details>
Agent details:

Agent Name: Flashcard Generator — From Source
agentType: "user"
Version: 3

This agent's permanent ID that always tracks the latest version is:
Agent ID: f728ac6b-8504-4b8c-83fc-5f9df947d6a9

If you need a permanent pointer to this exact version that will be frozen, you must use:
is_version=True
id="65c8e83e-1f84-4a8b-9517-547f9c0b4010"

Model ID: 979205fd-e10d-494f-8512-972309dc34e5
Model name: gemini-3.5-flash

"variableDefinitions":
[
  {
    "name": "source_content",
    "helpText": "Paste the source text to generate flashcards from — notes, a PDF passage, a RAG chunk, or any document content. Include page markers (e.g. 'Page 4') if available for lineage accuracy.",
    "required": false
  },
  {
    "name": "document_id",
    "helpText": "The processed_document_id for this source. This is used to tag every card with its exact source origin for lineage tracking.",
    "required": false
  },
  {
    "name": "count",
    "helpText": "How many flashcards should be generated from this source?",
    "required": false
  },
  {
    "name": "difficulty",
    "helpText": "The difficulty level to target across the generated cards. 'Mixed' distributes across all three levels proportionally.",
    "required": false
  }
]
</details>

</agent>

<agent export="basics">
<context>
<location>AI Matrx — Agent View</location>
<url>https://www.aimatrx.com/agents/9f8eab67-96e4-4a08-9563-7a982f920527</url>
<route>/agents/9f8eab67-96e4-4a08-9563-7a982f920527</route>
<copied-at>2026-06-30T06:12:32.183Z</copied-at>
<export-mode>basics</export-mode>
</context>

<details>
Agent details:

Agent Name: Flashcard Enrichment — fc_enrich_card
agentType: "user"
Version: 3

This agent's permanent ID that always tracks the latest version is:
Agent ID: 9f8eab67-96e4-4a08-9563-7a982f920527

If you need a permanent pointer to this exact version that will be frozen, you must use:
is_version=True
id="8d6648e7-f8e7-457a-b40e-650cc026bf89"

Model ID: 979205fd-e10d-494f-8512-972309dc34e5
Model name: gemini-3.5-flash

"variableDefinitions":
[
  {
    "name": "front",
    "helpText": "The front of the flashcard — the question, term, or prompt the learner is asked to recall.",
    "required": false
  },
  {
    "name": "back",
    "helpText": "The back of the flashcard — the answer, definition, or response.",
    "required": false
  },
  {
    "name": "topic",
    "helpText": "The subject area or course context for this card (e.g. \"AP Biology — Cell Respiration\", \"Bar Exam — Constitutional Law\", \"3rd Grade Math — Fractions\").",
    "required": false
  },
  {
    "name": "difficulty",
    "helpText": "The difficulty level of this card. This calibrates vocabulary, depth, and example complexity across all generated details.",
    "required": false
  },
  {
    "name": "kinds",
    "helpText": "Select which detail layer types to generate for this card. Each selected kind will appear exactly once in the output.",
    "required": false
  },
  {
    "name": "existing_details",
    "helpText": "Optional. Paste any detail layers already written for this card so the agent avoids duplicating them. Leave blank if this is a fresh card.",
    "required": false
  }
]
</details>

</agent>

<agent export="basics">
<context>
<location>AI Matrx — Agent View</location>
<url>https://www.aimatrx.com/agents/df0e6c90-e1f2-4530-a766-f8b3302083f9</url>
<route>/agents/df0e6c90-e1f2-4530-a766-f8b3302083f9</route>
<copied-at>2026-06-30T06:12:46.235Z</copied-at>
<export-mode>basics</export-mode>
</context>

<details>
Agent details:

Agent Name: Flashcard Helper Writer
agentType: "user"
Version: 3

This agent's permanent ID that always tracks the latest version is:
Agent ID: df0e6c90-e1f2-4530-a766-f8b3302083f9

If you need a permanent pointer to this exact version that will be frozen, you must use:
is_version=True
id="500df883-74bb-482d-b0c5-07a9d4961a87"

Model ID: 979205fd-e10d-494f-8512-972309dc34e5
Model name: gemini-3.5-flash

"variableDefinitions":
[
  {
    "name": "cards",
    "helpText": "Paste the JSON array of flashcards. Each card should include card_id, front, back, and topic. Example: [{\"card_id\": \"abc123\", \"front\": \"What is osmosis?\", \"back\": \"The movement of water across a semipermeable membrane from low to high solute concentration.\", \"topic\": \"Cell Biology\"}]",
    "required": false
  },
  {
    "name": "voice_style",
    "helpText": "Choose the tone and delivery style for the spoken helper scripts.",
    "required": false
  }
]
</details>

</agent>

<agent export="basics">
<context>
<location>AI Matrx — Agent View</location>
<url>https://www.aimatrx.com/agents/e0449378-370f-4b08-baec-5bd6128d3c64</url>
<route>/agents/e0449378-370f-4b08-baec-5bd6128d3c64</route>
<copied-at>2026-06-30T06:12:54.066Z</copied-at>
<export-mode>basics</export-mode>
</context>

<details>
Agent details:

Agent Name: FastFire: Grade Spoken Answer
agentType: "user"
Version: 3

This agent's permanent ID that always tracks the latest version is:
Agent ID: e0449378-370f-4b08-baec-5bd6128d3c64

If you need a permanent pointer to this exact version that will be frozen, you must use:
is_version=True
id="4b109c3c-bae9-419d-848f-2584be970430"

Model ID: 979205fd-e10d-494f-8512-972309dc34e5
Model name: gemini-3.5-flash

"variableDefinitions":
[
  {
    "name": "front",
    "helpText": "The front of the flashcard — the question, term, or prompt shown to the learner.",
    "required": false
  },
  {
    "name": "back",
    "helpText": "The back of the flashcard — the canonical correct answer used for grading.",
    "required": false
  },
  {
    "name": "rubric",
    "helpText": "Optional grading criteria or key concepts required for a correct answer. Leave blank to have the grader infer criteria from the card back.",
    "required": false
  },
  {
    "name": "seconds_allowed",
    "helpText": "The number of seconds the learner was given to answer.",
    "required": false
  }
]
</details>

</agent>

<agent export="basics">
<context>
<location>AI Matrx — Agent View</location>
<url>https://www.aimatrx.com/agents/9035ed6e-a936-488d-9e9b-582cc6effb7d</url>
<route>/agents/9035ed6e-a936-488d-9e9b-582cc6effb7d</route>
<copied-at>2026-06-30T06:13:01.324Z</copied-at>
<export-mode>basics</export-mode>
</context>

<details>
Agent details:

Agent Name: FC Help Live — AI Tutor
agentType: "user"
Version: 3

This agent's permanent ID that always tracks the latest version is:
Agent ID: 9035ed6e-a936-488d-9e9b-582cc6effb7d

If you need a permanent pointer to this exact version that will be frozen, you must use:
is_version=True
id="5cc99d00-1288-45f2-aad3-9e7673e1da94"

Model ID: 979205fd-e10d-494f-8512-972309dc34e5
Model name: gemini-3.5-flash

"variableDefinitions":
[
  {
    "name": "front",
    "helpText": "The front (prompt side) of the flashcard the learner is currently on.",
    "required": false
  },
  {
    "name": "back",
    "helpText": "The back (answer side) of the flashcard the learner is currently on.",
    "required": false
  },
  {
    "name": "card_history",
    "helpText": "This learner's past attempt history on this specific card (e.g., previous ratings, number of times seen, streak).",
    "required": false
  },
  {
    "name": "learner_context",
    "helpText": "Live session snapshot — JSON string containing session_score, recent_correct, recent_wrong, struggled_topics, due_count, and time_on_card_ms.",
    "required": false
  },
  {
    "name": "user_request",
    "helpText": "The learner's help request, typed mid-drill.",
    "required": false
  }
]
</details>

</agent>

<agent export="basics">
<context>
<location>AI Matrx — Agent View</location>
<url>https://www.aimatrx.com/agents/780fb7ab-bb27-47e9-8aeb-d9d1ed032901</url>
<route>/agents/780fb7ab-bb27-47e9-8aeb-d9d1ed032901</route>
<copied-at>2026-06-30T06:13:08.585Z</copied-at>
<export-mode>basics</export-mode>
</context>

<details>
Agent details:

Agent Name: Flashcard Batch Reviewer
agentType: "user"
Version: 3

This agent's permanent ID that always tracks the latest version is:
Agent ID: 780fb7ab-bb27-47e9-8aeb-d9d1ed032901

If you need a permanent pointer to this exact version that will be frozen, you must use:
is_version=True
id="b11a96dc-86b5-4063-804d-fbb613e9a94a"

Model ID: 979205fd-e10d-494f-8512-972309dc34e5
Model name: gemini-3.5-flash

"variableDefinitions":
[
  {
    "name": "transcript",
    "helpText": "The full session transcript up to this batch review point.",
    "required": false
  },
  {
    "name": "attempts",
    "helpText": "JSON array of attempt records: [{ front, result, score, transcript }, ...]",
    "required": false
  },
  {
    "name": "aggregate",
    "helpText": "JSON object summarizing aggregate session performance so far.",
    "required": false
  },
  {
    "name": "remaining_cards",
    "helpText": "JSON array of remaining cards not yet seen: [{ card_id, front }, ...]",
    "required": false
  }
]
</details>

</agent>

<agent export="basics">
<context>
<location>AI Matrx — Agent View</location>
<url>https://www.aimatrx.com/agents/03ea2bc2-2c2a-426d-8ea9-21799ae1f05d</url>
<route>/agents/03ea2bc2-2c2a-426d-8ea9-21799ae1f05d</route>
<copied-at>2026-06-30T06:13:16.462Z</copied-at>
<export-mode>basics</export-mode>
</context>

<details>
Agent details:

Agent Name: Quiz Item Generator
agentType: "user"
Version: 3

This agent's permanent ID that always tracks the latest version is:
Agent ID: 03ea2bc2-2c2a-426d-8ea9-21799ae1f05d

If you need a permanent pointer to this exact version that will be frozen, you must use:
is_version=True
id="af79aa4d-5903-4c12-a0b0-546045c82841"

Model ID: 979205fd-e10d-494f-8512-972309dc34e5
Model name: gemini-3.5-flash

"variableDefinitions":
[
  {
    "name": "front",
    "helpText": "The front of the flashcard — typically the question, term, or concept being tested.",
    "required": false
  },
  {
    "name": "back",
    "helpText": "The back of the flashcard — the correct answer, definition, or explanation.",
    "required": false
  },
  {
    "name": "topic",
    "helpText": "The subject or topic this card belongs to (e.g. 'Cell Biology', 'U.S. Constitutional Law', 'Calculus'). Helps generate contextually accurate and appropriately calibrated distractors.",
    "required": false
  },
  {
    "name": "distractor_count",
    "helpText": "How many incorrect answer options (distractors) to generate.",
    "required": false
  }
]
</details>

</agent>

<agent export="basics">
<context>
<location>AI Matrx — Agent View</location>
<url>https://www.aimatrx.com/agents/5f77de33-887d-4bb0-9432-91f2f6dddaa4</url>
<route>/agents/5f77de33-887d-4bb0-9432-91f2f6dddaa4</route>
<copied-at>2026-06-30T06:13:23.995Z</copied-at>
<export-mode>basics</export-mode>
</context>

<details>
Agent details:

Agent Name: Flashcard Expander
agentType: "user"
Version: 3

This agent's permanent ID that always tracks the latest version is:
Agent ID: 5f77de33-887d-4bb0-9432-91f2f6dddaa4

If you need a permanent pointer to this exact version that will be frozen, you must use:
is_version=True
id="a0579592-707f-48a1-ba27-3fe03361c5ae"

Model ID: 979205fd-e10d-494f-8512-972309dc34e5
Model name: gemini-3.5-flash

"variableDefinitions":
[
  {
    "name": "topic",
    "helpText": "The subject or topic area of the flashcard (e.g. 'Cell Biology', 'AP Calculus', 'Constitutional Law').",
    "required": false
  },
  {
    "name": "front",
    "helpText": "The front (question or prompt side) of the flashcard the learner is struggling with.",
    "required": false
  },
  {
    "name": "back",
    "helpText": "The back (answer side) of the flashcard.",
    "required": false
  },
  {
    "name": "struggle_signal",
    "helpText": "The learner's recent wrong attempts, error patterns, or notes that reveal where they are breaking down. Leave blank if unavailable.",
    "required": false
  }
]
</details>

</agent>

<agent export="basics">
<context>
<location>AI Matrx — Agent View</location>
<url>https://www.aimatrx.com/agents/d07d40bb-3cac-478d-ab33-859de3cd8d02</url>
<route>/agents/d07d40bb-3cac-478d-ab33-859de3cd8d02</route>
<copied-at>2026-06-30T06:15:15.836Z</copied-at>
<export-mode>basics</export-mode>
</context>

<details>
Agent details:

Agent Name: Flashcard Spoken Question Writer
agentType: "user"
Version: 2

This agent's permanent ID that always tracks the latest version is:
Agent ID: d07d40bb-3cac-478d-ab33-859de3cd8d02

If you need a permanent pointer to this exact version that will be frozen, you must use:
is_version=True
id="07e8dcba-ca8c-43fd-9c4d-02173e5bbbfe"

Model ID: 979205fd-e10d-494f-8512-972309dc34e5
Model name: gemini-3.5-flash

"variableDefinitions":
[
  {
    "name": "front",
    "helpText": "The front (question/term/prompt) side of the flashcard, exactly as written.",
    "required": false
  },
  {
    "name": "back",
    "helpText": "The back (answer/definition/explanation) side of the flashcard, exactly as written.",
    "required": false
  },
  {
    "name": "which",
    "helpText": "Which side of the card should be converted to spoken audio phrasing?",
    "required": false
  }
]
</details>

</agent>

















