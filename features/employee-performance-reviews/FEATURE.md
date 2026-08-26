# Employee Performance Reviews

Cross-repo system-of-record: /Users/armanisadeghi/code/common-docs/systems/human-resources/performance-reviews/STATE.md — read it before touching this feature in ANY repo.

## Current frontend mechanics

The current flow-validation surface is the custom dev route
`/demos/performance-review`, implemented under
`app/(dev)/demos/performance-review/`. It deliberately remains browser-local
until the dedicated HR workflow and role-aware persistence contracts are built.

- `schema.ts` owns the review draft and rating inventory.
- `use-reviews.ts` owns localStorage hydration, migration, autosave, and JSON
  backup/restore.
- `review-report.ts` is the single finished-report renderer used by on-screen
  preview and the print document.
- `captureElementsToPDF` preserves the report's explicit page boundaries for a
  direct two-page Letter PDF download.

## Doctrine compliance

- Reused the Block Print System, DOM-capture PDF utilities, official form
  controls, semantic theme tokens, and the existing responsive shell.
- Extended the canonical DOM-capture utility with explicit-page PDF output
  instead of creating a second PDF stack.
- The screen preview, print view, and PDF are generated from the same escaped
  report HTML and stylesheet.
- No HR database, access rule, Mandate, Agent, or production route is implied by
  this demo slice.

## Change log

- 2026-08-26 - Added Job Responsibilities, 2-5 item limits, responsive report
  preview, dedicated print output, and verified two-page Letter PDF export.
