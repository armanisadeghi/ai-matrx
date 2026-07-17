## `/ai/chat` — Request Body Reference

All fields are optional unless marked required.

---

### Required

| Field | Type | Description |
|---|---|---|
| `ai_model_id` | `string` | The model to use |
| `messages` | `array of objects` | The conversation messages |

---

### Conversation & Control

| Field | Type | Default | Description |
|---|---|---|---|
| `conversation_id` | `string` | auto-generated | Pass to continue an existing conversation |
| `stream` | `boolean` | `true` | Stream the response |
| `store` | `boolean` | `true` | Persist the conversation to the DB |
| `max_iterations` | `integer` | `100` | Max agent loop iterations |
| `system_instruction` | `string` | — | System prompt |
| `variables` | `object` | — | `{{slot}}` substitutions applied to messages and system prompt |
| `metadata` | `object` | — | Arbitrary metadata to attach to the request |

---

### Tools

| Field | Type | Description |
|---|---|---|
| `tools` | `string[]` | Named server-side tools to enable |
| `client_tools` | `string[]` | Tool names the client will handle |
| `custom_tools` | `object[]` | Inline tool definitions delegated back to the client |

---

### LLM Parameters (passed flat, alongside messages)

| Field | Type | Description |
|---|---|---|
| `temperature` | `float` | Sampling temperature |
| `top_p` | `float` | Nucleus sampling |
| `top_k` | `integer` | Top-k sampling |
| `max_output_tokens` | `integer` | Max tokens in the response |
| `response_format` | `object` | e.g. `{ "type": "json_object" }` |
| `stop_sequences` | `string[]` | Stop the response at these strings |
| `tool_choice` | `"none" \| "auto" \| "required"` | Force or suppress tool use |
| `parallel_tool_calls` | `boolean` | Allow parallel tool calls |

---

### Thinking / Reasoning

| Field | Type | Description |
|---|---|---|
| `reasoning_effort` | `"none" \| "minimal" \| "low" \| "medium" \| "high" \| "xhigh" \| "max" \| "auto"` | Canonical reasoning tiers; each model exposes only the values its catalog rule supports |
| `reasoning_summary` | `"concise" \| "detailed" \| "never" \| "auto" \| "always"` | OpenAI reasoning summary style |
| `thinking_level` | `"minimal" \| "low" \| "medium" \| "high"` | Gemini thinking depth |
| `thinking_budget` | `integer` | Token budget for Anthropic/Gemini thinking |
| `include_thoughts` | `boolean` | Include Gemini thinking in the response |

---

### Provider Features

| Field | Type | Description |
|---|---|---|
| `internal_web_search` | `boolean` | Enable the provider's built-in web search |
| `internal_url_context` | `boolean` | Enable the provider's built-in URL context |

---

### Image Generation

| Field | Type | Description |
|---|---|---|
| `size` | `string` | Output image size |
| `quality` | `string` | Output image quality |
| `count` | `integer` | Number of images to generate |
| `width` / `height` | `integer` | Dimensions |
| `reference_images` | `array` | Reference images for generation |
| `negative_prompt` | `string` | Negative prompt |
| `output_format` | `string` | e.g. `"png"`, `"webp"` |

---

### Audio / TTS

| Field | Type | Description |
|---|---|---|
| `tts_voice` | `string \| object[]` | Voice selection |
| `audio_format` | `string` | Output audio format |

---

### Video Generation

| Field | Type | Description |
|---|---|---|
| `seconds` | `string` | Duration |
| `fps` | `integer` | Frames per second |
| `steps` | `integer` | Diffusion steps |
| `seed` | `integer` | Seed for reproducibility |
| `guidance_scale` | `integer` | Guidance scale |
| `output_quality` | `integer` | Output quality level |
| `frame_images` | `array` | Frame images for video generation |



# Agent System Instructions Construction:

### The `SystemInstruction` object — full capability map

When you pass `system_instruction` as a **dict** (not just a plain string), you unlock the full structured system. Every key maps directly to `SystemInstruction.from_value()`:

