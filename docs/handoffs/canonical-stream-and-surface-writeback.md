---
status: active
updated: 2026-09-11
repos: [matrx-frontend, aidream]
---

# Pipeline streams + the surface 360 loop

## Vision — Arman's words

- Find the gap that let a hand-rolled keyword-research stream renderer get
  built despite the ban, and close it (done — `adoptForeignStream`).
- Extend surfaces so agents can not only READ a page but MODIFY it — "fully
  360". Unify user-facing and internal into ONE system; policy
  user-controllable from the binding.

## Resources

- Seam + policy machinery: `features/surfaces/runtime/surface-writeback.ts`
  (`applySurfaceWrite`, `listAgentWritableTargets`, `SURFACE_WRITE_TOOL_NAME`).
- Injection: `features/agents/redux/execution-system/utils/build-tool-injection.ts`
  (`buildSurfaceWriteInlineSpec`). Routing:
  `thunks/surface-delegated-tool-call.thunk.ts` → `thunks/dispatch-surface-write.thunk.ts`.
- Doctrine: `features/surfaces/FEATURE.md` §"The 360 loop" + §"Surface client tools".
- aidream server half: `aidream/services/conversation_context/surface_context.py`
  (`_write_targets_block`), `aidream/services/tooling/surface_resolver.py`,
  ORM model `db/managers/ui/ui_surface_write_target.py` (generated, deployed).
- Proving ground: any marketing page workspace
  (`/marketing/brands/<id>/sites/<id>/pages/<id>`), targets declared in
  `features/surfaces/manifests/marketing-page.manifest.ts`, handlers in
  `features/marketing/components/pages/MarketingPageWriteTargets.tsx`.
  Login: `/login` admin@admin.com / <see AI_ADMIN_PASSWORD in .env>; run an agent from the
  header "Agents for this page" popover.

## Avalanche campaign (Arman's directive, 2026-08-08)

Roll agent-writable targets across every surface where agent writes make
sense (judgment bar in the `surface-write-targets` skill — the campaign
recipe). Each agent: one surface (multiple data sets), live-agent verify,
then fire 3-5 self-replicating chips. Chips fired this session:
content-plan-node policy upgrade, notes editor, schedules form, CRM
create-party, marketing-page full coverage (the richest surface — nearly
every input should be agent-drivable; also spawns chips for the other
marketing surfaces). Later: specialized cheap agents per surface replace
Badass Agent for these writes.

## Closure plan — 2026-09-11 (owner: the session that wrote this; subagents per WP, lane named)

Arman's directive: close the write-back system for good — harden it to the
declared-kinds standard, fix every weakness found in the 2026-09 review, keep
docs + skills (Claude AND platform `skill.definition`) current, finish without
him. State at start: 371 targets / 109 manifests / 173 structured
(object|array) targets with NO declared value contract; approval is the inline
`requestApproval` card (2026-08-24), not `confirm()`.

| WP | Lane | Scope | Status |
|---|---|---|---|
| WP1 value contracts | standard/opus | `SurfaceWriteTarget.valueKind` (registered Kind slug — THE contract; no inline schemas, One-Type Law) → drift ratchet (advisory count of structured targets lacking a kind; unknown slug = error) → per-target kind schema in the `apply_surface_write` inline spec where aidream forwards it → `applySurfaceWrite` validates via `validateAgainstKind` BEFORE approval and handler → mirror column `ui.ui_surface_write_target.kind_key` (migration via `pnpm db:apply`, `pnpm db-types`, manifest-sync + SQL emitter) → aidream resolver + `<surface_write_targets>` print `kind=` → adopt on targets an existing Kind already fits → census of the rest | **done 2026-09-11** — seam/spec/mirror/ratchet were already live; this pass adopted `media_chapters` on `matrx-user/podcast-run:episode_chapters` (ratchet 187 → 186) and censused all 186 remaining structured targets below ("WP1 value contracts — adoption pass + census"). Adoption stops at one for three structural reasons recorded there; the follow-up is REGISTERING kinds, which is not this work package. |
| WP2 trap guard | standard/opus | code guard for the "structured-output mandate + write targets pauses forever" trap: no `apply_surface_write` / surface client-tool injection for a run whose agent carries an output contract; loud info line with remedy; forcing-function test; RUNTIME.md note | **done 2026-09-11** — `features/agents/redux/execution-system/utils/output-contract-guard.ts` (`resolveRunOutputContract`), consumed by `buildToolInjection`; keyed on `agent.definition.output_schema` (Redux when loaded, else the module-cached by-id read — no execution RPC returns that column, so a slice-only guard would have guarded nothing) and on the mandate's declared `output_kind` when the catalogue is warm; one `console.info` per conversation naming the agent, the evidence and the remedy; forcing test `utils/__tests__/structured-output-write-tool-guard.test.tsx` (4 cases, proven red before the guard). Server kill switch `auto_tools_disabled` untouched. NOT done: no run-UI signal — see the note below. |
| WP3 handler guard | standard/opus | `pnpm check:surface-write-handlers`: every declared target has a registered handler (AST over `getWriteHandlers` / `useSurfaceWriteHandlers`), self-test failing-then-passing, advisory in release gates; wire every fixable gap | open |
| WP4 platform skills | standard/opus (aidream) | `scripts/ingest_skills.py` across all repos (platform `skill.definition` reference skills frozen at 2026-07-16); delete merged `surface-registration` stub (dir + row); make ingest part of the existing doctrine sync path, never a new schedule | open |
| WP5 mirror hygiene | standard/opus | stale-row age in drift report; recency guard on global `deleteStale`; `synced_by`/`synced_from` provenance on the 4 mirror tables; unify `errorResponse` across `app/api/admin/surfaces/*` | open |
| WP6 small fixes | quick/sonnet | drop empty `writeTargets: []` (3 manifests); actorLabel fallback via the shared agent-name cache; FEATURE.md adopter paragraph → counts + exemplars; skill Step 3 matches the ApprovalCard flow | done (2026-09-11, `ad207e01aa`) — items 2-4 shipped as scoped; item 1's premise did not hold: agent-settings/mandates/pdf-extractor manifests all already declare real, non-empty `writeTargets`, and no `writeTargets: []` exists anywhere under `features/surfaces/manifests/` |
| WP7 independent verify | standard/opus | after WP1–6: live agent run on `/tasks` + a marketing page + admin drift page; adversarial re-verify of each WP's claim | open |

Rules for every WP: shared checkout — `git add <own files>` + `git commit -m … -- <own files>`, push `main`, never stash/reset; `pnpm type-check` before done; docs (FEATURE.md change log, this table) in the same commit; live verification only on the ONE dev server (`pnpm preview:start`, port 3001), one lane at a time.

## WP1 value contracts — adoption pass + census (2026-09-11)

The seam, the inline tool spec, the DB mirror and the drift ratchet all shipped
earlier. This pass did the last two clauses of the WP1 scope: **adopt on targets
an existing Kind already fits**, and **census the rest**.

**Ratchet: 187 → 186** structured (`object`/`array`) targets with no
`valueKind`, across 95 surfaces (`pnpm check:surface-drift`; 198 surfaces, 436
write targets total). Adoption was expected to be the minority and it is — it is
almost nothing, and the census below says exactly why.

### Adopted (1)

