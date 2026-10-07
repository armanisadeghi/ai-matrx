---
name: migrate-notion-to-ai-matrx
description: Moves a person's whole Notion workspace into AI Matrx using only the AI Matrx and Notion connectors — every page and sub-page becomes an AI Matrx page (a Space) with its blocks, icons, covers, files and comments, and every database becomes a real table with typed columns, links, roll-ups, row pages, templates and views. Safe to run again; nothing duplicates. Use when the person says "move my Notion into AI Matrx", "copy my Notion", "import my Notion", or anything like it.
---

# Move a Notion workspace into AI Matrx

You need exactly two connectors in this AI, both added by clicking Connect and signing in:
**AI Matrx** (tools `how_to`, `tables`, `pages`, `agents`) and **Notion** (Notion's own connector).
No keys, files, scripts or commands — ever. Never ask the person for any.

**First call:** `how_to` with `{"topic": "notion"}`. It is the live copy of this recipe. If it and
this file ever disagree, follow `how_to`.

## 0. Before you start

- Call `tables` `{"action": "list_tables"}`. If the AI Matrx tool is missing, tell the person in one
  sentence: "Please connect AI Matrx in this app's connector settings, then tell me." Same for Notion
  (use Notion's search tool to check). Then wait.
- Never ask which organization: AI Matrx already knows where this connection files new work
  (`create_table` answers its `organization_id`). Only if an answer says it needs one, ask once,
  offering the organizations it listed, and pass `organization_id` on every call after.
- `list_tables` and `pages list` show everything the person can see, across all their
  organizations — many tables may share a name like "Clients". So after you create something,
  always refer to it by the **id** in your ledger, never by its name.
- A call that fails with a connection error, "connection was closed", or HTTP 401/502/503 is
  safe to send again unchanged — every call is idempotent. Retry up to 3 times.
- The person is not technical. Plain words. Ask exactly ONE question — the plan — then work
  without asking. One short progress line after each database or top-level page.

## 1. Inventory (the ledger)

With Notion's search and fetch tools, list everything and keep a ledger as you go:
- every database (data source): its name, every property with its type, its row count, its
  views (board/calendar/gallery/timeline + group/date field), its templates;
- every page that is not a database row: title, parent page, icon, cover;
- every database row's page: whether it has body content;
- comments (on pages and rows).

**Starting again in a new conversation?** Rebuild the ledger first: `pages`
`{"action": "list", "key_prefix": "notion:", "limit": 200}` gives `external_key → space_id`, and
`tables` `{"action": "list_rows", "table": "<id>", "limit": 200}` gives each row's "Notion ID" →
row `id` (tables you made earlier: look for the "Notion ID" column via `columns`).

As you create things, add the AI Matrx ids to the ledger: Notion database id → table id,
Notion page id → `space_id`, Notion row id → row id. Every key you send is `"notion:<id>"` for
pages/comments and the raw Notion page id in the "Notion ID" column for rows.

## 2. Show the plan, ask once

One line per database and one for pages, e.g.:
> **Posts** (54) → table: Status (board), Platform (several choices), Publish date (calendar),
> links to Campaign and Client, each post's page attached. **Pages:** 31 pages and sub-pages, 5 comments.

Ask: "Shall I move it all over?" Then do every phase below without asking again.

## 3. Phases — in this order

**3a. Databases → tables.** For each database, `tables`:
```json
{"action": "create_table", "name": "<database name>", "columns": [
  {"name": "<title property>", "type": "text"},
  {"name": "Notion ID", "type": "text", "unique": true},
  {"name": "Status", "type": "status", "choices": ["Idea", "Drafting", "Published"]},
  {"name": "Platform", "type": "choices", "choices": ["Instagram", "TikTok"]},
  {"name": "Publish date", "type": "date"}, {"name": "Publish date end", "type": "date"},
  {"name": "Budget", "type": "currency"},
  {"name": "Assets", "type": "file", "many": true}]}
```
Property map: title → text (first column) · rich_text → text / long_text · number → number,
currency or percent by its format · select → choice · multi_select → choices · status → status
· date → date (a range adds "<name> end", also date) · checkbox · url · email · phone_number →
phone · files → file (`"many": true`) · people → text (names) · created/edited time → date ·
unique_id → text. Always give `choices` for choice/choices/status. (A currency column reads back
as `number` with `unit: "USD"` — that is it.) Sent again, `create_table` answers `created: false`
with the same id; its `differs` list just names columns you added later — not an error.

Then, once EVERY table exists, add the computed and linking columns, one per call, `tables`
`{"action": "add_column", "table": "<table id>", "columns": [ … ]}` (sent again it answers
`unchanged: true`). Always use the other table's **id** in `to`:
- relation → `{"name": "Client", "type": "relation", "to": "<other table name or id>", "many": true}`
  (a two-way Notion relation appears on both databases — make each side once, as Notion shows it);
- rollup (count/sum/avg/min/max) → `{"name": "Total billed", "type": "rollup", "via": "Invoices", "of": "Amount", "agg": "sum"}`;
  a "count of <relation>" rollup → `"agg": "count"` with `of` = the linked table's first (title)
  column; a rollup that filters (e.g. only open ones) → count without the filter and say so;
- lookup → `{"type": "lookup", "via": "<relation column>", "of": "<far column>"}`;
- formula that is plain arithmetic → `{"type": "formula", "formula": "{Price} * {Quantity}"}`;
  any other formula or rollup → a column of its result type holding its current values (say so in
  the final report).

**3b. Rows.** `tables` `{"action": "upsert_rows", "table": "<id>", "key_column": "Notion ID",
"add_choices": true, "rows": [{"Notion ID": "<page id>", "Name": "…", "Status": "Idea",
"Platform": ["Instagram"], "Publish date": "2026-10-07", "Publish date end": "2026-10-14"}]}` —
at most 100 rows per call. Dates `YYYY-MM-DD`. Keep each answer's row `id` in the ledger.

**3c. Links and files** (second pass, same call, only the changed columns):
- relation cell → `{"match": "Notion ID", "keys": ["<linked page id>", …]}`;
- file cell → `[{"url": "<Notion file url>", "name": "brief.pdf"}]` — send a Notion file url right
  after reading it (they expire within the hour); AI Matrx keeps its own copy. On a rerun, skip
  file cells that already hold files (read the row first) — re-sending re-saves the same file.
The answer's `notices` list anything left out (a link to a page you did not move) — keep them for
the report.

**3d. Row pages.** For each row whose Notion page has body content, `pages`:
`{"action": "upsert", "key": "notion:<row page id>", "title": "<row title>", "row_id": "<AI Matrx row id>", "snapshot": {"v": 1, "blocks": [ … ]}}`.

**3e. Pages and sub-pages, parents first.** `pages`:
`{"action": "upsert", "key": "notion:<page id>", "title": "…", "parent_key": "notion:<parent page id>",
"icon": {"icon": "BookOpen"}, "cover": {"url": "<cover url>"}, "snapshot": {"v": 1, "blocks": [ … ]}}`
- top-level pages: leave out `parent_key`;
- a sub-page is TWO things: `parent_key` on the child AND a `page` block (`props.spaceId` = the
  child's `space_id`) in the parent's body where Notion showed it. First run: send the parent
  without its `page` blocks, make the children, then send the parent once more with them. If the
  ledger already has the children's `space_id`s (a rerun), send the parent ONCE with its full body
  — that answer is `content_changed: false` when nothing changed;
- a database that sits inside a page → a `database` block (`props.source {"kind": "table",
  "tableId": "<table id>"}`, `props.inline` true for inline, false for full page);
- icons: the closest Lucide icon name in PascalCase for a Notion emoji — 📘📖 BookOpen · ✅ BadgeCheck
  · ☑️📋 ListChecks · 💡 Lightbulb · ℹ️ Info · ⚠️ TriangleAlert · 📌 Pin · 📅 Calendar · 🏠 House ·
  👥 Users · 💰 Wallet · 🎯 Target · 🚀 Rocket · 📝 NotebookPen · 📁 Folder · ⭐ Star · 🔗 Link;
  anything else → the closest common Lucide name, or leave it out. An uploaded icon →
  `{"url": "<its url>"}`; covers → `{"url": "<url>"}`; a gradient or none → leave it out.
- the answer: `space_id`, `created`, `content_changed`, `version` (a new page starts at 2), and
  `placement` — `placed` (put under its parent), `row_body` (attached to the row), `unchanged`.

**3f. Comments.** On a page: `pages` `{"action": "comment", "space_id": "…", "key":
"notion:<comment id>", "block_id": "<the block it was on, if any>", "body": "**Maya Okonkwo** ·
2026-10-03\n\nThe comment text"}`. On a database row: `tables` `{"action": "add_comments",
"table": "<id>", "key_column": "Notion ID", "comments": [{"key": "<row page id>", "body": "…",
"author": "Maya Okonkwo", "at": "2026-10-03"}]}`.

`add_comments` answers counts (`added`, `unchanged`), not ids.

**3g. Views and templates.** For each board/calendar/gallery/timeline (a plain table view with
no filter or sort needs nothing — every table has one): `tables`
`{"action": "create_view", "table": "<id>", "name": "By status", "layout": "board", "group_by": "Status"}`
(calendar: `date_column`, `end_date_column`; gallery: `cover_column`; timeline: `date_column`,
`end_date_column`, `group_by`). For each database template: `tables`
`{"action": "create_row_template", "table": "<id>", "name": "New Instagram post", "values": {"Status": "Idea", "Platform": ["Instagram"]}}`.

## 4. Page blocks (the `snapshot`)

`{"v": 1, "blocks": [block, …]}`. A block: `{"id": "b1", "type": "…", "text": [spans],
"props": {…}, "children": [blocks]}`. `id` is unique within the page and stable — number them in
order (b1, b2, … ; children b5a, b5b …) so a rerun produces the same ids.

A span: `{"text": "…"}` plus any of `bold`, `italic`, `underline`, `strike`, `code` (true),
`link` (URL), `color` / `background` (default gray brown orange yellow green blue purple pink red).

| Notion | type | props / children |
|---|---|---|
| Paragraph | `text` | children = indented blocks |
| Heading 1/2/3 (toggle heading) | `heading` | `level` 1-3; `toggleable: true` + children = body |
| Bulleted / numbered list | `bulleted` / `numbered` | children = nested items |
| To-do | `todo` | `checked` true/false |
| Toggle | `toggle` | text = summary, children = body |
| Quote | `quote` | |
| Callout | `callout` | `icon` (Lucide, PascalCase), block `background` a color (Notion's `yellow_bg` → `yellow`); children = body |
| Divider | `divider` | no text |
| Code | `code` | text = the code, `language` |
| Equation | `equation` | `expression` (KaTeX) |
| Child page | `page` | `spaceId` |
| Link to page | `linkToPage` | `spaceId` |
| Simple table | `table` | `headerRow`, `headerColumn` (always send both), `rows` [{"cells": [[spans], …]}] |
| Table of contents | `tableOfContents` | |
| Columns | `columnList` | children = `column` blocks with `width` fractions summing to 1 |
| Image / video / audio / file / PDF | `image` `video` `audio` `file` `pdf` | `url` (AI Matrx keeps the file), `caption` spans |
| Web bookmark / embed | `bookmark` / `embed` | `url` |
| Inline or full-page database | `database` | `source`, `inline` |
| Anything else (synced block, button, …) | `text` | text says what it was; `unsupported: {"from": "notion", "kind": "<Notion type>", "source": "<its text or url>"}` |

Never invent a type. If `pages` answers refused naming a block, fix that block as the message says
and send the page again.

## 5. Check and report

- Each table: `tables` `{"action": "aggregate", "table": "<id>", "measure": "count"}` against the
  Notion row count. Spot-check links, roll-ups and files with `tables` `{"action": "get_row",
  "table": "<id>", "row_id": "<id>"}` or `{"action": "list_rows", "table": "<id>"}`.
- Pages: `pages` `{"action": "list", "key_prefix": "notion:", "limit": 200}` (follow
  `next_offset`). Other imports may appear there too, so check that every `space_id` in YOUR
  ledger is listed — don't compare totals.
- Tell the person a short list: one line per database ("✓ Posts — 54 of 54"), one for pages
  ("✓ 31 pages, 5 comments"), then "Could not carry over:" with each item and why in plain words
  (unsupported blocks, template page text, files whose links had expired, people kept as names,
  complex formulas kept as values). Then where to look: their pages at
  https://www.aimatrx.com/spaces and their tables at https://www.aimatrx.com/data.

## Running again, stopping, fixing

- Everything is matched by Notion id: running any phase again changes only what changed — rows
  report "same", unchanged pages make no new version, comments with the same key land once.
- Stopped partway (big workspace, lost connection)? Run the same phases again from the top.
- A page went wrong? `pages` `{"action": "archive", "key": "notion:<page id>"}` (its sub-pages go
  with it; `"restore"` brings it back), then upsert it again. Nothing is ever deleted.
- Work one top-level page or database at a time in a big workspace.

When it's done, offer the next step: turning their work into AI Matrx agents
(`how_to` topic "agents").
