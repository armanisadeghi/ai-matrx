# Schema Map — what each Postgres schema is FOR (Matrx Main)

> Concise semantic map of the schemas on **Matrx Main** (`txzxabzwovsujtloxrus`). Read this before moving a table between schemas or deciding a new table's home. Table *counts* + the exposed-schema/db-types trap live in `.claude/skills/db-change/TOOLKIT.md §0`; this file is about **meaning + membership rules**.

## The canonical core
| Schema | Purpose | Membership rule |
|---|---|---|
| `platform` | The canonical **spine**: `_base_entity`, the polymorphic satellites (`activity_log`, `comments`, `associations`, `categories`, `user_entity_state`), the registries (`entity_types`, `entity_relationships`, `org_module_config`), and the shared triggers. | Cross-cutting platform machinery only. Not a feature home. |
| `iam` | **Identity & access**: organizations members, invitations, memberships, `permissions` resolver, and the RLS toolkit (`apply_rls`, `verify_canonical`, `has_access`, `has_org_access`). | Auth/permission primitives. |
| `history` | **Versioning**: `row_versions` (monthly-partitioned), written by the `_history` trigger. | Audit/version history only. |
| `graveyard` | **Retired tables** (reversible holding area; never hard-dropped during the soak). | Anything taken offline via `SET SCHEMA graveyard`. |

## Feature/domain schemas
| Schema | Purpose |
|---|---|
| `chat` | Conversations, messages, requests, agent runtime memory/traces (`cx_*`). |
| `agent` | Agent definitions, versions, shortcuts, templates, surface bindings. |
| `skill` | Skills, categories, resources, render components/definitions. |
| `tool` | Tool definitions, versions, UI, bundles. |
| `app` | Agent-app definitions, executions, errors, rate limits. |
| `workflow` | Workflow definitions, runs, triggers, checkpoints, jobs. |
| `context` | Scopes, scope types, context items (the user-authored context dimension). |
| `files` | Files, folders, versions, share links. |
| `ai` | AI models, providers, endpoints (registry). |
| `scraper` | Web-scrape pipeline tables. |
| `rag` | Retrieval / knowledge store (package: matrx-rag). |
| `runtime` | Global execution ledger (package: matrx-runtime). |
| `legal` | Legal-domain tables (package: matrx-legal). |
| `public` | **Legacy catch-all, being drained** (~255 tables). New work does NOT land here; tables migrate OUT of public into a domain schema as they're reorganized. |

## The pair to keep straight: `workspace` vs `workbench`
The one genuine ambiguity — close enough to mis-say in conversation, but a deliberate system distinction:

- **`workspace` = where work is *coordinated*.** Projects, tasks, threads — the containers and activity around getting things done. (Currently 4 tables.)
- **`workbench` = where the user's own *constructed materials* live.** "The user's bench of constructed materials." Bounds membership to **things the user builds**: authored content (notes, documents, workbooks) and user-defined data (datasets, picklists). *(New schema — `notes` is the founding member; see `docs/db_rebuild/proposals/notes-to-workbench.md`.)*

**Membership test for `workbench`:** is it content/data the *user authored or defined*? → workbench. Is it coordination/activity *around* work? → workspace. Is it platform machinery or a permission/identity primitive? → `platform`/`iam`. Sync plumbing, device tracking, and sharing records are **not** user-constructed materials — they belong to their owning concern (`iam.permissions` for sharing, the sync feature for device/sync rows), not workbench.

**Intended `workbench` roster:** `notes`, `note_folders`, documents, `udt_workbooks`, `udt_datasets*`, `udt_picklists*` (move incrementally, each via the `db-move-table-schema` skill).
