# Tool Renderer Status — coverage by stage

**What renders each tool, and how complete it is.** Resolution order at runtime:
**in-code registry → DB renderer (`tool_ui`) → `GenericRenderer`** (the type-aware
field-library fallback that handles every unregistered tool well). Last audited
2026-06-21. Companion to `FEATURE.md` + `OVERHAUL_STATUS.md`.

`inline` = the expanded inline card · `overlay` = fullscreen · `window` = the
draggable panel. For DB renderers one compiled component serves all three.

## Stage 1 — In-code (hardcoded) renderers

Registered in `registry/registry.tsx`; code in `renderers/<name>/`. ~20 tools.

| tool(s) | renderer | inline | overlay | window | notes |
|---|---|---|---|---|---|
| `ctx_get` / `ctx_batch` / `ctx_patch` | CTX | ✅ | ✅ (=inline) | ✅ | `ctx_patch` shows the working-doc live diff |
| `sql` / `db_query` / `db_schema` | SQL | ✅ | ✅ (=inline) | ✅ | SQL→plain-English intent + result table |
| `research_web` / `core_web_search_and_read` / `core_web_read_web_pages` | Deep Research | ✅ | ✅ (OverlayTabs) | ✅ | stay-open |
| `web_search_v1` | Web Research | ✅ | ✅ | ✅ | stay-open |
| `core_web_search` | Multi-Query Search | ✅ | ✅ | ✅ | stay-open |
| `web_search` | Web Search | ✅ | ⚠️ adapter→generic | ✅ | overlay degrades to generic on a persisted snapshot (no live events) |
| `news_get_headlines` | News | ✅ | ✅ | ✅ | stay-open; **window-panel empty bug FIXED 2026-06-21** |
| `rag_search` | RAG Search | ✅ | ✅ (=inline) | ✅ | stay-open |
| `get_user_lists` | User Lists | ✅ | ✅ | ✅ | stay-open |
| `seo_check_meta_tags_batch` | SEO Meta Tags | ✅ | ✅ | ✅ | stay-open |
| `seo_check_meta_titles` | SEO Titles | ✅ | ⚠️ generic | ✅ | **gap: no OverlayComponent** → overlay/window "Results" tab falls back to generic |
| `seo_check_meta_descriptions` | SEO Descriptions | ✅ | ⚠️ generic | ✅ | **gap: no OverlayComponent** (same) |
| `random_wheel` | Random Wheel | ✅ | ✅ (=inline) | ✅ | stay-open |

## Stage 2 — DB-loaded renderers (`tool_ui`, runtime-compiled)

Agent-authored code on surface `matrx-default/default`, contract_version 2. 17
tools. Seeds: `migrations/tool_ui_db_renderer_examples{,_2,_3,_4}.sql` +
`_subtitles.sql`. `read_page` was authored by the Tool Renderer Author agent.

| tool | what it renders | self-describing (label · subtitle) |
|---|---|---|
| `fs_list` | folder/file list | Directory · N items |
| `fs_read` | file/code viewer | File · path |
| `shell_execute` | terminal (cmd · stdout · exit) | Shell · command |
| `memory` | sparse status + importance bar | Memory · key |
| `data` | **shape-tolerant** table `{rows}` / record `{record}` | Data · N rows / resource_type |
| `travel_get_weather` | weather card | Weather · city |
| `travel_get_restaurants` / `travel_get_events` | list cards | · city |
| `navigate_active_tab` / `get_active_tab` | page/tab card | · title-url |
| `tabs` | open-tab list | Tabs · N |
| `find` / `find_text_on_page` | match lists | · query |
| `click_element` | terse action status | Click · tag |
| `read_page` | a11y element list (role icons) | Read Page · N elements (stay-open) |
| `get_page_text` | readable article extract | Page Text (stay-open) |
| `agent_call` | sub-agent result | (first DB renderer) |

## Stage 3 — Generic (every other tool)

Any tool with NO in-code + NO DB renderer renders through `GenericRenderer`
(the `result-fields/` shape-aware library: table / key-value / markdown /
durable media / json tree / url chips / scalar / UUID-shorten / empty / error).
~97% of distinct tools land here — and it's good, not a raw dump. To upgrade a
tool: author a DB renderer (the `create-tool-renderer` skill / the Tool
Renderer Author agent) — no code deploy.

## Config notes

- **stay-open** (result is the point — doesn't fold when done): in-code via the
  `RESULT_IS_PURPOSE_TOOLS` set + per-entry `displayMode`; DB via the row's
  `keep_expanded_on_stream` flag. Resolved in `getToolDisplayMode`.
- **Known open gaps:** `seo_check_meta_titles` / `seo_check_meta_descriptions`
  overlays fall back to generic (add an OverlayComponent); `web_search` overlay
  degrades to generic on a persisted snapshot. Both are minor — inline is fine.
