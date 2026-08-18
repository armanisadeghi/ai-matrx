# Google Workspace — the deeper integrations still to build

**Owner:** unassigned
**Created:** 2026-08-18

Google Workspace is connected, canonical, and reachable from chat, every content
surface, and every list page. What remains is not plumbing — it is four
capabilities that were deliberately scoped out, each with a real design question.

Read first: `features/google-workspace/FEATURE.md` (client) and
`aidream/aidream/services/google_workspace/FEATURE.md` (server). The attach path
(`__google_files`) and the send boundary are already built and documented there;
none of the work below may re-implement either.

---

## 1. Notes ↔ Google Docs, both directions

**What Arman asked for:** "notes that should be able to sync with Google Docs
with a markdown conversion possibly in both directions."

One-way already works: any note can be sent to a new Google Doc through
`components/content-actions/contentActionRegistry.ts`. What does not exist:

- **Docs → note.** Google Docs are not markdown. Pulling one back means
  converting Docs' structural JSON (headings, lists, tables, links, bold) into
  markdown. Our reader currently flattens everything to plain text
  (`_document_text` in the server service) — good enough for an agent to read,
  lossy for a round trip.
- **Two-way sync.** The moment a note and a Doc are both editable, this is a
  conflict problem, not a conversion problem. Decide explicitly: is the Doc a
  publish target (one-way, re-publish overwrites), or a genuine mirror (needs a
  last-synced snapshot, change detection on both sides, and a conflict UI)?

**Recommendation:** ship "publish to Doc" and "pull latest from Doc, replacing
the note body" as two explicit user actions before attempting continuous sync.
Two buttons a user understands beat a sync they cannot predict.

**Prerequisite:** a real Docs-structure → markdown converter on the server, and
markdown → Docs requests for the reverse. Neither exists.

## 2. Workbooks and Worksheets ↔ Google Sheets

`features/data-tables/export-targets.ts` already pushes content into OUR
Documents and Workbooks (`pushMarkdownToDocument` / `pushTableToWorkbook`,
Univer-backed). The Google counterpart belongs directly beside those two, using
`features/google-workspace/export/sendToGoogle.ts` — not a new Google client.

Open question, same shape as notes: is a Google Sheet an export target, or a
live mirror of a Workbook? A Workbook has formulas and formatting Univer owns;
a naive cell-value round trip loses them.

**Recommendation:** export first (Workbook → new Sheet), plus "import this Sheet
as a new Workbook". Defer mirroring.

## 3. `drive.file` is broader than Docs and Sheets

Arman, 2026-08-18: "remember that we have auth/drive.file which is more than
just docs and sheets."

Correct, and today we narrow it ourselves: `_resource_type_for_mime` accepts
only `google-apps.document` and `google-apps.spreadsheet`, and Picker is
restricted to those two mime types. The approved scope already covers ANY file
the user picks or that we create — a PDF, an image, a CSV, a Slides file.

Widening means the picked file has to enter the canonical file pipeline
(`features/files/**`, `MediaRef`, the aidream `/assets` path) rather than the
Workspace service, because the value of a PDF is its bytes. That is the correct
home for it and it is a real piece of work.

**Do not** widen the mime filter without routing bytes through the file handler
— a half-registered PDF that nothing can read is worse than not offering it.

## 4. A connections directory page

`features/connectors/` holds the config-driven strip that sits under the agent
input. Its config already distinguishes providers that belong in the strip from
providers that are too niche for it (Search Console is the worked example of the
latter). The directory surface that renders EVERYTHING — connected or not, with
its connect action and its disconnect door — does not exist yet.

`features/settings/pages/IntegrationsSettingsPage.tsx` is the closest existing
surface. Decide whether the directory replaces it or feeds it.

---

## Not in scope here

- **Google Slides.** Blocked on Google, not on us: the scope is unapproved and
  needs its own campaign. Tracked as D214 in `FOUND_DEFECTS.md`.
- **Gmail reading.** A separate, restricted-scope campaign
  (`common-docs/projects/google-oauth-verification/PLAN.md`).
- **Anything that weakens the reviewed-send boundary.** The send tool has no
  server executor on purpose. Bulk, scheduled, or background sending is outside
  the approval and outside this handoff.