```json
{
  "system_instruction": {
    "base_instruction": "You are a helpful assistant.",
    "intro": "Text placed before everything else.",
    "outro": "Text placed after everything else.",
    "prepend_sections": ["Section added before base_instruction"],
    "append_sections": ["Section added after base_instruction"],
    "content_blocks": ["block-uuid-or-block_id", "another-block"],
    "tools_list": ["tool_name_1", "tool_name_2"],
    "include_date": true,
    "include_code_guidelines": false,
    "include_safety_guidelines": false
  }
}
```

The final rendered order is:
```
intro
→ current date (if include_date)
→ prepend_sections
→ base_instruction
→ tools_list (auto-formatted)
→ include_code_guidelines section
→ include_safety_guidelines section
→ content_blocks (fetched from DB)
→ append_sections
→ injected_context_block (infrastructure-only, not for frontend)
→ outro
```

---

### `content_blocks` — DB-fetched sections

Pass either a UUID or a `block_id` slug. The system fetches the `template` field from the `content_blocks` table and injects it into the system prompt automatically. **This is async** — it only works when going through the server path (`from_dict` async), which is always the case for API requests.

---

### `<<MATRX>>` patterns — inline DB data fetching

Embed these anywhere in any string field (including `base_instruction`, `append_sections`, messages, etc.):

```
<<MATRX>><<CONTENT_BLOCKS>><<BLOCK_ID>>sample-thinking<</MATRX>>
<<MATRX>><<CONTENT_BLOCKS>><<ID>>some-uuid<<FIELDS>>template<</MATRX>>
<<MATRX>><<USERS>><<EMAIL>>user@example.com<<FIELDS>>name<</MATRX>>
```

These are resolved synchronously at the end of `__str__()` — they fetch live from the DB and replace themselves with the result.

---

### To your actual question

**Yes, both formats are supported.** The frontend can send either:

1. **Plain string** — just text, wrapped automatically with `include_date=True`
2. **Structured dict** — full `SystemInstruction` object with all the sections above
3. **`<<MATRX>>` XML patterns embedded in any string** — inline DB fetches that resolve automatically

There is no requirement to use XML blocks. The dict format is the clean, structured way. The XML patterns are for when you want dynamic DB content embedded inline within any text field — including inside a plain string `system_instruction`.


## Official Type


```typescript
export type SystemInstruction = {
  /** The core system prompt text. Required if not using `content` alias. */
  base_instruction?: string;

  /** Alias for `base_instruction` — merged into it if both are provided. */
  content?: string;

  /** Placed before everything else in the final prompt. */
  intro?: string;

  /** Placed after everything else in the final prompt. */
  outro?: string;

  /** Sections injected before `base_instruction`. */
  prepend_sections?: string[];

  /** Sections injected after `base_instruction` (before content_blocks). */
  append_sections?: string[];

  /**
   * IDs or slug names of content blocks to fetch from the DB and inject
   * into the system prompt automatically.
   * Accepts either a UUID or a `block_id` slug string.
   */
  content_blocks?: string[];

  /** Names of tools to list in the system prompt. Auto-formatted. */
  tools_list?: string[];

  /** Inject the current date. Defaults to true. */
  include_date?: boolean;

  /** Inject built-in code guidelines section. Defaults to false. */
  include_code_guidelines?: boolean;

  /** Inject built-in safety guidelines section. Defaults to false. */
  include_safety_guidelines?: boolean;

  /** Optional version tag — for tracking only, not rendered. */
  version?: string;

  /** Optional category tag — for tracking only, not rendered. */
  category?: string;

  /** Any additional fields — new capabilities are added as needed and requested. */
  [key: string]: unknown;
};

/**
 * Pass a plain string for simple system prompts,
 * or a structured object to use the full SystemInstruction builder.
 *
 * You can also embed <<MATRX>> patterns anywhere in any string field
 * to fetch live data from the database inline:
 *
 *   <<MATRX>><<CONTENT_BLOCKS>><<BLOCK_ID>>my-block<</MATRX>>
 *   <<MATRX>><<USERS>><<EMAIL>>user@example.com<<FIELDS>>name<</MATRX>>
 */
export type SystemInstructionInput = string | SystemInstruction;
```

The flexible keys ensure that if the frontend needs something, the Python team is committed to adding it within 48 hours.
