# Scopeable Entities — Canonical List (working draft)

> The entity catalogue for Plane 1. Scope model → [`scope-model.md`](scope-model.md); roles/trust → [`knowledge_provenance_model.md`](knowledge_provenance_model.md); architecture → [`02_KNOWLEDGE_ARCHITECTURE.md`](02_KNOWLEDGE_ARCHITECTURE.md).

Unit = the **concept we track**, not the table. Modern table first; legacy tables
are candidates to merge/drop later. Ordered by likelihood of inclusion.

**Role:** `S` source · `D` destination · `U` utility · `C` container (operational — holds/groups other entities; no truth of its own).
Multi-role is fine and expected. A **compound transform** like `D --U--> S` means a Utility moves content from one role to another (e.g. an agent turning a destination back into a source). For sources, **authority varies by instance** (a Cleveland-Clinic scrape ≠ a kid's homework), so role ≠ trust — see `knowledge_provenance_model.md`.

---

## Include — high confidence

| Canonical | Role | Modern table | Legacy → merge/drop |
|---|---|---|---|
| Notes | S/D | `notes` | `note_folders`, `note_versions` (sub-tables) |
| Files | S | `cld_files` (+ `cld_folders`) | `user_files`, `file_entities`, `file_analysis`, `attachments` |
| Tasks | C | `ctx_tasks` | `ai_tasks`, `sch_task`, `scrape_task`, `cx_agent_task` |
| Agents | U | `agx_agent` | `ai_agent` |
| Agent Apps | U | `aga_apps` | `prompt_apps`, `custom_app_configs`, `app_instances` |
| Agent Shortcuts | U | `agx_shortcut` | `prompt_shortcuts` |
| Skills | U | `skl_definitions` | — |
| Agent Chats | D --U--> S<br>S --U--> D | `cx_conversation`, `cx_messages` | `conversation`, `conversations` |
| Workflows | U | `wf_definition` | `workflow`, `workflow_data` |
| UDT Datasets | S/D | `udt_datasets` | `user_tables` (renamed) |
| UDT Picklists | S | `udt_picklists` | `user_lists` (renamed) |
| UDT Workbooks | S/D | `udt_workbooks` | — |
| Sandboxes | U | `sandbox_instances` | — |
| Flashcards | D | `flashcard_data` | `flashcard_sets`, `user_flashcard_sets` |
| Quizzes | D | `quiz_sessions` | — |
| Canvas / Artifacts | D | `canvas_items`, `cx_artifact` | `shared_canvas_items` |
| Content Templates | U | `content_template` | — |
| Transcripts / Audio | S | `transcripts` | `audio_recording`, `studio_sessions`, `cx_media` |
| Research | D→S | `rs_topic` (+ `rs_source`, `rs_synthesis`) | — |
| Scrapes | S | `scraper.sites`, `scraper.crawl_runs` | `scrape_job`, `scrape_task`, `scrape_domain` |
| Code | D/U | `code_files` (+ `code_repositories`) | — |
| Projects | C | `ctx_projects` | `microservice_project` |
| Communication / Messaging | S | `dm_conversations` | — |

Notes on the tricky ones:
- **Research** is the canonical dual: scrapes (S) feed it, it synthesizes (D), then
  the synthesis can become a secondary source (S) — but promoting derived → source is a *future / undecided* control (see `knowledge_provenance_model.md`).
- **Agent Chats** (`cx_conversation` + `cx_messages`) are the human↔AI conversations — the system's most dynamic transformer: through tools and instructions an agent turns sources into new destinations *and* can push destinations back toward sources, sometimes raising truth (validation), sometimes lowering it. Hence the dual `D --U--> S` / `S --U--> D`. (Whether a derived chat may be *promoted* back to a seedable source is the *undecided* seeding control — see `knowledge_provenance_model.md`.)
- **Communication / Messaging** (`dm_conversations`) is **person-to-person** messaging — a *different concept* from Agent Chats (human↔AI). Listed for completeness; its scoping/role model is still open.
- **Scrapes** are sources but default to `unvalidated` authority.
- **Notes / UDT data** swing both ways by instance, not by type.

---

## Decide later — unsure

| Canonical | Role | Table(s) | Why uncertain |
|---|---|---|---|
| Prompts | U | `prompts` | may be absorbed by Agents |
| Prompt Actions | U | `prompt_actions` | tied to prompts' fate |
| Agent Surface Bindings | U | `agx_agent_surface` | config/binding, not a tagged noun |
| Analysis Recipes | U | `analysis_recipes`, `recipe` | role vs. Agents unclear |
| Comparison Sets | D | `cmp_comparison_sets` | niche |
| Processed Documents | S/D | `processed_documents` | likely folds into Files |
| Workers-Comp Claims | C/D | `wc_claim` | vertical-specific |
| Auto-ingest Batches | C | `auto_ingest_batch` | operational, not content |

---

_Source of truth to converge on: `shareable_resource_registry` (36 resource types).
Suggest adding `is_scopeable` + `content_role` columns there and generating both the
TS union and server-side validation from it._
