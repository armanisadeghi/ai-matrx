# FEATURE.md — `trash`

**Status:** `active`
**Tier:** `2`
**Last updated:** `2026-09-28`

---

## Purpose

Trash is the one place a person sees and restores everything they archived, anywhere on the platform. There is no per-feature trash and no purge button: permanent destruction belongs to the retention engine (`common-docs/projects/data-lifecycle-platform`).

---

## Entry points

**Routes**
- `app/(core)/trash/page.tsx` — personal Trash (`/trash`): the list, plus the lifecycle notice ("scheduled to be deleted for good", "moved to long-term storage") and the Vault credential recovery dialog.
- Organization settings → Trash (`components/OrgTrashSection.tsx`) — owners and admins restore what members archived in that organization.

**Components**
- `components/TrashList.tsx` — THE list, one component for both scopes (`personal` / `organization`).
- `components/ArchiveRecordButton.tsx` — the one archive control for any registered record.

**Services**
- `service.ts` — main-DB doors: `trash_list`, `trash_counts`, `entity_undelete`, the `org_trash_*` family, `archiveRecord`, Vault recovery preview.
- `sources.ts` — **Trash sources.** Personal Trash is the merge of every database that holds archived user content. Source #1 `main` (the `platform.entity_types` registry); source #2 `cms` (the CMS database, a separate Postgres).
- `cmsKinds.ts` — the CMS kinds (`cms_site`, `cms_page`, `cms_component`) and the `/api/cms/trash` wire contract, shared by server and client.
- `lifecycleService.ts`, `labels.ts` — the retention notice and its sentences.

**API endpoints**
- `GET /api/cms/trash` — archived CMS sites, pages and components the caller may restore, in the Trash row shape, plus per-kind counts. `{ live: false }` until CMS migration 0041 (`aidream/db/migrations/cms/0041_cms_content_archive_not_delete.sql`) gives the tables `deleted_at`.
- `POST /api/cms/trash` `{ token, id }` — calls the migration's restore door (`cms_restore_site` / `cms_restore_page` / `cms_restore_component`) and returns its `notices` verbatim.

---

## How the sources merge

- **Counts:** every source's counts are concatenated into one kind picker. A source that is not live contributes nothing — no kind, no row, no error. A non-main source that fails is toasted once and the rest of Trash still loads; the main source failing is the page's own error.
- **Rows:** a picked kind asks only the source that listed it; the "Recent" overview asks every source that has anything and merges newest first.
- **Restore:** routed by `entity_token` to the owning source. A CMS restore's `notices` (e.g. a page that came back at `/services-restored` because a live page took `/services`) are each shown in the restore toast, as written.
- **Adding a source:** implement `TrashSource` in `sources.ts` and add it to `PERSONAL_TRASH_SOURCES`. `TrashList` never names a source.

## CMS access (never a new rule)

A CMS row is listed exactly when the caller holds the level the existing CMS routes demand to archive it — so every Restore shown is one the door accepts (`app/api/cms/_lib/cmsTrash.ts`):
- site → `canAccessCmsSite(caller, site, "admin")`
- page / component → the site at `"editor"`, and the site must be live
- left out on purpose: children of an archived site (restoring the site brings them back) and pages under an archived parent page (the door refuses until the parent is back).

## Organization scope

Organization Trash reads only the main-DB `org_trash_*` doors. CMS kinds are **not** there: an org restore is audited in the organization's log and tells the item's owner, and the CMS door does neither. Nothing is unreachable — the CMS access rule gives an org admin the site's admin level, so every org site they may restore is already in their personal `/trash`.

---

## Tests

- `__tests__/cms-is-a-trash-source.test.tsx` — merge into one list and picker, pre-0041 silence, restore toast carries the door's notice.
- `app/api/cms/trash/cmsTrash.test.ts` — route: not live before the column, access per level, door notices verbatim, refusal sentence.
- Red against old code: copy `git archive HEAD features/trash app/api/cms` into the git-ignored `tmp/<name>/`, drop the new test files in, run `pnpm jest --roots "$PWD/tmp/<name>" --testPathPatterns <names>`, then delete the scratch directory (jest does not ignore `tmp/`).

---

## Change Log

- **2026-09-27** — CMS becomes Trash source #2 (lane CMS-TRASH). `sources.ts` + `cmsKinds.ts` + `GET/POST /api/cms/trash`; `TrashList` personal mode merges sources and shows restore notices. Pre-0041 the CMS source is silent (`archiveLive` probe). Organization scope stays main-DB only (reason above). This file created.
- **2026-09-28** — CMS migration 0041 is live; `/api/cms/trash` answers `live: true`. Localhost proof as admin@admin.com on the Factory Playground test site: an archived page was listed as "CMS page", and Restore — with a newer live page at its address — brought it back at `…-restored` and the toast showed the door's sentence verbatim. Kind labels are "CMS site / page / component" because the main registry already has a "Site" kind.
