---
name: build-an-app-on-their-tables
description: "Recipe for an agent building a small custom web app (an Applet) for one person or business on THEIR OWN store tables, live at aimatrx.com/applets/<slug>. Use when asked to build an app, portal, calendar, tracker, dashboard screen or client view on someone's tables/data in AI Matrx. NOT for platform features (use build-sub-feature) or tables the platform keeps for itself (defineAppTable)."
---

# Build an Applet on a person's tables

The person's data already lives in the store (tables they made in /data, imported from Notion, or made
through the Table API). The app is an **Applet**: one `app.definition` row holding its files, pages,
data sources and jobs. **No app code goes in this repo.** `/applets/<slug>` reads the row and renders it
through `@ai-matrx/applets` under the **viewer's own seat** — the store decides who reads and changes
what. Never copy data, never add a table the app needs "for itself" when the person's table can hold
it, never read with a service key.

**The person builds it herself first.** `/applets/build` takes one sentence ("a page where I see my
clients and approve their posts"): it reads the **catalogue** as her, runs the mandate `applets.build`
(the builder; `applets.fix` for "Fix it"), saves the record as a draft, previews it with her real rows
and every write held back, and "Use it" publishes. "Change it" on the same page saves a new version.
Only build by hand when that path cannot (and say why in your report).

Worked examples on Holloway Creative (org `344cfaa8-2b0c-4971-854a-9694614816f2`): `holloway-content`
(hand-built: calendar, approvals, per-client review, a "Polish caption" job) and `post-approvals`
(built by `applets.build` from one sentence, then "add a tab for this week's schedule" as version 2).
Read either: `select files, pages, sources, mandates from app.definition where slug = '<slug>'`.

Contract: `common-docs/projects/applets/CONTRACTS.md` (§2 hooks, §8 record). Host:
`features/applets-host/FEATURE.md`. Catalogue: `@ai-matrx/applets/catalogue`.

## Steps (by hand)

1. **Read the catalogue — never guess an id.** `readAppletCatalogue(client, { organizationId, request })`
   (`@ai-matrx/applets/catalogue`, with the person's own client) answers her tables with `table_id`,
   `organization_id`, field keys, kinds, choices, sample rows and a `suggested_alias`; platform entity
   types; the jobs that fit the request with their input names and output kinds; and the hooks
   reference. From the Supabase MCP the same facts come from `custom.data_home_tables(<org>)` and
   `custom.template_from_tables(<org>, array[<one table id>], true, 3)` run AS her
   (`set_config('request.jwt.claims', …)` + `set local role authenticated`). Draft ONE table per call:
   two tables may share a name ("Clients" twice in Holloway) and the draft names tables, not ids.
2. **Write the files** (plain JSX in `.tsx`). Imports allowed: `react`, `@ai-matrx/applets/react`,
   `@ai-matrx/design-system/controls`, `lucide-react`, and the Applet's own files (`./shared`). Data and
   jobs ONLY through the hooks:
   ```tsx
   const posts = useRows("posts", { sort: [{ column: "publish_date", direction: "asc" }], pageSize: 500 });
   const answer = await posts.update(row._id, { status: "Scheduled", approved: true }); // shows at once
   if (!answer.ok) show(answer.error.message);   // refused → rolled back; the store's own sentence
   // posts.error = the list could not be read (a whole-list state); posts.writeError = the last refused save —
   // show writeError INLINE beside the control that saved, never instead of the list. Only offer a custom-field
   // control on a row whose `_custom` has the key: other organizations' rows cannot hold it.
   const job = useJob("polish");
   <Button onClick={() => job.run({ draft: row.caption })}>Polish caption</Button>
   <JobOutput job={job} label="Polishing caption" />   // the run streams here, final kind included
   ```
   **A job's run renders ONLY through `<JobOutput job>`** — never `job.text`, never a spinner, never
   `<Kind>` on `job.result`. No room inline → `<JobOutput job={job} mode="window" />` or `job.open()`.
   **A box a person writes words in is `<WritingBox value={text} onValueChange={setText} label="Notes" />`**
   (from `@ai-matrx/applets/react`) — never `Textarea`: it carries the platform's microphone and read-aloud.
   A chat with a job is `useConversation` + `<ConversationOutput>` + `<ConversationComposer>` (it writes
   through `<WritingBox>`).
   Rows are keyed by field key; a link field answers ids or `{ id }` refs — read both.
   Pages: `<Pages layout="tabs" />` in the entry file, `usePage().params`, `<Link to="/clients/123">`.
3. **Insert the record** in her organization (explicit `organization_id`; slugs are unique
   platform-wide): `files` (name → source), `entry`, `pages` (`[{ path, title, file, parent? }]`),
   `sources` (`[{ alias, table_id, organization_id }]` copied from the catalogue), `mandates`
   (`[{ alias, key }]`, keys from the catalogue's jobs), `component_code` `''`, `shell_kind`
   `'fully_custom'`, `status` `'draft'` until it works, then `'published'`. Applets name jobs, never
   agents: leave `agent_id` null. Through the MCP, SQL holding JS text can hang — send each file
   base64: `to_jsonb(convert_from(decode('<b64>','base64'),'UTF8'))`, or copy it out of the builder's
   own `chat.message` row; guard updates with `md5(files::text) = '<old>'`.
4. **A change is an UPDATE** of `files` / `pages` / `sources` / `mandates` — the trigger snapshots the
   new version into `app.definition_version`. Never insert a second row for a change.
5. **Save its surface** as a member: `select ui.save_applet_surface('<id>', '{"actions":[…]}')`.
6. **Check in a browser:** `/applets/<slug>` signed in as a member (test@test.com is a member of the
   proof organization); switch pages, change one real value and re-read it from a second session, run
   the job. Restore any value you changed.

## Before writing a row

Run `pnpm -s tsx scripts/applets/applet-render-sweep.ts --against-live [--files <dir>]` before writing or updating any row. A row may use a new `@ai-matrx` export only once the DEPLOYED site has it: the plain sweep compiles against the local install and says ok while https://www.aimatrx.com (`/api/version` commit, its lockfile) may still serve an older package. Any `breaks_on_live` row means wait for the deploy.

## Who can open it

Signed-in people only (`app/(link)/applets/[slug]/[[...path]]`): a signed-out visitor is sent to sign in
and brought back; a slug they cannot read gets the access gate. Each viewer sees what the store lets
them see. The Applet never decides access.

## Not here

- A table the PLATFORM keeps for one of its own features → `defineAppTable` (records README `/app-table`).
- A brand-new table for the person → make it first (Table API / MCP `tables` / the SQL door), then step 2.
