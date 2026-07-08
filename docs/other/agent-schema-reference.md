# AI Matrx — Agent Schema Reference

> Concise reference for the agent (prompt/builtin), model, settings, tools, and versioning architecture.
> Database: `txzxabzwovsujtloxrus` (automation-matrx)

---

## 1. Core Entity Relationship Map

```
prompts ──FK──▶ ai_model (model_id)
  │              ▲
  │ FK           │ FK
  ▼              │
prompt_versions  prompt_builtins ──FK──▶ ai_model (model_id)
                   │
                   ▼
                 prompt_builtin_versions

prompt_builtins ──FK──▶ prompts (source_prompt_id)  // origin tracking

tools ──────────▶ tool_versions
```

---

## 2. Table Schemas

### 2.1 `prompts` (User Agents)

| Column | Type | Default | Notes |
|---|---|---|---|
| id | uuid | gen_random_uuid() | PK |
| name | varchar | | |
| description | text | | |
| messages | jsonb | | Prompt message array |
| variable_defaults | jsonb | | See §5 |
| tools | jsonb | | **DEPRECATED — unused. Tools live in `settings.tools[]`** |
| settings | jsonb | | See §4 — source of truth for all config |
| model_id | uuid FK→ai_model | | **Bi-directionally synced with `settings.model_id`** |
| output_format | text | | Auto-synced from settings |
| output_schema | jsonb | | JSON schema when output_format = json_schema |
| dynamic_model | bool | false | If true, model is resolved at runtime |
| context_slots | jsonb | [] | Context injection slots |
| category | text | | |
| tags | text[] | {} | |
| version | int | 1 | Current version counter |
| is_archived | bool | false | |
| is_favorite | bool | false | |
| is_public | bool | false | |
| user_id | uuid | | Owner |
| organization_id | uuid FK | | Hierarchy |
| workspace_id | uuid FK | | Hierarchy |
| project_id | uuid FK | | Hierarchy |
| task_id | uuid FK | | Hierarchy |
| created_at / updated_at | timestamptz | now() | |

### 2.2 `prompt_builtins` (System Agents)

Same shape as `prompts` minus hierarchy columns, plus:

| Extra Column | Type | Notes |
|---|---|---|
| source_prompt_id | uuid FK→prompts | Origin prompt if converted |
| source_prompt_snapshot_at | timestamptz | When snapshot was taken |
| created_by_user_id | uuid | |
| is_active | bool (default true) | |

### 2.3 `ai_model`

| Column | Type | Default | Notes |
|---|---|---|---|
| id | uuid | gen_random_uuid() | PK |
| name | varchar | NOT NULL | API model string (e.g. `claude-sonnet-4-6`) |
| common_name | varchar | | Display name |
| model_class | varchar | NOT NULL | Grouping key |
| provider | varchar | | Human label (e.g. `Anthropic`) |
| context_window | bigint | | |
| max_tokens | bigint | | |
| controls | jsonb | | **Per-model config schema — see §3** |
| capabilities | jsonb | | Feature flags |
| pricing | jsonb | | Array of pricing tiers |
| endpoints | jsonb | | Array of endpoint names |
| is_deprecated | bool | false | |
| is_primary | bool | false | |
| is_premium | bool | false | |

### 2.4 `tools`

| Column | Type | Default | Notes |
|---|---|---|---|
| id | uuid | PK | |
| name | text | NOT NULL | Unique identifier (e.g. `web_search`) |
| description | text | NOT NULL | |
| parameters | jsonb | NOT NULL | JSON Schema for inputs |
| output_schema | jsonb | | JSON Schema for outputs |
| annotations | jsonb | [] | MCP hints |
| function_path | text | NOT NULL | Python dotted path |
| category | text | | |
| tags | text[] | | |
| icon | varchar(255) | | Lucide icon name |
| is_active | bool | true | |
| semver | text | '1.0.0' | |
| source_app | text | 'matrx_ai' | |
| version | int | 1 | |

---

## 3. Model Controls — Complete Inventory (49 keys)

See full table in §3.1 of previous version. Key patterns:

```jsonc
{"min": 0, "max": 2, "type": "number", "default": 1}           // numeric range
{"min": 1, "max": 64000, "type": "integer", "default": 32000, "required": true}
{"enum": ["low", "medium", "high"], "type": "string", "default": "low"}
{"type": "boolean", "default": true}
{"allowed": true}                                                 // feature flag
{"allowed": true, "default": false}
{"type": "array", "items": {"type": "string"}, "maxItems": 4}
```

### API Classes (22 distinct)

openai_standard, openai_reasoning, openai_tts, anthropic_standard, anthropic_adaptive, google_thinking, google_thinking_3, google_image_generation, google_video_generation, google_tts, groq_standard, groq_tts, cerebras_standard, cerebras_reasoning, together_text_standard, together_image, together_video, xai_standard, xai_tts, elevenlabs_tts, huggingface_standard

---

## 4. Settings Keys (all in use across prompts + builtins)

model_id, stream, temperature, max_tokens, max_output_tokens, top_p, frequency_penalty, presence_penalty, store, tools, reasoning_effort, reasoning_summary, thinking_budget, include_thoughts, output_format, response_format, file_urls, image_urls, youtube_videos, internal_web_search, internal_url_context, internal_tools, parallel_tool_calls, verbosity, tts_voice, audio_format, multi_speaker

---

## 5. Variable Defaults — Custom Component Types

| Type | Count | Shape |
|---|---|---|
| textarea | 129 | `{type}` |
| radio | 59 | `{type, options[], allowOther?}` |
| select | 12 | `{type, options[], allowOther?}` |
| checkbox | 8 | `{type, options[], allowOther?}` |
| toggle | 4 | `{type, toggleValues[off,on]}` |
| number | 3 | `{type, min, max, step}` |
| text | 1 | `{type}` |

---

## 6. Versioning: full-row snapshot, INSERT→v1, UPDATE→snapshot OLD, live row = latest

## 7. Sync Trigger: `sync_agent_settings_columns` — bi-directional, settings wins ties, BEFORE INSERT|UPDATE, shared by both tables

## 8. Execution: load agent → resolve model via settings.model_id → read controls → resolve tools by name → ai.service.wire_format routes to handler