| Surface | Target | Kind | Why it genuinely fits |
|---|---|---|---|
| `matrx-user/podcast-run` | `episode_chapters` | `media_chapters` | The saved list already IS a `media_chapters` payload on this page: `EpisodeChaptersPanel` renders it through that kind's registered component, and the `podcast.chapter_marker` mandate emits the kind. The kind's schema (`{__kind, chapters:[{__kind, title, start_hint, summary?}]}`, `additionalProperties:false`) is a strict superset-free match for what `parseChaptersWrite` reads; the handler's extra rules (≤24 chapters, title/summary length caps, `MM:SS` regex) layer on top and are unaffected. The description now states that both `__kind` markers are required by the contract. |

### Why adoption stops at one — the three structural blockers

1. **Every registered kind's root is an OBJECT.** 28 targets take a *bare*
   `string[]` (tag sets, label sets, subtask titles, keyword lists). The nearest
   registered kind, `string_list`, is `{ items?: string[], __kind? }` — an
   object wrapper. Declaring it would make the seam reject exactly the value
   every handler wants, which is worse than no contract. These need either a
   root-array kind class in the registry or a (breaking) reshape of the
   handlers — a ruling, not a sweep.
2. **Kind schemas are `additionalProperties:false` and their `required` lists
   are complete instances; almost every target here is a PARTIAL PATCH.**
   ~103 targets (`field_patch` + `form_draft`) accept "any subset of these
   keys, omitted keys keep their current value". A complete-instance kind
   cannot express that. The registered kinds these resemble are also
   producer-shaped rather than page-shaped: `seo_meta_tags` requires
   `notes`, `target_keyword` and both char counts, so `marketing-page`'s
   `{ meta_title?, meta_description? }` patch cannot use it; `postal_address`
   requires `display`, which `crm-record`'s `add_address` never sends;
   `plan_family_names` is `{ names:[{label,reason}] }`, not
   `content-plan-setup`'s family-key→names map.
3. **Same-word ≠ same-shape.** A text search of every structured target's
   description against all 512 registered slugs returned only incidental word
   hits (`transcript`, `markdown`, `timeline`, `citation`) — none of them the
   target's actual value shape. `plan_entity_roster` and
   `masterwork_checkup_finding` appear in the handler files of
   `content-plan-entities` / `masterwork-rulebook`, but as the RENDER of a
   result, never as the shape of the write.

### The census — 186 structured targets with no contract

Grouped by the kind that would fit **if it were registered**; the group name is
the proposed kind (or kind family). Within a group, "per-surface" means the
follow-up registers one kind per row, not one kind for the group. Shapes are
quoted from the target description, which was checked against the page handler
(`getWriteHandlers` / `useSurfaceWriteHandlers`) for the families above.

| Proposed kind / family | Targets | Rough shape | Follow-up |
|---|---|---|---|
| `plain_string_list` | 28 | root array of plain strings | ONE kind — blocked on blocker 1 (root-array kinds) |
| `text_replace_patch` | 9 | `{ text\|html\|css\|markdown: string, mode?: "replace"\|"append" }` | ONE kind **if** the payload key is converged to `text` first; today four different key names |
| `list_sort_state` | 4 | `{ key, direction: "asc"\|"desc" }` | ONE kind — `matrx-user/files` must first drop its `sort_by`/`sort_direction` spelling |
| `list_filter_patch` | 6 | per-surface key set, each key replacing that filter outright | per-surface kinds; partial-patch semantics (blocker 2) |
| `ui_focus_ref` | 4 | `{ <entity>_id }` (+ a verb on two of them) | per-surface kinds; cheap and safe |
| `typed_row_list` | 10 | root array of uniform objects (nav links, list items, columns, sections, rank targets) | per-surface kinds — blocked on blocker 1 |
| `record_field_patch` | 15 | `{ <entity>_id: string, …optional fields }` | per-surface kinds; partial-patch semantics |
| `create_record` | 7 | complete new-row payload | per-surface kinds — the BEST candidates, since a create payload IS a complete instance |
| `field_patch` | 43 | partial patch over one entity's fields | per-surface kinds; blocker 2 |
| `form_draft` | 60 | partial patch staged into an on-screen form | per-surface kinds; blocker 2, and the lowest value (nothing persists) |

Recommended order for the follow-up: `create_record` (7) and `ui_focus_ref` (4)
first — complete instances, no partial-patch problem — then the ruling on
root-array kinds, which unblocks 38 more in two sweeps.

#### Per-target census

#### plain_string_list — 28 targets

