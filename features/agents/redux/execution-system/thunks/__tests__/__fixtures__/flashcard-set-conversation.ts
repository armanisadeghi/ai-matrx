/**
 * CAPTURED fixtures for the reconcile-on-load owner gate test.
 *
 * Read-only from the live Matrx database on 2026-09-15 (Supabase MCP was in
 * maintenance, so via the direct Postgres connection):
 *   - `chat.conversation` 4d03c3be-a44a-47d7-a5f8-09c5dce0cbd3 (admin@admin.com's
 *     "Model Particles Deck" run, every column). Only three long strings were
 *     trimmed (the frozen system prompt, the source-text variable, the
 *     response_format schema body) - nothing the load path reads.
 *   - `chat.message` e27a87b7-b94c-4c09-b10f-8cabe244f195 (every column). Its live
 *     content is a `thinking` block plus ONE `text` block holding the model's
 *     pretty-printed `flashcard_set` JSON - no fence, no tag. The payload is
 *     swapped for the flashcard_set kind's CANONICAL `content_ir.kind_example`
 *     (label "grounded deck with trust envelopes", 4 cards), in that exact live block shape.
 * Timestamps are rendered in the ISO form PostgREST returns.
 */

import type { Database, Json } from "@/types/database.types";

/** `content_ir.kind_example.data` - the canonical flashcard_set sample. */
export const FLASHCARD_SET_KIND_EXAMPLE = {
  "cards": [
    {
      "back": "To explain why they wanted to break away from Great Britain's rule and become a free country.",
      "tags": [
        "revolution",
        "independence",
        "founding documents"
      ],
      "front": "Why did the American colonists write the Declaration of Independence?",
      "topic": "American Revolution",
      "trust": {
        "__kind": "trust_envelope",
        "citations": [
          {
            "title": "Chapter 3 — Declaring Independence",
            "__kind": "citation",
            "excerpt": "The Declaration set out the colonists' reasons for dissolving their political bonds with Great Britain.",
            "locator": "p. 41",
            "sourceId": "c4e1f0a2-8d5b-4a76-9f31-2b7c9d0e5a13",
            "sourceKind": "chunk"
          }
        ],
        "confidence": "grounded",
        "groundedIn": "Foundations of United States History — Chapter 3 reading"
      },
      "__kind": "flashcard",
      "card_kind": "basic",
      "difficulty": "medium"
    },
    {
      "back": "Thomas Jefferson",
      "tags": [
        "founders",
        "independence",
        "thomas jefferson"
      ],
      "front": "The main author of the Declaration of Independence was ___.",
      "topic": "American Revolution",
      "trust": {
        "__kind": "trust_envelope",
        "citations": [],
        "confidence": "inferred",
        "groundedIn": "Foundations of United States History — Chapter 3 reading"
      },
      "__kind": "flashcard",
      "card_kind": "cloze",
      "difficulty": "medium"
    },
    {
      "back": "The Bill of Rights",
      "tags": [
        "constitution",
        "bill of rights",
        "amendments"
      ],
      "front": "What do we call the first ten amendments to the Constitution that list our most important personal rights?",
      "topic": "US Constitution",
      "trust": {
        "__kind": "trust_envelope",
        "citations": [
          {
            "title": "Chapter 5 — The Constitution",
            "__kind": "citation",
            "excerpt": "Ratified in 1791, the first ten amendments are known collectively as the Bill of Rights.",
            "locator": "§5.2",
            "sourceId": "9b2d7c14-3e6a-4f85-b0c9-71ad4e2f8c60",
            "sourceKind": "section"
          }
        ],
        "confidence": "grounded",
        "groundedIn": "Foundations of United States History — Chapter 5 reading"
      },
      "__kind": "enhanced_flashcard",
      "card_kind": "basic",
      "difficulty": "medium",
      "audio_explanation": "https://example.com/audio/bill-of-rights-explanation.mp3",
      "detailed_explanation": "The Bill of Rights was added in 1791 to address Anti-Federalist concerns that the original Constitution did not sufficiently protect individual liberties. It includes freedoms of speech, religion, press, assembly, the right to bear arms, protection against unreasonable searches, due process, and more."
    },
    {
      "back": "Taxation without representation, British restrictions on colonial trade and expansion, Enlightenment ideas, and growing colonial unity.",
      "tags": [
        "causes",
        "revolution"
      ],
      "front": "What were the key causes of the American Revolution?",
      "topic": "American Revolution",
      "trust": {
        "__kind": "trust_envelope",
        "citations": [
          {
            "title": "Chapter 3 — Declaring Independence",
            "__kind": "citation",
            "excerpt": "Colonial grievances centred on taxes levied without colonial consent and on restrictions to westward settlement.",
            "locator": "pp. 38-42",
            "sourceId": "c4e1f0a2-8d5b-4a76-9f31-2b7c9d0e5a13",
            "sourceKind": "chunk"
          }
        ],
        "confidence": "grounded",
        "groundedIn": "Foundations of United States History — Chapter 3 reading"
      },
      "__kind": "tiered_flashcard",
      "subcards": [
        {
          "back": "Colonists were required to pay taxes to Britain (e.g., Stamp Act, Tea Act) but had no representatives in Parliament to voice their interests.",
          "front": "What does 'taxation without representation' mean?",
          "topic": "American Revolution",
          "__kind": "basic_card",
          "difficulty": "easy"
        },
        {
          "back": "They were punitive laws passed after the Boston Tea Party that closed Boston Harbor, altered Massachusetts government, and allowed British troops to be quartered in colonial homes. This unified colonial resistance.",
          "front": "How did the Intolerable Acts contribute to the Revolution?",
          "topic": "American Revolution",
          "__kind": "basic_card",
          "difficulty": "medium"
        },
        {
          "back": "John Locke (natural rights) and Montesquieu (separation of powers).",
          "front": "Name two Enlightenment thinkers who influenced the American Revolution.",
          "topic": "American Revolution",
          "__kind": "basic_card",
          "difficulty": "medium"
        }
      ],
      "card_kind": "tiered",
      "difficulty": "hard"
    }
  ],
  "title": "Foundations of United States History",
  "__kind": "flashcard_set"
} satisfies Json;

