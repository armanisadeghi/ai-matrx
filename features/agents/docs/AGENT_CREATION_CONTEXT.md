# Agent Creation — Model & Tool IDs

When building an agent you need `model_id` (one UUID) and `tools` (array of UUIDs). Use the tables below directly — don't query `ai_model` or `tool_def` to discover them.

## Models — `agx_agent.model_id`

| Model | id |
|---|---|
| Claude Sonnet 4.6 (balanced default) | `5970727c-37fc-4a0f-88c6-04ea8ca09ec6` |
| Claude Opus 4.8 (max quality) | `bdd06a96-37d2-40f3-8951-dff89b47b3b0` |
| Claude Haiku 4.5 (fast/cheap) | `5b467c4b-80f3-420f-a516-05218907521b` |
| GPT 5 | `7fe2bcd1-3059-423b-9878-0ee2ad6ddb2f` |
| GPT 5 Mini | `6f4eb19c-74d4-49eb-88b5-ab34e8b2a1dc` |
| GPT 5.5 | `ec8cf459-93d1-418a-beb2-b893fd116bf9` |
| Gemini 3 Flash Preview (app default) | `e2150d2f-7dd3-4fad-9d81-6e6ea41d4afd` |
| Gemini 3 Pro Preview | `2d637e2d-4e9f-4490-bae2-5bbdf5eb0ef4` |
| Gemini 3.1 Pro Preview | `56363cb1-0d87-40b7-8bdc-664901e9f1ef` |
| Gemini 3.5 Flash | `979205fd-e10d-494f-8512-972309dc34e5` |

Need one not listed: `SELECT id, name, common_name FROM ai_model WHERE is_deprecated IS NOT TRUE AND common_name ILIKE '%…%'`.

## Tools — `agx_agent.tools[]`

Store these `tool_def.id` UUIDs (not names). The tool descriptions are already in your toolset — this is just the id lookup.

| Tool | id |
|---|---|
| `web` | `55bc14b4-a166-4a33-a0bc-a2b0dcf66de0` |
| `research_web` | `075194f7-3766-4ae7-a887-2234331b49c1` |
| `rag_search` | `3921fc69-0763-4538-9e36-5a29a088a5bd` |
| `note` | `116f5956-0744-41cf-abd8-38f82bf5d835` |
| `task` | `76db9c44-8cf7-4abc-ac6e-624e2307fcab` |
| `memory` | `3c121dff-1df9-47e7-9894-a5693e89a7d5` |
| `sql` | `4cabd960-cb6d-4b82-9d77-c60031e5f6b6` |
| `user` | `863107b0-3e7c-407a-a00d-6d0b7350d844` |
| `update_plan` | `6eefa682-b0e6-4335-8f54-91960e86f8ae` |
| `ctx_get` | `4c4a629f-9601-4dfd-b2bf-6b81add78b33` |
| `ctx_batch` | `a5e7a602-cb40-4beb-9410-fd8beef250c2` |
| `dictionary` | `04920d8d-0a54-4010-8ac1-9675942b1aec` |
| `cloud_file` | `5342c01f-dc07-46cd-ac25-938ddf9ffed8` |
| `code_fetch_tree` | `48baedf8-c8cf-4fa6-aa06-cec550dec12c` |
| `code_fetch_code` | `6b3cdb76-bdd5-4865-a1e1-a6963f19eecb` |
| `fs_read` | `260283ef-0a46-48c5-992d-2a4bb0dc1dcf` |
| `skill_list` | `6035a413-45fa-4a08-ad7c-a5aa1ecac412` |
| `skill_get` | `7fc5dbbd-8f43-4b14-9913-c378c850163b` |

Need one not listed: `SELECT id, name FROM tool_def WHERE is_active AND name IN ('…')`. MCP integrations are `bundle:list_<vendor>` rows.
