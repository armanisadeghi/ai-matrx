---
status: active
updated: 2026-08-08
repos: [matrx-frontend, aidream, matrx-local]
---

# Office documents (docx / pptx / xlsx) — surface the capability

Backend capability (codec, tool, generation, ingest) is built and live. As of 2026-08-08 the
first real user surfaces shipped: **Word/PowerPoint preview in Files, Convert-to-PDF, and a
"New → AI document" entry** (see Done). Remaining work is fidelity, thumbnails, and satellites.

## Vision — Arman's words

> "our system is entirely built for AI … quickly and easily take things like this and convert
> them to markdown to be fed to an AI model and then do the same kinds of things we're doing for
> PDFs where we **retain the connection between the extracted contents and the source**."

> "because we have AI available, remember that generating things is very easy as long as we give
> them structure … all we have to do is come up with the exact kind from the content IR system
> and define what we want a PowerPoint to be like, and we can have simple conversions."

> "things like this all need to stay in one place. And the files repository is designed to do
> exactly that." (files.matrxserver.com owns file ops; aidream only hosts what it already had)

## Resources

- **Codec (the one home):** `aidream/packages/matrx-files/matrx_files/specific_handlers/office/`
  — `extract_office` → markdown+portions; `generate_office(spec)` → bytes; LibreOffice lane
  (`convert_to_pdf`, `convert_legacy_to_openxml`). Contract: its `FEATURE.md`.
- **Service (shared by tool + HTTP):** `aidream/services/office_generation/service.py` —
  `generate_office_asset`, `extract_office_asset_for_user`, `convert_office_asset_for_user`
  (as-user reads; legacy bridge; `asyncio.to_thread` for CPU/subprocess work).
- **HTTP:** `POST /office/generate`, `GET /office/{file_id}/markdown`,
  `POST /office/{file_id}/convert` → `aidream/api/routers/office_generation.py`.
- **Agent tool:** `office` — `action: generate | extract` (extract now reuses the service).
- **Ingest:** `OfficeSourceAdapter` → unified `processed_documents` pipeline like PDFs.
- **Kinds:** `office_document` / `office_presentation` / `office_spreadsheet` — registered,
  deliberately `is_active=false` (canonical consumption is the tool → FileRef; see Decisions).
- **FE:** `previewKind: "office"` → `OfficePreview` (`features/files/components/core/FilePreview/
  previewers/OfficePreview.tsx`); API `features/files/api/office.ts`; actions in
  `preview-actions.ts`; "AI document" in `features/files/components/surfaces/desktop/NewMenu.tsx`.
  Inventory: `features/files/components/surfaces/FILE_TYPE_INVENTORY.md` § OFFICE.
- **Desktop:** `matrx-local/app/tools/tools/file_ops.py` (`tool_read`) + `media.py`
  (`tool_office_generate`).

## Remaining work

1. **Office thumbnails backfill** (aidream — chip spawned 2026-08-08). New-upload page-1 thumbs
   need verification; pre-existing files need a re-render backfill (mirror
   `aidream/cli/scan_thumbnail_backfill.py`; note the variant-key dedup trap in FOUND_DEFECTS.md).
2. **Desktop bundle verification** (matrx-local — chip spawned). PyInstaller sidecar never
   exercised for docx/pptx/openpyxl + templates.
3. **Workflow nodes** (aidream/matrx-graph — chip spawned). Deterministic `generate` + `extract`
   nodes with input_kind/output_kind.
4. **Files-service catch-up** (ops). `packages/matrx-files/Dockerfile` carries LibreOffice but
   that image deploys manually and is not the traffic path yet. Nothing breaks meanwhile.
5. **Visual-fidelity preview (optional next rung).** Today's preview is extracted text. A
   LibreOffice→PDF render lane (reusing the convert endpoint) could show true layout — decide if
   fidelity matters before building.
6. **xlsx "extract" parity note:** xlsx previews client-side via SheetJS (good); the office
   markdown endpoint also handles xlsx if a text view is ever wanted.

## Done

- Office codec (extract ↔ generate ↔ LibreOffice convert) + ingest + chat-attachment reads +
  `office` agent tool + generation service + `POST /office/generate` + MIME routing guard.
- **2026-08-08:** read-side endpoints (`GET /office/{file_id}/markdown`,
  `POST /office/{file_id}/convert`), shared service (tool reuses it; legacy .doc/.ppt gain the
  LibreOffice bridge), and the FE surfaces: `OfficePreview` (Files side panel + `/files/f/{id}` +
  chat inline via `UniversalInlineFile`), Convert-to-PDF action, "New → AI document" prompt
  prefill into `/chat/new`.
- Local desktop read + generate — matrx-local, catalog synced (bundle verification pending).

## Decisions needed

**Should the three `office_*` content-IR kinds be activated?**
They're registered with valid schemas, skills, content blocks, and a `generic_structured`
component, but sit `is_active=false`. The canonical consumption path is the `office` tool
returning a downloadable FileRef; activation only changes what happens if a model emits a
standalone `__kind` payload instead of calling the tool. Decide: leave inactive (tool is the
only path) or activate and accept the generic structured viewer for standalone emissions.