export const OWNER_CONVERSATION_ROW = {
  "id": "4d03c3be-a44a-47d7-a5f8-09c5dce0cbd3",
  "title": "Model Particles Deck – 6 Cards",
  "system_instruction": "<!--matrx:current_date-->Current date: 2026-09-10<!--matrx:/current_date-->\n\nYou are a precision flashcard-generation engine. You convert supplied source material into a source-grounded flashcard deck, emitted as a single JSON object using the registered `flashcard_set` kind. You never write prose before or after the JSON — your entire output is the JSON object itself.\n\n# Output Shape (exact)\n{\"__kind\":\"flashcard_set …[trimmed at capture]",
  "config": {
    "tools": [
      "data",
      "data_action",
      "workbook",
      "document",
      "office",
      "context",
      "scope_system",
      "local_audio",
      "local_clipboard",
      "local_documents",
      "local_file",
      "local_input",
      "local_mac_apps",
      "local_media",
      "local_monitor",
      "local_ner",
      "local_process",
      "local_schedule",
      "local_screen",
      "local_shell",
      "local_system",
      "local_window",
      "load_desktop_tools",
      "google_email_send",
      "google_workspace"
    ],
    "stream": true,
    "temperature": 0.7,
    "dynamic_tools": [
      "local_audio",
      "local_clipboard",
      "local_documents",
      "local_file",
      "local_input",
      "local_mac_apps",
      "local_media",
      "local_monitor",
      "local_ner",
      "local_process",
      "local_schedule",
      "local_screen",
      "local_shell",
      "local_system",
      "local_window"
    ],
    "authored_tools": [
      "data",
      "data_action",
      "workbook",
      "document",
      "office",
      "context",
      "scope_system",
      "local_audio",
      "local_clipboard",
      "local_documents",
      "local_file",
      "local_input",
      "local_mac_apps",
      "local_media",
      "local_monitor",
      "local_ner",
      "local_process",
      "local_schedule",
      "local_screen",
      "local_shell",
      "local_system",
      "local_window"
    ],
    "response_format": {
      "type": "json_schema",
      "json_schema": "[trimmed at capture — the flashcard_set schema]"
    },
    "max_output_tokens": 65536,
    "system_prompt_frozen": true,
    "tool_authority_filtered": true,
    "tool_authority_exclusions": [
      "cloud_file",
      "fs_edit",
      "fs_list",
      "fs_mkdir",
      "fs_patch",
      "fs_read",
      "fs_search",
      "fs_write",
      "git_ingest",
      "shell_execute",
      "shell_python"
    ]
  },
  "status": "active",
  "message_count": 6,
  "forked_from_id": null,
  "forked_at_position": null,
  "created_at": "2026-09-10T06:54:36.154249+00:00",
  "updated_at": "2026-09-15T00:43:42.680226+00:00",
  "deleted_at": null,
  "metadata": {
    "last_request_context": {
      "task_id": null,
      "agent_id": "4b4a7d28-9428-4639-a985-f328f1aab0b9",
      "scope_ids": [],
      "project_id": null,
      "source_app": "matrx-frontend",
      "source_feature": "education-ingest",
      "organization_id": "f9cb3e35-2a65-4f2a-8525-088d6551071c",
      "agent_version_id": null
    }
  },
  "last_model_id": "4f72b5ab-7603-4125-a69c-d78ddfbfc50f",
  "parent_conversation_id": null,
  "variables": {
    "count": "6",
    "focus": "",
    "title": "Ava Science Book - section 17 of 25: STEP - Model Particles in Solids, Liquids,andGases",
    "difficulty": "Mixed",
    "source_content": "### Chunk 17_1\nSTEP\n7\nDo the Math How much did thevolumeofthesampleschangewhen\nyou pushed in the plunger?Basedon your resuts for the volume of air,\nwhat might you conclude about theshapeofair in the s …[trimmed at capture]"
  },
  "overrides": {},
  "description": "User requested a 6‑card flashcard set on modeling particles in solids, liquids, and gases, with mixed difficulty.",
  "keywords": [
    "flashcards",
    "particles",
    "solids",
    "liquids",
    "gases",
    "modeling",
    "kinetic energy",
    "state of matter",
    "science education",
    "mixed difficulty",
    "deck creation",
    "Ava Science Book",
    "section 17"
  ],
  "organization_id": "f9cb3e35-2a65-4f2a-8525-088d6551071c",
  "task_id": null,
  "source_app": "matrx-frontend",
  "source_feature": "education-ingest",
  "is_ephemeral": false,
  "initial_agent_id": "4b4a7d28-9428-4639-a985-f328f1aab0b9",
  "initial_agent_version_id": "7566fe4b-d4e2-4bd4-9162-d0c79e924238",
  "is_favorite": false,
  "cache_state": {
    "last_model": "gemini-flash-latest",
    "last_provider": "google",
    "last_response_at": "2026-09-15T00:43:42.555375+00:00",
    "est_cache_ttl_secs": 300,
    "last_cache_read_tokens": 0,
    "cumulative_trimmable_chars": 0
  },
  "last_context_breakdown": null,
  "sandbox_instance_id": null,
  "last_request_status": "completed",
  "last_request_id": "af2cd6d6-cd91-4eb7-819d-7479a6c94d01",
  "app_instance_id": null,
  "exclude_from_kg": false,
  "conversation_type": "standard",
  "created_by": "87a6e699-3622-4869-8843-d0867456c0dd",
  "updated_by": null,
  "version": 6,
  "visibility": "personal",
  "origin_class": "human",
  // Added by `migrations/cx_conversation_variable_authorship.sql` AFTER this row
  // was captured, `not null default '{}'`. A pre-column row therefore reads back
  // as the empty array: no launch variable on this conversation is recorded as
  // host-wired, which is exactly what the live row answers today.
  "host_value_names": []
} satisfies Database["chat"]["Tables"]["conversation"]["Row"];

