---
name: build-an-app-on-their-tables
description: "Recipe for an agent building a small custom web app for one person or business on THEIR OWN store tables, live at aimatrx.com/apps/<slug>. Use when asked to build an app, portal, calendar, tracker, dashboard screen or client view on someone's tables/data in AI Matrx. NOT for platform features (use build-sub-feature) or tables the platform keeps for itself (defineAppTable)."
---

# Build an app on a person's tables

The person's data already lives in the store (tables they made in /data, imported from Notion, or made
through the Table API). The app is code in this repo, typed off those tables, running under the
**viewer's own seat** — the store decides who reads and changes what. Never copy data, never add a
table the app needs "for itself" when the person's table can hold it, never read with a service key.

Proven on Holloway Creative (social-media agency): `features/person-apps/holloway-content/` —
posting calendar, approvals, per-client review, on their Posts and Clients tables.

## Steps

1. **Find the tables.** Their ids and columns — Supabase MCP on live (read-only), or the person's
   /data page. Use realistic names from their data in everything you write.
2. **Type them.** In `aidream/apps/shared/records`:
   `pnpm tables:types <table id> --out ../../../../matrx-frontend/features/person-apps/<slug>/tables/<name>.ts`
   One file per table. It emits `export const posts = storeTable<PostsRow, PostsInsert>({…})`: column
   names are the snake_case of each label, a choice column is the union of its words, a link column
   is `Uuid[]`. Re-run when their columns change; never hand-edit.
3. **Register the app** in `features/person-apps/registry.ts`: slug (the URL), name, who it is for,
   the organization the tables live in (where writes go), `load: () => import("./<slug>/App")`.
4. **Write the screen** (`"use client"`, default export taking `{ path }` — the URL below
   `/apps/<slug>`). Read and write with `useStoreTable(table, { where, sort, search })` from
   `@ai-matrx/records/react`:
   ```ts
   const { rows, update, write, archive, error, loading, truncated } = useStoreTable(posts, { sort: [{ column: "publish_date", as: "date" }] });
   await update(row._id, { status: "Scheduled", approved: true });   // a misspelled column or choice fails tsc
   ```
   Headless (no React): `listTableRows / writeTableRow / updateTableRow / archiveTableRow` from
   `@ai-matrx/records/app-table`. Show `error.message` as given (the store's own sentence) and say
   when `truncated`. A link column holds ids: read the linked table and map ids to names.
5. **Controls:** `@ai-matrx/design-system/controls` only (Button, Select, Tabs, Badge, Field…), semantic
   color tokens, short in-app text (`interface-text` skill). Phone width works.
6. **Check:** `pnpm type-check`; open `http://<your-host>:3001/apps/<slug>` after `pnpm dev-login
   /apps/<slug>`; change one real value through the app and see it in the table at /data. Commit by
   pathspec; the release train puts it live at `https://aimatrx.com/apps/<slug>`.

## Who can open it

Signed-in people only (`app/(link)/apps/[app]/[[...path]]`): a signed-out visitor is sent to sign in
and brought back. Each viewer sees what the store lets them see: members of the business see their
tables; an outside client sees the rows shared with them (share the client's records, or their
table, to that person). The app never decides access.

## Not here

- A table the PLATFORM keeps for one of its own features → `defineAppTable` (records README `/app-table`).
- A brand-new table for the person → make it first (Table API / MCP `tables` / the SQL door), then step 2.
- Running AI inside the app → call their agents through the platform's agent surfaces, not from here.
