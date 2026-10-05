---
name: migrate-notion-to-ai-matrx
description: Copies a person's whole Notion workspace into AI Matrx — every database becomes a table with typed columns, relations, roll-ups, files, page bodies and views — safely re-runnable and resumable. Use when the person says "copy my Notion into AI Matrx", "move my Notion over", "import my Notion", or hands you a Notion export zip.
---

# Copy a Notion workspace into AI Matrx

You move ALL of the person's Notion data into their own AI Matrx, as them, and prove nothing was
lost. They are not technical: speak plainly, ask exactly one confirmation (the plan), do the rest.

## 0. Make sure the two connections work

1. **AI Matrx MCP** — call `tables` with `action: "list_tables"`. If the tool is missing or refuses,
   walk them through connecting (one step at a time, wait for "done"):
   - They open AI Matrx → Settings → API keys → New key, name it "Claude", pick their organization, copy it.
   - Claude Code: they run
     `claude mcp add --transport http ai-matrx https://server.app.matrxserver.com/api/matrx-mcp --header "Authorization: Bearer <their key>"`
     and also `export AI_MATRX_API_KEY=<their key>` (the import script reads it), then restart Claude.
   - Claude desktop / claude.ai: Settings → Connectors → Add custom connector → URL
     `https://server.app.matrxserver.com/api/matrx-mcp` → sign in to AI Matrx.
   Either way the AI acts as them, with exactly their access (an organization can turn that off,
   and then writes wait for a person's approval).
2. **Their organization** — `list_tables` (or any refusal) names their organizations. Ask which one
   the Notion workspace goes into only if there is more than one; note its id.
3. **Notion** — the import reads a Notion export, the only way Notion hands over every page body
   and every file. Ask them to: Notion → Settings → Export all workspace content → Export format
   "Markdown & CSV", Include content "Everything", "Create folders for subpages" ON → Export, then
   download the zip from the email and tell you where it is (usually Downloads). If the official
   Notion MCP is also connected, use it in step 2 to read the real property types (formulas,
   roll-up definitions, two-way relations, views) and correct the plan.

## 1. Read the export and propose the plan

Run (the script is in this skill's `scripts/` folder; Python 3.9+, no installs):

```
python3 scripts/import_notion_export.py plan "<path to the zip or unzipped folder>"
```

It prints every database, its row count, and the type it proposes for every column, and writes
`notion-plan.json` beside the export. Read it, fix what is obviously wrong, then tell the person the
plan in plain words — one short line per database, e.g.:

> **Posts** (54) → table with Status (a board), Platform (several choices), Publish date (a calendar),
> Campaign and Client (links), Assets (links), the post's page as "Page content".

Rules for fixing the plan (edit `notion-plan.json`; never invent a word for anything):
- Column types: text, long_text, rich_text, email, phone, url, number, currency, percent, rating,
  duration, checkbox, date, datetime, choice, choices, status, relation, file, lookup, rollup, formula.
- A Notion **roll-up** becomes `{"type": "rollup", "via": "<relation column>", "of": "<far column>", "agg": "count|sum|avg|min|max"}`;
  a **formula** becomes `{"type": "formula", "formula": "{Price} * {Quantity}"}` when it is simple
  arithmetic, otherwise leave it as its stored value type and say so.
- **People** columns stay text (names); **created/edited time** stay dates; **unique IDs** stay text.
- A **date range** gets an `end` column (the script adds `"<name> end"`).
- Every table also gets a unique **Notion ID** column (what makes every rerun safe) and a
  **Page content** column (the page's body, as Markdown).
- `views`: keep the proposed All / board / calendar / gallery, add any the person named.

Ask once: **"Shall I move it all over?"** Change anything they ask, then go.

## 2. Move it

```
python3 scripts/import_notion_export.py run "<same path>" --organization <organization id>
```

It makes the tables, then the links between them, then writes every row in batches of 100 matched
on Notion ID, then the links, then the files, then the views, and finishes with a count of every
database, Notion against AI Matrx. A stopped or failed run is safe to start again with the same
command: finished work is skipped (`notion-progress.json` beside the export), and rows already
there are matched, never duplicated. Lines starting `note:` are things written differently from
the export (a link to a page that was not exported, a file that could not be read) — collect them.

## 2b. Bring the comments

Notion's export leaves out comments. If the official Notion MCP is connected, read each page's
comments with it, then send them per table in batches of ≤100:

```
tables action:"add_comments" table:<table id> key_column:"Notion ID"
       comments:[{"key": "<Notion page id>", "body": "<comment text>", "author": "<name>", "at": "<date>"}]
```

Each lands on its row's discussion with the original author and date leading it; sent again,
a comment already there is left alone. If the Notion MCP is not connected, tell them comments
stay in Notion and offer to bring them once it is.

## 2c. Bring the page templates

Notion's export leaves out database templates ("New post" with preset properties and a body
outline). If the Notion MCP is connected, read each database's templates with it and declare each
one on its table, values by column name, the body as the page-content column's value:

```
tables action:"create_row_template" table:<table id> name:"New Instagram post"
       values:{"Status": "Idea", "Platform": ["Instagram"], "Page content": "## Hook\n\n## Script\n\n## Hashtags"}
```

The same name again changes it. In AI Matrx they appear as "From template" beside "New record";
`create_row` with `template:"<name>"` makes a row from one.

## 3. Show them

Give them, in plain words:
1. The count table (every database ✓ or the difference and why).
2. The notes, grouped, each with what to do (usually nothing).
3. What did not come over and why: page templates and comments when the Notion MCP was not
   connected, and linked database copies (they became views of the
   one table).
4. Where to look: AI Matrx → Data (their tables are there, each with its views).

Then offer the next step: splitting their work into AI Matrx agents (the `build-ai-matrx-agents` skill).

## Large or live workspaces, and no export

- Thousands of rows are fine: the script batches and resumes; just rerun it if the connection drops.
- To bring later changes across, export again and rerun — unchanged rows are left alone.
- If they cannot export (no workspace-owner rights), read the databases with the Notion MCP and write
  with the `tables` tool directly: `create_table` (with a unique "Notion ID" text column and a
  "Page content" rich_text column), `add_column` for relations (`"many": true`) once every table
  exists, `upsert_rows` with `key_column: "Notion ID"` in batches of ≤100, links as
  `{"<column>": {"match": "Notion ID", "keys": [<Notion page ids>]}}`, files as
  `{"url": "<Notion file URL>", "name": "<file name>"}` (Notion's URLs expire in an hour — send them
  right after reading), then `create_view`. Finish with `aggregate` `measure: "count"` per table
  against Notion's own counts.