export const FLASHCARD_MESSAGE_ROW = {
  "id": "e27a87b7-b94c-4c09-b10f-8cabe244f195",
  "conversation_id": "4d03c3be-a44a-47d7-a5f8-09c5dce0cbd3",
  "role": "assistant",
  "position": 4,
  "status": "active",
  "content": [
    {
      "id": "",
      "text": "",
      "type": "thinking",
      "summary": [],
      "metadata": {},
      "provider": "google",
      "signature": "ErIBCq8BARFNMg+HQsjZ0mAVEMoq6SlDRFuCb4zUmtJ2gceLjMtmnseJFSgpNoQ1zo3YTvTYT4aK8QIU7yLYMu9SkkXeHugnT9/QlPL5K4+YXq6AiDT0pVZLKr4COHZyIyud/KumYcdsKXGPJd9pWWzayXnMBzTpPejiZRfjbhWfbuNKlsUAnWa7BZH92Nl+WojhDDXE9kZACCjKN6kloHOzsihZrmHioH+XWdkvi8BiSNlb8A==",
      "signature_encoding": "base64"
    },
    {
      ...({"id": "", "type": "text", "metadata": {}, "citations": []}),
      text: JSON.stringify(FLASHCARD_SET_KIND_EXAMPLE, null, 2),
    },
  ],
  "created_at": "2026-09-15T00:43:42.357208+00:00",
  "deleted_at": null,
  "metadata": {
    "finish_reason": "stop",
    "provider_iteration": 1
  },
  "content_history": null,
  "source": "user",
  "agent_id": null,
  "is_visible_to_user": true,
  "is_visible_to_model": true,
  "user_content": null,
  "content_chars": 6764,
  "tool_results_chars": 0,
  "tools_on_call": null,
  "model_context": null,
  "error": null,
  "voice": null,
  "organization_id": "f9cb3e35-2a65-4f2a-8525-088d6551071c",
  "created_by": "87a6e699-3622-4869-8843-d0867456c0dd",
  "updated_by": null,
  "updated_at": "2026-09-15T00:43:42.357208+00:00",
  "version": 1,
} satisfies Database["chat"]["Tables"]["message"]["Row"];
