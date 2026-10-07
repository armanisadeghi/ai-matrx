---
name: build-an-app-on-their-tables
description: "Recipe for an agent building a small custom web app (an Applet) for one person or business on THEIR OWN store tables, live at aimatrx.com/apps/<slug>. Use when asked to build an app, portal, calendar, tracker, dashboard screen or client view on someone's tables/data in AI Matrx. NOT for platform features (use build-sub-feature) or tables the platform keeps for itself (defineAppTable)."
---

# Build an Applet on a person's tables

The person's data already lives in the store (tables they made in /data, imported from Notion, or made
through the Table API). The app is an **Applet**: one `app.definition` row holding its files, pages,
data sources and jobs. **No app code goes in this repo.** `/apps/<slug>` reads the row and renders it
through `@ai-matrx/applets` under the **viewer's own seat** — the store decides who reads and changes
what. Never copy data, never add a table the app needs "for itself" when the person's table can hold
it, never read with a service key.

Proven on Holloway Creative (social-media agency, org `344cfaa8-2b0c-4971-854a-9694614816f2`): Applet
`holloway-content` — posting calendar, approvals, per-client review on their Posts and Clients tables,
plus a "Polish caption" job. Read its row (`select files, pages, sources, mandates from app.definition
where slug = 'holloway-content'`) as the worked example.

Contract: `common-docs/projects/applets/CONTRACTS.md` (§2 hooks, §8 record). Host:
`features/applets-host/FEATURE.md`.

## Steps

1. **Find the tables.** Their ids, organization and columns — Supabase MCP on live (read-only), or the
   person's /data page. Use realistic names from their data in everything you write.
2. **Write the files** (TSX, plain JS types are fine). Imports allowed: `react`,
   `@ai-matrx/applets/react`, `@ai-matrx/design-system/controls`, `lucide-react`, and the Applet's own
   files by relative path (`./shared`). Data and jobs ONLY through the hooks:
   ```tsx
   const posts = useRows("posts", { sort: [{ column: "publish_date", direction: "asc" }], pageSize: 500 });
   const answer = await posts.update(row._id, { status: "Scheduled", approved: true }); // shows at once
   if (!answer.ok) show(answer.error.message);   // refused → rolled back; the store's own sentence
   const job = useJob("polish");
   <Button onClick={() => job.run({ draft: row.caption })}>Polish caption</Button>
   <JobOutput job={job} label="Polishing caption" />   // the run streams here, final kind included
   ```
   **A job's run renders ONLY through `<JobOutput job>`** — never `job.text` in a paragraph, never a
   "Polishing…" label or spinner, never `<Kind>` on `job.result`: the host streams it through the
   platform's one live-run pipeline (text, partial kinds, tool steps, loading, errors). No room inline
   → `<JobOutput job={job} mode="window" />` (floating run window) or `job.open()` on a button.
   Rows are keyed by column key; a link column answers ids or `{ token, id, label }` refs — read both.
   Pages: `<Pages layout="tabs" />` in the entry file, `usePage().params`, `<Link to="/clients/123">`.
3. **Insert the record** in the person's organization (explicit `organization_id`, a slug that is free
   — slugs are unique platform-wide): `files` (name → source), `entry`, `pages`
   (`[{ path, title, file, parent? }]`, `:name` segments capture params), `sources`
   (`[{ alias, table_id, organization_id }]`), `mandates` (`[{ alias, key }]` — an existing mandate;
   check `mandate.definition.output_kind`), `allowed_imports`. Live today `agent_id` and
   `component_code` are still NOT NULL (AP-0 drops them): set `agent_id` to the mandate's
   `default_holder_id` and `component_code` to `''`.
4. **Save its surface** as a member of the organization: `select ui.save_applet_surface('<id>',
   '{"actions":[…]}')` — one mandate Action per job is enough.
5. **Check in a browser:** `/apps/<slug>` signed in as a member (test@test.com is a member of the proof
   organization); switch pages, change one real value and re-read it from a second session, run the
   job. Restore any value you changed.

## Who can open it

Signed-in people only (`app/(link)/apps/[app]/[[...path]]`): a signed-out visitor is sent to sign in
and brought back; a slug they cannot read gets the access gate. Each viewer sees what the store lets
them see. The Applet never decides access.

## Not here

- A table the PLATFORM keeps for one of its own features → `defineAppTable` (records README `/app-table`).
- A brand-new table for the person → make it first (Table API / MCP `tables` / the SQL door), then step 2.
