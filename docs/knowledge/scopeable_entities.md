# Scopeable Entities — Canonical List (working draft)

Unit = the **concept we track**, not the table. Modern table first; legacy tables
are candidates to merge/drop later. Ordered by likelihood of inclusion.

**Role:** `S` source · `D` destination · `T` tool · `O` operational/container.
Multi-role is fine and expected. For sources, **authority varies by instance**
(a Cleveland-Clinic scrape ≠ a kid's homework), so role ≠ trust — see
`knowledge_provenance_model.md`.

---

## Include — high confidence

| Canonical | Role | Modern table | Legacy → merge/drop |
|---|---|---|---|
| Notes | S/D | `notes` | `note_folders`, `note_versions` (sub-tables) |
| Files | S | `cld_files` (+ `cld_folders`) | `user_files`, `file_entities`, `file_analysis`, `attachments` |
| Tasks | O | `ctx_tasks` | `ai_tasks`, `sch_task`, `scrape_task`, `cx_agent_task` |
| Agents | T | `agx_agent` | `ai_agent` |
| Agent Apps | T | `aga_apps` | `prompt_apps`, `custom_app_configs`, `app_instances` |
| Agent Shortcuts | T | `agx_shortcut` | `prompt_shortcuts` |
| Skills | T | `skl_definitions` | — |
| Conversations | D→(S) | `cx_conversation` | `conversation`, `conversations`, `dm_conversations` |
| Workflows | T | `wf_definition` | `workflow`, `workflow_data` |
| UDT Datasets | S/D | `udt_datasets` | `user_tables` (renamed) |
| UDT Picklists | S | `udt_picklists` | `user_lists` (renamed) |
| UDT Workbooks | S/D | `udt_workbooks` | — |
| Sandboxes | T | `sandbox_instances` | — |
| Flashcards | D | `flashcard_data` | `flashcard_sets`, `user_flashcard_sets` |
| Quizzes | D | `quiz_sessions` | — |
| Canvas / Artifacts | D | `canvas_items`, `cx_artifact` | `shared_canvas_items` |
| Content Templates | T | `content_template` | — |
| Transcripts / Audio | S | `transcripts` | `audio_recording`, `studio_sessions`, `cx_media` |
| Research | D→S | `rs_topic` (+ `rs_source`, `rs_synthesis`) | — |
| Scrapes | S | `scraper.sites`, `scraper.crawl_runs` | `scrape_job`, `scrape_task`, `scrape_domain` |
| Code | D/T | `code_files` (+ `code_repositories`) | — |
| Projects | O | `ctx_projects` | `microservice_project` |

Notes on the tricky ones:
- **Research** is the canonical dual: scrapes (S) feed it, it synthesizes (D), then
  the synthesis becomes a secondary source (S) — only after a validation gate.
- **Conversations** are tool output (D); become a source (S) only if explicitly saved.
- **Scrapes** are sources but default to `unvalidated` authority.
- **Notes / UDT data** swing both ways by instance, not by type.

---

## Decide later — unsure

| Canonical | Role | Table(s) | Why uncertain |
|---|---|---|---|
| Prompts | T | `prompts` | may be absorbed by Agents |
| Prompt Actions | T | `prompt_actions` | tied to prompts' fate |
| Agent Surface Bindings | T | `agx_agent_surface` | config/binding, not a tagged noun |
| Analysis Recipes | T | `analysis_recipes`, `recipe` | role vs. Agents unclear |
| Comparison Sets | D | `cmp_comparison_sets` | niche |
| Processed Documents | S/D | `processed_documents` | likely folds into Files |
| Workers-Comp Claims | O/D | `wc_claim` | vertical-specific |
| Auto-ingest Batches | O | `auto_ingest_batch` | operational, not content |

---

_Source of truth to converge on: `shareable_resource_registry` (36 resource types).
Suggest adding `is_scopeable` + `content_role` columns there and generating both the
TS union and server-side validation from it._
