# Scopeable Entities — Canonical List (working draft)

Unit = the **concept we track**, not the table. Modern table listed first; legacy
tables are candidates to merge/drop later. Ordered by likelihood of inclusion.

---

## Include — high confidence

| Canonical | Modern table | Legacy → merge/drop |
|---|---|---|
| Notes | `notes` | `note_folders`, `note_versions` (sub-tables, not entities) |
| Files | `cld_files` (+ `cld_folders`) | `user_files`, `file_entities`, `file_analysis`, `attachments`, `extracted_documents_legacy` |
| Tasks | `ctx_tasks` | `ai_tasks`, `sch_task`, `scrape_task`, `cx_agent_task` |
| Agents | `agx_agent` | `ai_agent` |
| Agent Apps | `aga_apps` | `prompt_apps`, `custom_app_configs`, `app_instances`, `applet` |
| Agent Shortcuts | `agx_shortcut` | `prompt_shortcuts` |
| Skills | `skl_definitions` | — |
| Conversations | `cx_conversation` | `conversation`, `conversations`, `dm_conversations`, `sms_conversations` |
| Workflows | `wf_definition` | `workflow`, `workflow_data` |
| UDT Datasets | `udt_datasets` | `user_tables` (renamed) |
| UDT Picklists | `udt_picklists` | `user_lists` (renamed) |
| UDT Workbooks | `udt_workbooks` | — |
| Sandboxes | `sandbox_instances` | — |
| Flashcards | `flashcard_data` | `flashcard_sets`, `user_flashcard_sets` |
| Quizzes | `quiz_sessions` | — |
| Canvas / Artifacts | `canvas_items`, `cx_artifact` | `shared_canvas_items` |
| Content Templates | `content_template` | — |
| Transcripts / Audio | `transcripts` | `audio_recording`, `studio_sessions`, `cx_media` |
| Research | `rs_topic` (+ `rs_source`, `rs_synthesis`) | — |
| Scrapes | `scraper.sites`, `scraper.crawl_runs` | `scrape_job`, `scrape_task`, `scrape_domain`, `scrape_parsed_page` |
| Code | `code_files` (+ `code_repositories`) | — |
| Projects | `ctx_projects` | `microservice_project` |

---

## Decide later — unsure

| Canonical | Table(s) | Why uncertain |
|---|---|---|
| Prompts | `prompts` | may be absorbed by Agents |
| Prompt Actions | `prompt_actions` | tied to prompts' fate |
| Agent Surface Bindings | `agx_agent_surface` | config/binding, not a user-tagged noun |
| Analysis Recipes | `analysis_recipes`, `recipe` | role vs. Agents unclear |
| Comparison Sets | `cmp_comparison_sets` | niche |
| Processed Documents | `processed_documents` | likely folds into Files |
| Workers-Comp Claims | `wc_claim` | vertical-specific |
| Auto-ingest Batches | `auto_ingest_batch` | operational, not user content |

---

_Source of truth to converge on: `shareable_resource_registry` (36 resource types,
each mapped to table/id/owner). Suggest adding an `is_scopeable` flag there and
generating both the TS union and server-side validation from it._
