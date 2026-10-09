# Employee Performance Reviews

Cross-repo system-of-record: /Users/armanisadeghi/code/common-docs/systems/human-resources/employee-performance-reviews/STATE.md — read it before touching this feature in ANY repo.

## Current frontend mechanics

One shared editor under `features/employee-performance-reviews/` serves both:

- the retained `/demos/performance-review` flow-validation route; and
- the authenticated interim organization route
  `/organizations/[orgId]/performance-reviews`.

Both remain browser-local until the dedicated HR workflow and role-aware
persistence contracts are built. The production page is a normal core route,
resolves the real organization UUID, and is linked from that organization's
workspace. Its localStorage key is merely partitioned by that UUID; this is not
organization-scoped data, durable tenancy, or an HR security boundary. The
resolved UUID is the explicit `organization_id` input for the next persistent
writer.

- `schema.ts` owns the review draft and rating inventory.
- `use-reviews.ts` owns localStorage hydration, migration, autosave, and JSON
  backup/restore.
- `review-report.ts` is the single finished-report renderer used by on-screen
  preview and the print document.
- `captureElementsToPDF` preserves the report's explicit page boundaries for a
  direct two-page Letter PDF download.
- `copy.ts` owns canonical Questions only and Current values copy contracts.
  The first is an XML-ish question inventory with no answers; every quantified
  narrative section says, "The ideal number is three." The second carries every
  live active-review value.
- `organization-performance-reviews.manifest.ts` declares the official
  `matrx-user/organization-performance-reviews` surface: 68 readable values and
  36 guarded write targets mirrored in the live `ui` registry.
- Every review textarea uses `ProTextarea` with transcript cleanup, surface-bound
  agent actions, full live surface scope, and manual vertical resizing.

## Doctrine compliance

- Reused the Block Print System, DOM-capture PDF utilities, official form
  controls, semantic theme tokens, and the existing responsive shell.
- Extended the canonical DOM-capture utility with explicit-page PDF output
  instead of creating a second PDF stack.
- The screen preview, print view, and PDF are generated from the same escaped
  report HTML and stylesheet.
- The authenticated organization route reuses the canonical organization access
  gate and route header and has a first-class door from the organization
  workspace. It introduces no review table, Mandate, fixed Agent, or claim of
  blind employee/manager confidentiality.
- All surface writes use the same browser autosave handlers as human edits and
  require confirmation. The future HR build will replace this interim storage
  contract rather than treating localStorage as persistent review data.

## Change log

- 2026-08-26 - Added the first-class organization-workspace door, canonicalized
  navigation through the resolved organization slug, and clarified that the
  route provides a real organization UUID while localStorage remains only a
  browser-draft partition rather than organization-scoped persistence.
- 2026-08-26 - Promoted the shared editor to the interim authenticated
  organization route while retaining the demo; added canonical AI copy formats,
  exhaustive surface values/write targets, transcript-cleanup and bound-agent
  textarea actions, and manual textarea resizing.
- 2026-08-26 - Added Job Responsibilities, 2-5 item limits, responsive report
  preview, dedicated print output, and verified two-page Letter PDF export.


## 360 review, wave 1 (lane HR-360, 2026-10-08)

- Tables: `review-360.typed-table.ts` — two Confidential typed tables per organization (Review: status + timestamps, `employee` entity reference to `hr_employee`; Track: one per respondent, readers respondent/editor, hr_manager/viewer, counterpart/viewer `when shared=true`, maker only a reader). The aidream registry (`aidream/services/typed_tables/confidential.py`) must equal these declarations or the server step refuses.
- Flow (`review-360/service.ts`): Start on the HR profile → manager from `header.manager_employee_id` → provision (tables, store assignment columns, gather automations, Confidential via `POST /typed-tables/confidential`) → Review row + two Track rows → `custom.work_assign` (inbox + due + reminders) → link set → notice "Complete your review: <link>" → respondent edits in the existing editor (`PerformanceReviewApp single`, `useReviews(…, persistence)`) → submit stamps `submitted_at` → automation stamps the Review → both in → status ready + HR notified → HR shares both.
- Routes: `/hr/performance` (list), `/hr/performance/[reviewId]?org=` (both halves), `/hr/performance/respond/[trackId]?org=` (respondent).
- Knobs: `hr.performance/review_360_days_to_complete` (14), `review_360_reminder_lead_days` (3).
- Chose store assignments + automations over the HR workflow engine: an `hr.workflow_step` deep-links only to its own `/hr/tasks/{instance}` decision panel and its titles come from `hr._wf_display`, so a step cannot point at a store row.

## 360 review, hardening (lane HR-360, 2026-10-08)

- A respondent edits her half only until she submits it: the Track reader `respondent` is editor `when` `submitted_at` is empty and viewer always; the respond page turns read-only and `saveTrack` refuses (`SUBMITTED_REFUSAL`).
- Respondents READ the review row (viewer); only HR writes it. "Both in" is worked out from the tracks (list + review page); the HR notice is sent per half from the track ("A 360 review response is in: <review link>"). The notify action sets the text only — the in-app subject ("A table you follow changed") and email subject come from the store's notify spine, not this feature.
- Meeting defaults, the due hour and reminder lead are knobs (`hr.performance/review_360_*`); the lead becomes the .ics reminder (VALARM) on the respond page. In-app reminders before a due date have no mechanism yet (the store reminds after N untouched days; tasks remind the day before).
- The 360 meeting sets `meet.observers_visible_to = hosts` for that meeting; the observer's token publishes no data and is hidden from other participants.
- Notes audit: opening notes through this feature goes through `iam.open_confidential_audited` and is logged. A direct read of the notes row through the records store (data pages, API) is NOT logged — only the feature's own door is.

## 360 review, meeting recording and transcript (lane HR-360-REC, 2026-10-09)

- Scheduling the review meeting makes the Confidential notes row first (`ensureMeetingNotes`), then ties the meeting to it (`meet_link_capture_to_notes` -> `metadata.app_panel.artifacts_record_id`). Capture itself stays off unless the organization's knob `meet.confidential_capture` allows it (unchanged trigger).
- When capture runs, aidream (`services/meet/confidential_artifacts.py`) puts the recording (before the recording row says `available`) and the transcript (one text file) under that row through `communication.meet_attach_capture_file`. A meeting with an artifacts row never lands its transcript as a content Source (organization-level, read by AI).
- A file under the row is read by exactly the row's readers: HR always, the manager and the employee once HR shares the notes; never published, never Anyone-linked (ENTITY-IDS). `Review360MeetingFiles` lists them on the meeting page and opens each through `iam.open_confidential_audited` first.
- Proof (rolled back, RED then GREEN): `scripts/campaign-tests/hr360rec_capture_files_follow_the_notes_row_proof.sql`. Inverse: `migrations/inverse/hr360rec_a_a_confidential_meetings_files_live_under_the_notes_row_down.sql`.
