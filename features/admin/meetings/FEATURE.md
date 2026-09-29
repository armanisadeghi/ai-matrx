# Meetings admin (platform)

**Route:** `/administration/users/meetings` (Users & Access › Communications › Meetings), one meeting at `/administration/users/meetings/<id>`.
**Status:** built 2026-09-29 (Meet wave 5, admin lane). Meet's own mechanics: [`features/meet/FEATURE.md`](../../meet/FEATURE.md); parity board: `../common-docs/systems/communications/meet/PARITY.md` §1.6.

## What it is

The platform admin's view of every meeting in every organization. Four tabs (`?tab=usage|history|settings|retention`, `?org=<id>` carries an organization into History):

| Tab | Source | Notes |
|---|---|---|
| Usage | `communication.meet_admin_usage(p_from, p_to)` → jsonb `{totals, by_org[]}` | 7/30/90 days. Meetings held = `started_at` in period; minutes = started → ended (or now); people = distinct joined `participant_user_id`, guests = distinct joined identities with no user, both excluding `is_agent`; recordings + bytes (`files.files.size_bytes` via `meet_recordings.file_id`) and transcript segments by `created_at` in period; live now = started, not ended/cancelled/archived, regardless of period. A row opens History for that org. |
| History | `communication.meet_admin_meetings(p_query, p_org, p_state, p_from, p_to, p_limit ≤200, p_offset)` | State is derived: archived (`deleted_at`) › cancelled › ended › live › scheduled. Date range is on `coalesce(started_at, scheduled_for, created_at)`. Rows carry `total_count`; "Load more" pages. A row opens `/administration/users/meetings/<id>`. |
| Settings | `FeatureKnobsPanel feature="meet"` | The ONE knob register narrowed to `meet.*`; "All levels" on a row = per-organization overrides (`KnobOverridesAdmin`). No parallel settings store. |
| Retention | `platform.retention_policy` (platform_admin_read) + `scheduler.sch_task` `a7c1…0431` | Shows the entity rows for `meet_*` tokens, the file-custody row for recording bytes (`custody_selector.source_kind = meet_room_recording`), and the global floor; plus whether the one retention sweep is on. **Read-only**: clients are refused every write to `retention_policy` and the lifecycle system has no admin write door yet. |

## Invariants

- 🚨 **Everything here needs the admin lane.** Both RPCs refuse unless `public.is_platform_admin()`, which is true only with `x-matrx-admin-lane: 1` (sent automatically from `/administration/**`). That is why a meeting opens at `/administration/users/meetings/<id>` — the SAME `MeetingDetail` component (`chrome="embedded"`) the user route renders, never a copy — and not at `/meetings/<id>`, which is lane-less and refuses a meeting the admin was not invited to.
- No Mine / My org filters (admin seat law); the organization filter is a platform scope.
- Both doors are declared in `platform.client_callable_door` (gate `public.is_platform_admin()`), EXECUTE to `authenticated` only.
- Usage returns jsonb → validated in `service.ts#parseMeetUsage`, never asserted. History rows are widened to nullable at ingress (`toAdminMeetingRow`) because the generator marks RETURNS TABLE columns non-null.

## Retention rows (live 2026-09-29)

- `d7e1cedf…` entity `file`, custody `meet_room_recording/meet_recordings_30d`: purge 30 days untouched, warn 7 (recording bytes).
- `169a7b2c…` entity `meet_transcript_segment`: mode `never` (added this wave so the rule is explicit).
- Global floor: `never`. The retention sweep task is disabled (Arman's call to enable).

## Change log

- 2026-09-29 — Built: route, four tabs, two admin read doors, transcript policy row, `FeatureKnobsPanel` gained a `feature` prop.
