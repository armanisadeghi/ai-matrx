---
status: active
updated: 2026-07-15
repos: [matrx-frontend, aidream, matrx-local]
---

# Office documents (docx / pptx / xlsx) — surface the capability

The backend capability is **built, live, and verified**. It has been used **zero times** —
`chat.tool_call WHERE tool_name='office'` = 0. Every remaining task exists to put this in
front of a human. If nothing below ships, the whole thing is dead code.

## Vision — Arman's words

> "We need to identify a solid solution for processing incoming and outbound Microsoft
> documents such as DOCX / PowerPoint, etc."

> "things like this all need to stay in one place. And the files repository is designed to do
> exactly that." … "the files.matrxserver.com image handles 99% of our file operations.
> Nothing should be handled in aidream unless it's already there for something else."

> "our system is entirely built for AI. So we want to be able to have things in place that can
> quickly and easily take things like this and convert them to markdown to be fed to an AI
> model and then do the same kinds of things we're doing for PDFs where we **retain the
> connection between the extracted contents the source**."

> "because we have AI available, remember that generating things is very easy as long as we
> give them structure. So for something like PowerPoint presentations or docs or spreadsheets,
> all we have to do is come up with the exact kind from the content IR system and define what
> we want a PowerPoint to be like, and we can have simple conversions."

> "follow our standard tool pattern for trying to keep the count of our tools small by putting
> them together with actions. We need both the code and it needs to be in the db."

> "When an agent is working on a local machine file handling is a big part of it so we need to
> do it right."

**The reason this handoff exists:**
> "while we've got this capability right now, there is really not a lot of ui or features that
> tie into it and if we don't get those set up immediately, we run the risk of the entire
> feature getting lost and forgotten."

## Resources

- **Codec (the one home):** `/Users/armanisadeghi/code/aidream/packages/matrx-files/matrx_files/specific_handlers/office/`
  — `extract_office(bytes)` → markdown + portions; `generate_office(spec)` → bytes;
  `convert_to_pdf()` / `convert_legacy_to_openxml()` (LibreOffice lane). Contract: its `FEATURE.md`.
- **Agent tool:** `office` — `action: generate | extract`. Code
  `/Users/armanisadeghi/code/aidream/aidream/services/office_generation/tools.py`; live `tool.definition` row;
  default-injected for every authenticated user.
- **HTTP:** `POST /office/generate` → `/Users/armanisadeghi/code/aidream/aidream/api/routers/office_generation.py`.
- **Ingest:** `OfficeSourceAdapter` → `/Users/armanisadeghi/code/aidream/aidream/services/content_processing/sources/office.py`;
  routing in `upload_hook.py`. Uploads converge to `processed_documents` + pages exactly like PDFs.
- **Kinds:** `content_ir.kind_definition` → `office_document` / `office_presentation` / `office_spreadsheet`
  (schemas from the Pydantic specs). Deliberately `is_active=false`; each row's
  `metadata.activation_gate` explains why (canonical consumption is the tool → FileRef, not inline render).
  Skills `office-*-kind` + matching `content_blocks` are live and teach the shapes.
- **FE rendering today:** a tool result carrying `file_id` + a non-media mime renders as a download card —
  `features/tool-call-visualization/result-fields/{shape.ts,ResultFile.tsx}`. That is the *only* office UI.
- **FE gap register (read this first):** `features/files/components/surfaces/FILE_TYPE_INVENTORY.md`
  § "OFFICE — NOT PREVIEWABLE" + the priority list. **Skill: `enhance-file-type`** is the vehicle for
  most of the work below.
- **Desktop:** `/Users/armanisadeghi/code/matrx-local/app/tools/tools/file_ops.py` (`tool_read` → markdown)
  and `media.py` (`tool_office_generate`).

## Remaining work

1. **docx / pptx preview** (matrx-frontend). `FILE_TYPE_INVENTORY.md` marks both 🔴 and asks for
   "mammoth.js or **server-side render**" — the server-side render now exists. Add a `PreviewKind` and
   previewer that shows extracted markdown (call the `office` tool's `extract`, or add a thin
   `GET /office/{file_id}/markdown` in aidream if a non-tool path is cleaner). xlsx already previews via
   SheetJS. Use the `enhance-file-type` skill. **This is the highest-value item** — it makes every Office
   file in the Files area useful instead of a download stub.
2. **Office thumbnails are built but not visible.** `thumbnail_source.py` renders Office → PDF → page-1 via
   LibreOffice (live on the server image). Existing Office files still carry mime-icon thumbnails —
   they need a re-render backfill (aidream; mirror `aidream/cli/scan_thumbnail_backfill.py`, and note the
   variant-key dedup trap recorded in `FOUND_DEFECTS.md` for the PDF backfill). Confirm new uploads do
   produce a page-1 thumb before backfilling old ones.
3. **A way to ASK for a document** (matrx-frontend). Nothing in the product invites "make me a deck /
   report / spreadsheet". Options: an agent shortcut, a Files-area "New from AI" action, or a prompt
   template. Without one, the `office` tool stays at zero calls. Pick the cheapest surface that a user
   actually walks past.
4. **Per-type actions** (matrx-frontend, slot #41/#42 in the inventory). `.docx → Convert to PDF` is now a
   one-liner against `convert_to_pdf`; also `→ Markdown`. Needs a small aidream endpoint + the action-bar wiring.
5. **Verify the desktop path end-to-end in the built app** (matrx-local). Round-trips pass in the venv, but
   the PyInstaller bundle has never been exercised — build the sidecar and confirm `docx`/`pptx`/`openpyxl`
   + their bundled templates actually load (hidden-imports + `collect_data_files` are declared in
   `specs/*.spec` and `scripts/build-sidecar.sh`).
6. **Workflow nodes** (aidream/matrx-graph). No office node exists. `generate` + `extract` are natural
   deterministic nodes; needs `output_kind` per the node-authoring kinds rules.
7. **Files-service catch-up** (ops). `packages/matrx-files/Dockerfile` carries LibreOffice but that image
   deploys manually (`deploy.sh <version>`, PyPI-based) and is not yet the traffic path. Nothing breaks
   meanwhile — aidream's own image has LibreOffice.

## Done

- Office codec (extract ↔ generate ↔ LibreOffice convert) — `packages/matrx-files/.../specific_handlers/office/`.
- Ingest through the unified pipeline (clean→chunk→embed→NER), source lineage preserved — `sources/office.py`.
- Chat attachments read via the codec, incl. Excel — `matrx_ai/processing/media_fallback/resolvers.py`.
- `office` agent tool (generate/extract) + live `tool.definition` row + 3 content-IR kinds + 3 skills + 3 content blocks.
- Generation service + `POST /office/generate` returning a FileRef — `aidream/services/office_generation/`.
- FE download card for non-media tool-result files — `features/tool-call-visualization/result-fields/ResultFile.tsx`.
- Local desktop read (was returning zip garbage) + generate — matrx-local `file_ops.py` / `media.py`, catalog synced.
- MIME routing-drift guard — `aidream/scripts/check_mime_pipeline_coverage.py`.

## Decisions needed

**Should the three `office_*` content-IR kinds be activated?**
Situation: the kinds are registered with valid schemas, skills, content blocks, and a `generic_structured`
component, but sit `is_active=false`. The frontend's recorded reason is that the real consumption path is
the `office` tool returning a downloadable file, so no inline renderer was built; activation would only
change what happens if a model emits a standalone `__kind` payload for a document instead of calling the tool.
Decide: leave them inactive (tool is the only path), or activate and accept the generic structured viewer
for standalone emissions.