| Surface | Target | type | mode | Accepted shape (from the handler + description) |
|---|---|---|---|---|
| `matrx-admin/agent-apps` | `app_tags` | array | entity | Value: an array of non-empty strings that REPLACES the full tag set — to add one, include the existing tags from selected_app_summary.tags. An empty array clears every ta |
| `matrx-admin/system-agents` | `agent_tags` | array | entity | Value: an array of short non-empty free-text strings (no fixed vocabulary, no leading '#'); pass an empty array to clear all tags. Saved immediately through the admin's o |
| `matrx-admin/tool-registry` | `tool_tags` | array | entity | Value: an array of at most 20 short strings, each 1-40 characters after trimming, with no duplicates and no commas inside a tag (the admin's tag editor is one comma-separ |
| `matrx-user/agent-apps` | `app_tags` | array | entity | Value: an array of non-empty plain strings. This REPLACES the FULL tag set rather than appending — read app_tags first and include every existing tag you want kept, or th |
| `matrx-user/agent-builder` | `agent_tags` | array | draft | Value: an array of short free-text tag strings (no fixed vocabulary, no leading '#'); pass an empty array to clear all tags. Staged into the editor as unsaved changes; th |
| `matrx-user/cms-page` | `page_tags` | array | draft | Value: an array of non-empty strings; it REPLACES rather than appends, so include the existing tags you want kept from the `tags` value ([] clears them). Tags have no dra |
| `matrx-user/connections-skills` | `skill_trigger_patterns` | array | draft | Value is an ARRAY OF STRINGS and REPLACES THE FULL SET, so include any existing patterns from skill_draft_trigger_patterns that should survive; send [] to clear them all. |
| `matrx-user/content-plan-node` | `node_brief` | array | draft | Stages a full replacement brief into the draft as an array of bullet-point strings. |
| `matrx-user/crm-record` | `party_role_ids` | array | entity | Value is an array of role category UUIDs from roles; category edges from other dimensions are preserved. |
| `matrx-user/education-assessment` | `generation_question_types` | array | draft | Stages the question-type mix into the create form. Array of strings drawn from: multiple_choice \| true_false \| fill_blank \| short_answer \| written_response. REPLACES  |
| `matrx-user/image-studio` | `selected_presets` | array | draft | Value: an array of preset id strings, e.g. ["og-image", "favicon-32"]. REPLACES THE FULL SET — include every preset you want kept, not just the new ones. Read selected_pr |
| `matrx-user/images` | `image_selection` | array | ui | Value is an array of image UUIDs, e.g. ["7f3a…", "b21c…"]; pass [] to clear the selection. It REPLACES rather than appends, so include every id you want selected, includi |
| `matrx-user/knowledge-search` | `retrieval_source_kinds` | array | draft | Value: an array that REPLACES the full filter (this is not an append; read the current value from `source_kinds` and send the complete new set). The array may hold AT MOS |
| `matrx-user/marketing-crawls` | `crawl_exclude_patterns` | array | draft | Stages the crawl's exclude list — the blacklist that drops discovered URLs before they are fetched, and wins over the include list. Array of strings, each a JavaScript re |
| `matrx-user/marketing-crawls` | `crawl_include_patterns` | array | draft | Stages the crawl's include list — the whitelist that narrows which discovered URLs get fetched. Array of strings, each a JavaScript regular expression matched against the |
| `matrx-user/notes` | `note_tags` | array | draft | Value: an array of short plain-text tag strings (free vocabulary, no leading '#'); pass an empty array to clear all tags. Staged into the live editor and autosaved. |
| `matrx-user/organization-performance-reviews` | `accomplishments` | array | entity | Value is an array of 0-5 non-empty strings; the ideal number is three. Include existing items you want kept. The accepted list is saved immediately through the page's bro |
| `matrx-user/organization-performance-reviews` | `opportunities` | array | entity | Value is an array of 0-5 non-empty strings; the ideal number is three. Include existing items you want kept. The accepted list is saved immediately through the page's bro |
| `matrx-user/organization-performance-reviews` | `responsibilities` | array | entity | Value is an array of 0-5 non-empty strings; the ideal number is three. Include existing items you want kept. The accepted list is saved immediately through the page's bro |
| `matrx-user/organization-performance-reviews` | `strengths` | array | entity | Value is an array of 0-5 non-empty strings; the ideal number is three. Include existing items you want kept. The accepted list is saved immediately through the page's bro |
| `matrx-user/page-research` | `keywords` | array | draft | Replaces the live keyword draft with one or two unique, non-empty strings. The user still reviews them and must click Start research before any paid work or attachment be |
| `matrx-user/quick-tasks` | `panel_add_subtasks` | array | entity | Value: a non-empty array of subtask title strings, in the order they should appear. This one SAVES on apply — the subtasks exist as soon as the user approves. It adds to  |
| `matrx-user/quick-tasks` | `panel_task_labels` | array | draft | Value: an array of label strings drawn from bug \| feature \| improvement \| docs \| design \| research \| question \| blocked. Send [] to clear every label. It REPLACES  |
| `matrx-user/research` | `add_keywords` | array | entity | Value: an array of keyword strings, in priority order. Additive — it never removes or reorders existing keywords, so send only the NEW ones (read keyword_list / keyword_c |
| `matrx-user/schedules` | `schedule_draft_tags` | array | draft | Stages the schedule's tag set into the draft — replaces the FULL set (include existing tags you want kept, from schedule_draft.tags). Array of up to 50 plain strings, eac |
| `matrx-user/tasks` | `add_subtasks` | array | entity | Value: array of subtask title strings, in order. |
| `matrx-user/tasks` | `task_labels` | array | draft | Stages the FULL label set into the draft (replaces, not appends — include existing labels you want kept, from active_task_labels). Array of: bug \| feature \| improvement |
| `matrx-user/war-room` | `add_threads` | array | entity | Value: a non-empty array of thread title strings, in the order they should appear. Appends only — it never renames or removes an existing thread. |

#### text_patch — 9 targets

| Surface | Target | type | mode | Accepted shape (from the handler + description) |
|---|---|---|---|---|
| `matrx-user/cms-component` | `component_css_content` | object | draft | Value: { css: string, mode?: 'replace' \| 'append' } — 'replace' (the default) swaps the whole stylesheet, 'append' adds to the end of the current buffer (append is the s |
| `matrx-user/cms-component` | `component_html_content` | object | draft | Value: { html: string, mode?: 'replace' \| 'append' } — 'replace' (the default) swaps the whole body, 'append' adds to the end of the current buffer. This is a SHARED com |
| `matrx-user/cms-page` | `page_html_content` | object | draft | Value: { html: string, mode?: 'replace' \| 'append' } — 'replace' (the default) swaps the whole body, 'append' adds to the end of the current buffer. This is a BODY FRAGM |
| `matrx-user/cms-site` | `site_global_css` | object | draft | Value: { css: string, mode?: 'replace' \| 'append' } — 'replace' (the default) swaps the whole stylesheet, 'append' adds to the end of what is already there ('append' is  |
| `matrx-user/marketing-page` | `page_draft_content` | object | draft | Value: { markdown: string, mode?: 'replace' \| 'append' } — 'replace' (default) swaps the whole staged draft, 'append' adds after the current draft. STAGED into the Draft |
| `matrx-user/organizations` | `org_description` | object | entity | Value: { text: string, mode?: 'replace' \| 'append' }. 'replace' (the default) swaps the FULL description — read the `org_description` value first if you mean to extend i |
| `matrx-user/transcripts` | `transcript_body` | object | draft | Value: { text: string, mode?: 'replace' \| 'append' } — 'replace' (default) swaps the whole body, 'append' adds after the current text. Paragraphs are separated by BLANK  |
| `matrx-user/transcripts-cleanup` | `cleaned_transcript_text` | object | draft | Value: { text: string, mode?: 'replace' \| 'append' }. 'replace' (the default) swaps the FULL text — read the `cleaned_transcript_text` value first if you mean to extend  |
| `matrx-user/transcripts-cleanup` | `custom_output_text` | object | draft | Value: { text: string, mode?: 'replace' \| 'append' }. 'replace' (the default) swaps the FULL text — read the `custom_output_text` value first if you mean to extend rathe |

#### sort_state — 4 targets

| Surface | Target | type | mode | Accepted shape (from the handler + description) |
|---|---|---|---|---|
| `matrx-user/crm` | `list_sort` | object | ui | Value is an OBJECT (not a JSON string) with either or both of: key — one of display_name \| party_kind \| job_title \| primary_domain \| created_at \| updated_at \| exper |
| `matrx-user/crm-manager` | `list_sort` | object | ui | Value is an OBJECT (not a JSON string) with either or both of: key — one of display_name \| party_kind \| job_title \| primary_domain \| created_at \| updated_at \| exper |
| `matrx-user/files` | `list_sort` | object | ui | Value: an OBJECT `{ "sort_by": …, "sort_direction": … }` — both keys required, because a column click always sets both. sort_by is one of: name \| type \| extension \| mi |
| `matrx-user/knowledge` | `extraction_sort` | object | ui | Sorts the extraction grid. Pass `{ "key": "<column key>", "direction": "asc" \| "desc" }` where key is one of the `key` fields in extraction_columns, or pass null to clea |

#### filter_state — 6 targets

| Surface | Target | type | mode | Accepted shape (from the handler + description) |
|---|---|---|---|---|
| `matrx-user/agents` | `catalog_filters` | object | ui | Value is an OBJECT containing ONLY the keys you want to change; every key is optional and each one you send REPLACES that filter outright. Keys: `search_query` (string; m |
| `matrx-user/crm` | `column_filters` | object | ui | Value is an OBJECT (send it as an object, not as a JSON string) with any of these keys: display_name \| job_title \| primary_domain \| party_kind \| do_not_contact \| exp |
| `matrx-user/crm-manager` | `column_filters` | object | ui | Value is an OBJECT (send it as an object, not as a JSON string) with any of these keys: display_name \| job_title \| primary_domain \| party_kind \| do_not_contact \| exp |
| `matrx-user/knowledge` | `suggestions_filter` | object | ui | Narrows the suggestion review queue. Pass an object with any subset of: `search` (string or null — ilike across proposed value / scope name / field label), `statuses` (ar |
| `matrx-user/knowledge-library` | `catalog_filters` | object | ui | Value is an OBJECT containing ONLY the keys you want to change; each key you send REPLACES that filter outright. Keys: `search_query` (string, matched client-side against |
| `matrx-user/knowledge-library` | `library_filters` | object | ui | Value is an OBJECT containing ONLY the keys you want to change; each key you send REPLACES that filter outright. Keys: `search_query` (string, matched server-side against |

#### ui_focus — 4 targets

| Surface | Target | type | mode | Accepted shape (from the handler + description) |
|---|---|---|---|---|
| `matrx-user/analysis-studio` | `studio_focus_annotation` | object | ui | Value: `{ annotation_id: string }`, required, and it must be an active annotation on this document. View state only: nothing is written to the document and there is nothi |
| `matrx-user/keyword-intelligence` | `keyword_selection` | object | ui | Value is { phrase: string, selected: boolean }. Ephemeral: it moves the window's selection only — the user still presses Add as supporting to persist. Rejected when the w |
| `matrx-user/keyword-intelligence` | `open_keyword` | object | ui | Value is { phrase: string }. Ephemeral navigation only; nothing is persisted. Useful for pivoting the user to a phrase you found in keyword_relationships or the SERP evid |
| `matrx-user/masterwork-rulebook` | `checkup_decision` | object | ui | Value: { finding_id: string, verb: 'approve' \| 'improve' \| 'reject' \| 'edit', alternative_index?: number }. Nothing is written to the Rulebook here — decisions accumul |

#### typed_row_list — 10 targets

| Surface | Target | type | mode | Accepted shape (from the handler + description) |
|---|---|---|---|---|
| `matrx-user/cms-site` | `site_navigation` | array | draft | Value: the FULL menu as an array of `{ label, href }` objects, rendered in the order given — it REPLACES the current list, so include every link you are keeping (read `si |
| `matrx-user/content-plan-entities` | `add_entities` | array | entity | Value: a non-empty array of objects `{ label, entity_type, description?, reason? }`, where `label` is a non-empty string and `entity_type` is exactly one of: person \| so |
| `matrx-user/education-learn-authoring` | `add_sections` | array | draft | Value: a JSON ARRAY of section objects in the same `EduSection[]` vocabulary as `doc_sections`, with the same exact field names (an FAQ section is { kind: 'faq', heading? |
| `matrx-user/education-learn-authoring` | `doc_sections` | array | draft | Value: a JSON ARRAY of section objects (the `EduSection[]` vocabulary) — pass the array itself, not a string containing JSON, and no code fence. Field names are checked,  |
| `matrx-user/list-manager` | `add_list_items` | array | entity | Value: a non-empty array of objects { label, description?, help_text?, group? }. `label` is required and is the short name shown in the list; `description` is the longer  |
| `matrx-user/lists` | `add_list_items` | array | entity | Value: a non-empty array of objects { label, description?, help_text?, group? }. `label` is required and is the short name shown in the list; `description` is the longer  |
| `matrx-user/marketing-discovery` | `item_classifications` | array | draft | Value is a NON-EMPTY ARRAY of objects: [{ item_id: string, kind: string, label?: string }]. `item_id` must be the id of a row currently loaded on the PENDING tab — read t |
| `matrx-user/marketing-page` | `page_image_plan` | object | entity | Value: { images: [{ description: string, alt?: string, placement?: string, style?: string }], mode?: 'replace' \| 'append' } — 'append' (default) adds after the current p |
| `matrx-user/marketing-ranks` | `track_keywords` | array | entity | Value is an array of { keyword: string, mode: string, location_name?: string, cadence_days?: number } — mode is a tracking_modes id: google_national \| google_location \| |
| `matrx-user/pdf-extractor` | `extraction_output_columns` | array | draft | Value: an ARRAY of column objects, which REPLACES the whole column list (read `extraction_output_columns` first and include the columns you want to keep). Pass an empty a |

#### record_field_patch — 15 targets

| Surface | Target | type | mode | Accepted shape (from the handler + description) |
|---|---|---|---|---|
| `matrx-admin/agent-review` | `review_triage_classification` | object | entity | Re-classifies how ONE row is ROUTED, saved immediately through the page's canonical update. Object value: { row_id: string, lane?, priority?, workstreams?, required_tools |
| `matrx-user/context-items` | `add_context_items` | object | entity | Value: { scope_type_id: string, items: [{ display_name: string, description?: string, category?: string, value_type?: string }] } — scope_type_id comes from scope_types_s |
| `matrx-user/context-items` | `context_item_category` | object | entity | Value: { item_id: string, category: string \| null } — null or "" clears it. Free text, but stay inside the app's own vocabulary unless the user already uses something el |
| `matrx-user/context-items` | `context_item_copy` | object | entity | Value: { item_id: string, display_name?: string, description?: string } — at least one of the two; each provided key REPLACES that whole text (read context_item_authoring |
| `matrx-user/context-items` | `context_item_status_note` | object | entity | Value: { item_id: string, status_note: string \| null } — null or "" clears it; a string REPLACES the note. This is the NOTE only: the item's status itself is not agent-w |
| `matrx-user/context-items` | `context_item_tags` | object | entity | Value: { item_id: string, tags: string[] } — REPLACES every tag on the item (read context_item_authoring and include the existing tags you want kept); an empty array clea |
| `matrx-user/crm-record` | `add_employment` | object | entity | Value: { employer_party_id: company UUID, title?: string, department?: string, start_date?: YYYY-MM-DD, is_current?: boolean, is_primary?: boolean }; the employer must be |
| `matrx-user/data-tables` | `cell_value` | object | entity | Value is an object with all three keys: { row_id: string, field_name: string, value: string \| number \| boolean \| null }. `row_id` is the row's UUID — take it from the  |
| `matrx-user/education-flashcard-editor` | `card_content` | object | entity | Value: { card_id: string, front?: string, back?: string } — `card_id` is REQUIRED and must be the id of a card in this set (read `cards` to get it), and you must provide  |
| `matrx-user/education-planner` | `goal_status` | object | entity | Value is an OBJECT: { goal_id: string (required — the `id` of the entry in study_goals), status: "active" \| "achieved" \| "archived" }. "achieved" is for a goal the lear |
| `matrx-user/education-planner` | `update_goal` | object | entity | Value is an OBJECT: { goal_id: string (required — the `id` of the entry in study_goals; it decides WHICH goal changes), title?: string (plain text), target_date?: string  |
| `matrx-user/knowledge` | `extraction_field_correction` | object | entity | Value: an object `{ row_id, column_key, value }`; the column source must be `agent` or `validation`. One cell per call. |
| `matrx-user/knowledge` | `extraction_review_field` | object | entity | Value: an object `{ row_id, column_key, value }`; the column source must be `manual`. One cell per call. |
| `matrx-user/marketing-reputation` | `reputation_case_triage` | object | entity | Value is an object: { case_id: string, status: accepted \| in_progress \| monitoring \| completed \| dismissed, note?: string }. `case_id` is REQUIRED and must be the `id |
| `matrx-user/marketing-site-keywords` | `attach_page_keywords` | object | entity | Value: { page_id: string, keywords: string[] } — page_id is a web.page id, typically a row's top_page_id (the page already ranking for the query). Each phrase is upserted |

#### create_record — 7 targets

| Surface | Target | type | mode | Accepted shape (from the handler + description) |
|---|---|---|---|---|
| `matrx-user/cms-site` | `add_page` | object | entity | Value is an OBJECT (send the object itself, not a JSON string): `{ title: string (required, plain text), slug?: string (lowercase letters, digits and single hyphens only  |
| `matrx-user/crm-record` | `add_address` | object | entity | Value: { purpose: office \| billing \| shipping \| home \| mailing \| other, line1?: string, line2?: string, locality?: string, region?: string, postal_code?: string, cou |
| `matrx-user/crm-record` | `add_contact_point` | object | entity | Value: { channel: email \| phone \| social \| url, value: string, label?: string, purpose?: work \| personal \| mobile \| direct \| switchboard \| main \| billing \| supp |
| `matrx-user/crm-record` | `log_interaction` | object | entity | Value: { channel: call \| email \| meeting \| sms \| social \| note \| task \| other, direction: outbound \| inbound, subject?: string, body?: multiline string, duration_ |
| `matrx-user/education-flashcard-editor` | `add_cards` | object | entity | Value: { cards: [{ front: string, back?: string, card_kind?: 'basic' \| 'cloze' }] } — `front` is required on every entry; `back` defaults to empty. `card_kind` defaults  |
| `matrx-user/education-planner` | `create_goal` | object | entity | Value is an OBJECT: { title: string (required, plain text — what the learner is working toward, e.g. "Ace the AP Bio unit 3 exam"), target_date?: string \| null (the exam |
| `matrx-user/quick-tasks` | `quick_create_task` | object | entity | Value: an object with title (required, non-empty string) and any of description (string, markdown-friendly), priority (low \| medium \| high), due_date ("YYYY-MM-DD"). Pa |

#### field_patch — 43 targets

| Surface | Target | type | mode | Accepted shape (from the handler + description) |
|---|---|---|---|---|
| `matrx-admin/agent-apps` | `app_metadata` | object | entity | Value: a partial object with any of { name?: string, tagline?: string, description?: string } — the three fields the admin's 'Edit name / tagline' modal edits. Omitted fi |
| `matrx-user/analysis-studio` | `annotation_extracted_text` | object | entity | Value: `{ text: string, annotation_id?: string }`. The text REPLACES the region's current `extracted_text` in full (there is no append) — this is for transcribing or clea |
| `matrx-user/analysis-studio` | `annotation_label` | object | entity | Value: `{ label: string, annotation_id?: string, label_category?: string }`. `label` is a label-catalog id (the raw `label` in the annotations value, e.g. "invoice_number |
| `matrx-user/analysis-studio` | `annotation_redact` | object | entity | Value: `{ redact: boolean, annotation_id?: string }`; true marks it, false clears the mark. This is the region context menu's own "Mark for redaction" toggle. It does NOT |
| `matrx-user/crm-record` | `identity_fields` | object | entity | Value is an object containing one or more of: display_name, first_name, last_name, job_title, headline, legal_name, primary_domain, timezone, bio; omitted fields are pres |
| `matrx-user/education-flashcard-editor` | `set_details` | object | entity | Value: { name?: string, topic?: string, description?: string } — provide at least one; omitted fields keep their current value, and an empty string clears `topic`/`descri |
| `matrx-user/keyword-research` | `cluster_scope` | object | ui | Value is an object: { mode: replace \| append, primary_keyword: string, phrases: string[] }. mode "replace" REPLACES the full set — include every phrase you want kept, re |
| `matrx-user/list-manager` | `update_list_item` | object | entity | Value: an object { id, label?, description?, help_text?, group? }. `id` is REQUIRED and must be the `id` of an item you read from all_items — it is how the item is found, |
| `matrx-user/lists` | `update_list_item` | object | entity | Value: an object { id, label?, description?, help_text?, group? }. `id` is REQUIRED and must be the `id` of an item you read from all_items — it is how the item is found, |
| `matrx-user/maps` | `replace_map` | object | entity | Replaces and immediately saves the COMPLETE DiagramData object for the open map after user confirmation. Read map_json first and include every box, section, arrow, id, po |
| `matrx-user/marketing-backlinks` | `backlink_refresh_schedule` | object | entity | Set how often we automatically check this site for new backlinks, through the same Save the schedule editor uses. Send an object with any of { enabled: boolean, cadence:  |
| `matrx-user/marketing-brand` | `brand_identity` | object | entity | Value: { industry?: string, description?: string }; omitted fields keep their current value, an empty string clears the field. The brand NAME is human-owned and NOT writa |
| `matrx-user/marketing-brand` | `brand_profile` | object | entity | Value: a partial object with any of { audience?: string, voice_tone?: string, positioning?: string, service_area?: string, content_guidelines?: string, notes?: string, va |
| `matrx-user/marketing-competitors` | `competitor_classification` | object | entity | Confirms one currently loaded proposed competitor classification exactly as shown in the approval chip. The user remains the decision-maker; the action writes the human c |
| `matrx-user/marketing-competitors` | `competitor_tracking` | object | entity | Sets one competitor's tracking status — the same change as the Track / Stop tracking row action, saved immediately through the canonical RPC. Send an object { "competitor |
| `matrx-user/marketing-competitors` | `opportunity_status` | object | entity | Moves one prioritized opportunity through its workflow — the same change as the Accept / Start / Complete / Dismiss row actions, saved immediately through the canonical R |
| `matrx-user/marketing-findings` | `finding_suppression` | object | entity | Value is an object: { suppressed: boolean, reason?: string }. To suppress, send suppressed: true WITH a reason (a string, 500 characters or fewer) saying why this conditi |
| `matrx-user/marketing-page` | `page_headings_plan` | object | entity | Value: { outline: [{ level: 1-6, text: string }, …], notes?: string } — outline REPLACES the full planned outline (include every heading you want kept; read desired_value |
| `matrx-user/marketing-page` | `page_image_alts` | object | entity | Value: { alts: { [src: string]: string } } — keys are exact image src values from the observed images inventory (images.items[].src), values are the proposed alt text. Pr |
| `matrx-user/marketing-page` | `page_indexability_plan` | object | entity | Value: { canonical_url?: string, meta_robots?: string } (e.g. meta_robots 'index, follow' or 'noindex') — at least one; omitted fields keep their current desired value. P |
| `matrx-user/marketing-page` | `page_link_plan` | object | entity | Value: { accepted_anchor_texts?: string[], inbound_links?: [{ url: string, anchor_text?: string }], outbound_links?: [{ url: string, anchor_text?: string }] } — at least  |
| `matrx-user/marketing-page` | `page_meta_tags` | object | entity | Value: { meta_title?: string, meta_description?: string }; omitted fields keep their current value. Persists immediately through updatePageIntent with the version guard;  |
| `matrx-user/marketing-page` | `page_plan_notes` | object | entity | Value: an object with at least one of { identity_notes?, structured_data_notes?, strategy_notes?, performance_goals?, backlink_plan?, additional_content_notes? } — each a |
| `matrx-user/marketing-page` | `page_remove_keywords` | object | entity | Value: { keywords: string[] } — phrases matched case-insensitively against the attached keyword_batch (supporting role only; the primary target keyword is changed via pag |
| `matrx-user/marketing-page` | `page_social_card` | object | entity | Value: { og_title?: string, og_description?: string } — at least one; omitted fields keep their current desired value. Persists immediately through updatePageDesiredValue |
| `matrx-user/marketing-page` | `page_supporting_keywords` | object | entity | Value: { keywords: string[] }. Each phrase is upserted into the keyword library and associated through the canonical chokepoint (addPageSupportingKeywords); duplicates ar |
| `matrx-user/marketing-page` | `page_target_keyword` | object | entity | Value: { keyword: string }. Persists immediately through updatePageIntent (meta intent fields are preserved). |
| `matrx-user/marketing-ranks` | `set_tracking_active` | object | entity | Value is { target_ids: string[], is_active: boolean } where every id must be a target_id from rank_portfolio. |
| `matrx-user/marketing-site` | `site_description` | object | entity | Value: { description: string } (non-empty; REPLACES the current description in full — the current one is in site_description). Persists immediately through updateSiteIden |
| `matrx-user/marketing-site` | `site_name` | object | entity | Value: { name: string } (non-empty plain text; replaces the current name in full — the current one is in site_name). Persists immediately through updateSiteIdentity with  |
| `matrx-user/marketing-site-keywords` | `keyword_traffic_class` | object | entity | Value: { keywords: string[], traffic_class: 'money' \| 'educational' \| 'brand' \| 'mismatch' \| 'clear', notes?: string }. keywords are plain phrases (queries from visib |
| `matrx-user/marketing-site-keywords` | `library_keywords` | object | entity | Value: { keywords: string[] } — plain phrases, typically queries from visible_keyword_rows that show no workflow status or market data yet. Each phrase is upserted throug |
| `matrx-user/podcast-run` | `episode_description` | object | entity | Value: { description: string } — plain prose, non-empty, 2000 characters or fewer, no markdown headings. REPLACES the whole description; to extend the existing one, inclu |
| `matrx-user/podcast-run` | `episode_title` | object | entity | Value: { title: string } — one line, non-empty, 200 characters or fewer, no surrounding quotes. The episode SLUG and public URL are intentionally untouched, so the public |
| `matrx-user/settings` | `display_layout` | object | entity | Change how the app shell is arranged. Expects an OBJECT with any subset of these keys — send only the ones you want to change, the rest are left alone: dashboard_layout ( |
| `matrx-user/settings` | `language_defaults` | object | entity | Set the per-feature default languages. Expects an OBJECT with any subset of these keys: voice \| text_generation \| flashcards. Each value must be one of: en \| es \| fr  |
| `matrx-user/settings` | `text_generation_style` | object | entity | Set the default writing style for text-generation surfaces. Expects an OBJECT with any subset of: tone (neutral \| professional \| casual \| friendly \| formal \| creativ |
| `matrx-user/settings` | `voice_persona` | object | entity | Set how spoken replies are delivered. Expects an OBJECT with any subset of: emotion (free-text delivery hint like "cheerful" or "calm", max 80 characters), wake_word (the |
| `matrx-user/transcript-studio` | `cleaned_segment_text` | object | entity | Value: { id: string, text: string }. `id` is REQUIRED and must match an `id` in the `cleaned_segments` value exactly; `text` REPLACES that segment's text outright and mus |
| `matrx-user/transcript-studio` | `concept_item` | object | entity | Value: { id: string, kind?: string, label?: string, description?: string \| null }. `id` is REQUIRED and must match an `id` in the `concept_items` value exactly. Supply o |
| `matrx-user/transcripts` | `transcript_description` | object | entity | Value: { description: string } — plain text, may be empty to clear it. Replaces the stored description outright (this is NOT an append). Persists IMMEDIATELY through the  |
| `matrx-user/transcripts` | `transcript_speaker_label` | object | entity | Value: { from: string, to: string } — `from` must match an existing label in `speaker_list` exactly (case-sensitive); `to` is the new non-empty label. Only the speaker la |
| `matrx-user/transcripts` | `transcript_title` | object | entity | Value: { title: string } — a non-empty title, plain text, no timecodes. Replaces the stored title outright. Persists IMMEDIATELY through the same updateTranscript service |

#### form_draft — 60 targets

| Surface | Target | type | mode | Accepted shape (from the handler + description) |
|---|---|---|---|---|
| `matrx-admin/applications` | `app_notice` | object | draft | Value is an object that REPLACES the whole notice: {level, title, body, url?}. `level` must be exactly one of info \| warning \| critical; `title` and `body` are both REQ |
| `matrx-admin/bundles` | `new_bundle_draft` | object | draft | Value: an object with AT LEAST ONE of { name, description }. Each key REPLACES that whole input; omit a key to leave it exactly as the admin left it (nothing here appends |
| `matrx-admin/email` | `email_draft` | object | draft | Value: an object with AT LEAST ONE of { subject, message_body }. Each key REPLACES that whole field; omit a key to leave it exactly as the admin left it (nothing here app |
| `matrx-admin/feedback` | `announcement_draft` | object | draft | Value: an object with AT LEAST ONE of { title, message, announcement_type }. Each key REPLACES that whole field; omit a key to leave it exactly as the admin left it (noth |
| `matrx-admin/feedback` | `category_draft` | object | draft | Value: an object with AT LEAST ONE of { name, description }. Each key REPLACES that whole field; omit a key to leave it as the admin left it (nothing appends — read `cate |
| `matrx-admin/lookups` | `lookup_draft` | object | draft | Value: an object with AT LEAST ONE of { name, description }. Each key REPLACES that whole input; omit a key to leave it exactly as the admin left it (nothing here appends |
| `matrx-admin/mandates` | `mandate_exemplar_draft` | object | draft | Value: an object with AT LEAST ONE of `{ label, variables, user_input }`. Each key REPLACES that one field; omit a key to leave what the admin typed alone (read `mandate_ |
| `matrx-admin/mcp-servers` | `new_server_draft` | object | draft | Value: an object with AT LEAST ONE of `{ name, vendor, category, description }`. Each key REPLACES that one field; omit a key to leave what the admin typed exactly as the |
| `matrx-user/agent-advanced-editor` | `editor_catalog_profile` | object | draft | Value: an OBJECT (structured JSON, never a JSON-encoded string) with at least one of {"description": "a few sentences of plain prose, no markdown headings, up to 4000 cha |
| `matrx-user/agent-advanced-editor` | `editor_output_schema` | object | draft | Value: a JSON OBJECT (not a string of JSON) shaped {"name": "snake_or_dash_name", "description": "optional", "strict": true, "schema": {"type": "object", "additionalPrope |
| `matrx-user/agent-run` | `user_input_draft` | object | draft | Value: { "text": string (1-20000 characters), "mode"?: "replace" \| "append" } — `text` is required, `mode` is optional and defaults to "replace", which swaps the ENTIRE  |
| `matrx-user/agent-run` | `variable_values` | object | draft | Value: an object of { "<variable name>": <value> } — a PARTIAL patch, so ONLY the keys you pass change and every variable you omit keeps whatever it currently has (pass a |
| `matrx-user/agent-settings` | `settings_catalog_profile` | object | draft | Value: an OBJECT (structured JSON, never a JSON-encoded string) with at least one of {"description": "a few sentences of plain prose, no markdown headings, up to 4000 cha |
| `matrx-user/chat` | `input_draft` | object | draft | Value: { "text": string (1-20000 characters), "mode"?: "replace" \| "append" } — "replace" (the default) swaps whatever is in the composer, "append" adds after it on a ne |
| `matrx-user/cms` | `new_site_draft` | object | draft | Value: an object with AT LEAST ONE of `{ name, slug, domain }`, all strings. Each key REPLACES that one field; omit a key to leave the user's value exactly as they left i |
| `matrx-user/cms-page` | `page_meta_tags` | object | draft | Value: { meta_title?: string, meta_description?: string, meta_keywords?: string } — omitted fields keep their current value, and meta_keywords is ONE comma-separated stri |
| `matrx-user/cms-site` | `site_footer_config` | object | draft | Value: an object with any of `columns` (`[{ heading, links: [{label, href}] }]`), `copyright` (string), `legal_links` (`[{label, href}]`), `show_contact` / `show_social`  |
| `matrx-user/cms-site` | `site_theme_config` | object | draft | Value: the FULL token map as `{ group: { key: value } }` (bare top-level scalars allowed), e.g. `{ colors: { primary: '#0f766e' }, fonts: { body: 'Inter, sans-serif' } }` |
| `matrx-user/content-plan-entities` | `entity_draft` | object | draft | Stages values into the OPEN source editor dialog — the same staging buffer the user's own typing fills. NOTHING is saved: the user reviews the dialog and presses Save/Cre |
| `matrx-user/content-plan-node` | `node_attributes` | object | draft | Stages a full replacement vertical-attributes object into the draft. |
| `matrx-user/content-plan-setup` | `set_family_counts` | object | draft | Stages count overrides for the selected shape: an object mapping family keys to numbers. The route preview updates live; the user commits. |
| `matrx-user/content-plan-setup` | `set_family_names` | object | draft | Stages real page names for count-bearing families: an object mapping family keys to string arrays. A name list SETS that family's count and rewrites the previewed slugs.  |
| `matrx-user/crm-create-party` | `party_draft` | object | draft | Stages a drafted person or company into the open create form — the same fields the user would type, staged the same way. Object with any of: party_kind (person \| organiz |
| `matrx-user/education-fastfire` | `drill_config` | object | draft | Stages the drill's pace and behavior into the FastFire setup form, before the learner starts. Accepts a PARTIAL object — include only the fields you mean to change; omitt |
| `matrx-user/education-learn-authoring` | `doc_metadata` | object | draft | Value: { title?: string, summary?: string, subject?: string, letter?: string, keywords?: string[] } — provide at least one; omitted fields keep what the editor already ho |
| `matrx-user/education-learn-authoring` | `doc_related` | object | draft | Value: { tools?: string[], subjects?: string[], exams?: string[] } — pass the object itself, not a string containing JSON, and no code fence. Each array holds slugs (e.g. |
| `matrx-user/education-memory` | `generation_source` | object | draft | Value is an OBJECT; include only the fields you mean to set: { source_kind?: "deck" \| "topic", topic?: string (the material to build aids for, 3-500 characters, e.g. "Th |
| `matrx-user/education-mind-maps` | `generation_source` | object | draft | Value is an OBJECT; include only the fields you mean to set: { source_kind?: "deck" \| "topic", topic?: string (the subject to map, 3-500 characters, e.g. "The causes of  |
| `matrx-user/education-planner` | `plan_setup` | object | draft | Value is an OBJECT; include only the fields you mean to set: { title?: string (plain text — what they are studying for, e.g. "Spanish midterm"), exam_date?: string (the t |
| `matrx-user/education-practice-oral` | `practice_setup` | object | draft | Value is a partial patch OBJECT; include only the fields you mean to set, and omitted keys keep their current value: { focus?: string (the required steer — the subject, t |
| `matrx-user/education-tutor` | `tutor_message_draft` | object | draft | Value: { "text": string (1-8000 characters), "mode"?: "replace" \| "append" } — "replace" (default) swaps whatever is in the composer, "append" adds after it on a new lin |
| `matrx-user/feedback` | `feedback_draft` | object | draft | Value: an object with AT LEAST ONE of `{ description, feedback_type }`. Send it as structured arguments, never as a JSON-encoded string. Each key REPLACES that one field  |
| `matrx-user/html-page` | `page_seo_metadata` | object | draft | Value is ONE object with any of these OPTIONAL keys: { "meta_title": string, "meta_description": string, "meta_keywords": string }. Only the keys you send are changed — o |
| `matrx-user/image-generate` | `generation_request` | object | draft | Value: an object with AT LEAST ONE of `{ prompt, style, image_size, image_count }`. Each key REPLACES that one field; omit a key to leave it exactly as the user left it ( |
| `matrx-user/image-studio` | `conversion_settings` | object | draft | Value: an object with AT LEAST ONE of { output_format, output_quality, background_color, resize_fit, resize_position }. Each key REPLACES that one setting; omit a key to  |
| `matrx-user/image-studio` | `filename_base` | object | draft | Value: an object keyed by WHICH image to rename, with the new base as the value, e.g. { "1": "autumn-market-stall", "IMG_4821.png": "rooftop-solar-array" }. Read source_f |
| `matrx-user/image-studio` | `image_description` | object | draft | Value: an object with `file` PLUS at least one content key: { file, alt_text?, caption?, title?, description?, keywords?, filename_base? }. file — WHICH image, given as t |
| `matrx-user/knowledge-data-stores` | `new_store_draft` | object | draft | Stages a NEW data store into the create form in the left column — the same three inputs the user would type. Object with any of: name (string, 1-200 chars), kind (one of  |
| `matrx-user/knowledge-search` | `retrieval_tuning` | object | draft | Value is a partial patch object: { rerank?: boolean, use_hyde?: boolean, multi_query?: integer 1-5, expand_entity_clusters?: boolean } — omitted keys keep their current v |
| `matrx-user/marketing` | `site_editor_draft` | object | draft | Value: an object { site, name?, description? }. `site` is REQUIRED and says WHICH loaded row to edit: its domain ("example.com", with or without scheme/www), its site_id, |
| `matrx-user/marketing-brand-assets` | `media_order` | object | draft | Value: a partial object with any of { type?: hero \| share-card \| infographic \| diagram \| blog-header \| photo \| product \| illustration, brief?: string, style?: stri |
| `matrx-user/marketing-competitors` | `autopsy_run_plan` | object | draft | Fills in the "Run a fresh autopsy" card WITHOUT running it — the user still presses "Run competitor autopsy", which is what spends provider credits and crawls competitor  |
| `matrx-user/marketing-crawls` | `crawl_options` | object | draft | Stages crawl-command settings into the New Crawl workspace's launch form — the same controls the user would set by hand. Object with any of: max_pages (integer 1-50000),  |
| `matrx-user/marketing-site-media` | `media_standards_notes` | object | draft | Value: { notes: string }, which REPLACES the current notes (pass "" to clear them). These notes ride along with every AI image order, so write them as instructions to an  |
| `matrx-user/marketing-site-media` | `media_standards_slots` | object | draft | Value: { slots: [{ name: string, width?: number\|null, height?: number\|null, format?: string\|null, max_kb?: number\|null, notes?: string }] }. The list REPLACES the ful |
| `matrx-user/marketing-site-settings` | `crawl_behavior` | object | draft | Value: { render_mode?: 'http_only' \| 'http_first' \| 'browser_always' \| 'browser_with_screenshot', respect_robots?: boolean, seed_from_sitemap?: boolean, follow_subdoma |
| `matrx-user/marketing-site-settings` | `crawl_budget` | object | draft | Value: { max_pages?: number (1-50000), max_depth?: number\|null (null or 0 = unlimited link depth), concurrency?: number (1-32), host_rps?: number (1-50 requests per seco |
| `matrx-user/marketing-site-settings` | `crawl_scope_patterns` | object | draft | Value: { include_patterns?: string[], exclude_patterns?: string[] } — each entry is a REGULAR EXPRESSION matched against the URL PATH only (e.g. ^/blog/, /tag/, \.pdf$),  |
| `matrx-user/marketing-site-settings` | `site_lifecycle` | object | draft | Value: { status: 'active' \| 'paused' \| 'error' }. Pausing stops automatic crawling and collection without deleting anything. Stages into the settings form — the user st |
| `matrx-user/masterwork-rulebook` | `rule_draft` | object | draft | Stages a complete or partial proposed rule in the page's Add/Edit Rule dialog. For edit mode, rule_id must identify a rule already present; the user sees the populated fo |
| `matrx-user/pdf-extractor` | `extraction_template_draft` | object | draft | Value: an object with AT LEAST ONE of `{ template_name, page_range, chunk_size, chunk_overlap }`. Each key REPLACES that one field; omit a key to leave it exactly as the  |
| `matrx-user/podcast-studio` | `episode_shape` | object | draft | Value: { language?, format?, theme?, host_count? } — omitted keys keep their current value, and at least one key is required. language is a BCP-47 code the surface offers |
| `matrx-user/quick-note-save` | `note_draft` | object | draft | Stages the note this window is about to save — the same fields the user would type into the open form, staged the same way. Object with any of: note_name, folder, content |
| `matrx-user/scanner` | `scan_page_labels` | object | draft | Value is a PARTIAL object map keyed by the page's `item_id`, e.g. `{"9f3c…": "Signature page", "1a20…": "Exhibit B"}`. Take the ids from `scan_items[].item_id`; do NOT pa |
| `matrx-user/schedules` | `schedule_draft_trigger` | object | draft | Stages the WHEN of the schedule into the editor draft — trigger type and config as ONE object, replacing the current trigger. Accepted shapes, exactly: { "type": "cron",  |
| `matrx-user/schedules` | `schedule_draft_variables` | object | draft | Stages the variable payload merged into every run, as one flat key/value object — replaces the FULL set; include existing entries you want kept, from schedule_draft.varia |
| `matrx-user/scraper` | `scrape_command` | object | draft | Value is a partial patch object: { mode?: quick \| full \| search, url?: string, keyword?: string } — omitted keys keep their current value, and at least one key must be  |
| `matrx-user/shapes` | `test_draft_instance` | object | draft | Seeds the Test tab's input form with a sample payload for this shape. Pass a JSON OBJECT of the shape's own fields — the `__kind` discriminator is added for you, so do no |
| `matrx-user/task-create` | `task_draft` | object | draft | Stages a drafted task into the open Quick Create form — the same fields the user would type, staged the same way, so they see it before anything is created. Object with a |
| `matrx-user/workbooks` | `workbook_sheet_names` | object | draft | Value is an object keyed by SHEET ID with the new name as the value, e.g. { "sheet-01": "Q3 Revenue", "sheet-02": "Assumptions" } — read workbook_sheets first to get the  |


## Remaining work

0. **WP2 left no run-UI signal, deliberately (2026-09-11).** The brief asked
   whether a cheap honest signal exists in the existing lifecycle UI. It does
   not: `SurfaceContextWindow` answers "what could an agent write here" per
   SURFACE and knows no conversation, and `WritePolicyEditor` /
   `AgentAccessColumn` describe the surface's own policy per TARGET and never
   read `output_schema`. The suppression itself breaks no on-screen promise —
   the agent is never offered the tool, and user-origin writes plus every
   non-structured agent are untouched. Making the binding UI say "this agent
   returns a structured result, so it cannot write this page" needs an
   `output_schema` read in the bind panel; that is a real (small) build, filed
   here rather than smuggled into the guard. The honest signal today is the
   `console.info` from `announceWithheldSurfaceWriteTools`.

1. **aidream `block_stream.py` stays PARKED** — pipeline runs still stream
   bare chunks, not `render_block` envelopes. Four documented blockers at the
   top of `aidream/aidream/services/ai_execution/block_stream.py` (missing
   emitter-protocol methods called unguarded by providers; no turn-text
   accumulator; `blk_N` ids restart per instance; None-gated not
   capability-gated wrap). Fix all four with a forcing-function test asserting
   the protocol surface, then engage in `run_one_agent`. The FE does not need
   it (`StreamBlockAccumulator` builds envelopes client-side) — it is a server
   optimization.
2. **Page-agent pipeline surfaces not adopted** — 4 pipeline call sites emit
   render-block streams (`seo/keyword_research.py` ×2, `seo/page_agents.py`
   ×2) but the page-agent surfaces never call `adoptForeignStream`, so those
   events are ignored (degrades to saved artifact). Cheap, high value.
3. **Surface client tools: no adopter, no DB mirror, no
   `check:surface-drift` coverage** — the seam is fully wired
   (declare → register → inject → dispatch) but no manifest declares one.
4. **Agent-facing kind skills** — the three LSI kinds' teaching blocks don't
   mention the apply affordances, so agents don't describe them to users.
5. **`actorLabel` polish** — the ask dialog says "An agent wants…" when the
   agent definition isn't hydrated in the agent-definition slice
   (`dispatch-surface-write.thunk.ts` falls back). Consider a name lookup
   that doesn't depend on slice hydration.
6. **Cross-agent policy residual** — two agents launched on the SAME surface
   in one tab share the surface's policy resolution (documented in
   `surface-writeback.ts`); needs per-request policy scoping only if it bites.
7. Opportunistic: `listLiveWriteTargets()` runs in the Surface Context
   window's render body on a 400ms poll, re-invoking every provider's
   `getWriteHandlers()`.
8. Observed (pre-existing, delegated-resume class): server stream warning
   `request_context_changed` (`source_feature: 'ai-results' →
   'conversation_resume'`) fires once per delegated-tool resume.

## Done

- `adoptForeignStream` + `consumeStream` on `callApi` — pipeline streams render canonically; both bespoke renderers deleted; `matrx/no-bespoke-stream-renderer` ESLint at error.
- 360 loop v1 — `writeTargets`/`applySurfaceWrite`/UI-state reads/`applyPolicy` + per-binding `write_policies` (DB v2 payload, merge layers, launch registration, manual floor); editor UI everywhere the binding lives; shortcut storage under `__write_policies`.
- Marketing-page targets live (`page_meta_tags`, `page_target_keyword`, `page_supporting_keywords`, `page_draft_content`) + LSI kind components' user-origin buttons.
- **Agent-origin stream side wired (2026-08-08)** — `apply_surface_write` inline tool injected per turn from `listAgentWritableTargets()`, routed to `applySurfaceWrite(origin:"agent")`; decline = non-error result. **E2E-verified live** on the marketing-page workspace: agent call → ask confirm → Apply → `updatePageIntent` saved + fields updated + loop resumed.
- `pnpm type-check` green; aidream ORM model for `ui.ui_surface_write_target` generated and in the deployed build (`/health/version` SHA verified 2026-08-08).
- **Tasks surface agent-writable (2026-08-08)** — second adopter, 8 ask targets, handlers in `TaskEditorBody.tsx`; live-verified (4 targets one run). Campaign skill `.claude/skills/surface-write-targets/` written; 5 self-replicating chips fired.

## Decisions needed (Arman)

- **Ask-policy UX**: agent write approval is an inline `confirm()` at the
  moment of the write. If you want these queued in the same persistent inbox
  as proposed directives instead, say so — deliberate follow-up, not an
  oversight.
- **Write-target inheritance**: `writeTargets` do NOT inherit down the
  surface parent chain (values do). A child surface never implicitly gains
  the right to write its parent's fields. Say so if you want the opposite.
