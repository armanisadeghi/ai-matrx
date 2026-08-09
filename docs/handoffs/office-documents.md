---
status: active
updated: 2026-08-09
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

1. **Desktop bundle verification on macOS/Windows** (matrx-local). Done and fixed on Linux
   (see Done, 2026-08-09) — the bug and the fix are platform-independent (all four specs are
   one-file), and the new gate runs on every target inside `build-sidecar.sh` + the release
   workflow. It just has not executed on a mac/Windows runner yet: **the next release build is
   the verification**. If it goes red there, read `matrx-local/specs/_office_bundle.py` first.
2. **Files-service catch-up** (ops). `packages/matrx-files/Dockerfile` carries LibreOffice but
   that image deploys manually and is not the traffic path yet. Nothing breaks meanwhile.
3. **AI-generated Office files are born with an icon thumbnail** (aidream — filed in
   `aidream/FOUND_DEFECTS.md`, 2026-08-09). Files created via `generate_office_asset` →
   `save_media_envelope_async` get a mime icon at creation even on a LibreOffice host; the same
   bytes re-render fine afterwards, so it's the creation-time render, not the codec. Healable with
   `thumbnail_backfill --office --force-rerender`.
4. **Visual-fidelity preview (optional next rung).** Today's preview is extracted text. A
   LibreOffice→PDF render lane (reusing the convert endpoint) could show true layout — decide if
   fidelity matters before building. **The cheap half is already within reach:** Office gets the
   three small SOCIAL_BASELINE thumbs but **no `page1_url`**, so there is no full-res readable
   page-1 the way PDFs have one. `_mime_family` classifies Office as `document`, and
   `render_kind_specific_variants_sync` (`specific_handlers/thumbnail_source.py`) only emits
   `page1_url` for `family == "pdf"` — even though the Office lane already renders a PDF
   internally for the thumbnail. Confirmed live 2026-08-09: all 23 Office masters carry exactly
   `og_url` / `thumbnail_url` / `tiny_url`, zero `page1_url`.
5. **xlsx "extract" parity note:** xlsx previews client-side via SheetJS (good); the office
   markdown endpoint also handles xlsx if a text view is ever wanted.

## Done

- **2026-08-09 — Office thumbnails, end to end.** New uploads verified in production (fresh
  docx/pptx → real page-1 renders). Every pre-existing Office master healed:
  `thumbnail_backfill --office --force-rerender` → audit **22 icons/missing → 0**, all 23 Office
  masters now render page 1, confirmed through the exact `GET /api/files` payload the Files UI
  binds to. Required building `force_rerender` (overwrite-in-place, the fix for the variant-key
  dedup trap) plus a guard that refuses to replace a real thumbnail with an icon fallback — and
  fixing two defects that made the universal backfill inert for EVERY mime type (bare-row
  `owner_id` KeyError; a total failure printing a green `DONE ... failed=0`). Knock-on: 155
  platform-wide files that had no thumbnail at all were healed, and the tracked pre-2026-07-10
  PDF icon defect was closed (61 icons → 0). aidream `1953f5f04`/`acaa54eaa`, v0.1.740.
- Office codec (extract ↔ generate ↔ LibreOffice convert) + ingest + chat-attachment reads +
  `office` agent tool + generation service + `POST /office/generate` + MIME routing guard.
- **2026-08-08:** read-side endpoints (`GET /office/{file_id}/markdown`,
  `POST /office/{file_id}/convert`), shared service (tool reuses it; legacy .doc/.ppt gain the
  LibreOffice bridge), and the FE surfaces: `OfficePreview` (Files side panel + `/files/f/{id}` +
  chat inline via `UniversalInlineFile`), Convert-to-PDF action, "New → AI document" prompt
  prefill into `/chat/new`.
- Local desktop read + generate — matrx-local, catalog synced.
- **2026-08-09 (matrx-local bundle — the sidecar was BROKEN and is now fixed + gated):** built the
  PyInstaller sidecar for the first time and ran the codec inside it. Reading .docx/.pptx/.xlsx
  worked; **generating a .pptx with speaker notes did not** — `FileNotFoundError:
  /tmp/_MEIxxxx/pptx/oxml/../templates/notesMaster.xml`. The template was in the archive:
  `pptx/oxml/__init__.py` opens it via `<its own dir>/../templates/…`, and frozen modules live in
  the PYZ, so `_MEIPASS/pptx/oxml/` is not a real directory and the OS cannot resolve the `..`.
  Same shape in `docx/parts/*` (default header/footer/styles/settings/comments) and `pptx/shapes`.
  All four specs are one-file, so every shipped platform carried it. Also found: the Office
  collection in all four specs sat inside a bare `except Exception: pass` — the silent skip behind
  four earlier frozen-only outages. Fixed via `matrx-local/specs/_office_bundle.py` (one source of
  truth; fatal on a missing package/template; derives the `../`-referencing dirs from the installed
  sources and materializes them), plus artifact-level gates in `verify-frozen-runtime.py` (archive
  module + data TOC checks, and an in-process `MATRX_FROZEN_OFFICE_VERIFY=1` probe that generates
  all three formats, round-trips them, reads raw-renderer-authored documents, and checks
  `classify_office` routing) and `tests/unit/test_office_bundle.py`.
- **2026-08-08 (workflow nodes):** four graph nodes live — `office.generate_document` /
  `office.generate_presentation` / `office.generate_spreadsheet` (inputs ARE the `office_*`
  kinds via new `@action(input_kind=/output_kind=)` support) + `office.extract`
  (`aidream/graph_actions/office/`); result kinds `office_file_result` +
  `office_extraction_result` seeded live (`migrations/content_ir_seed_office_result_kinds.sql`);
  E2E proven against the real scheduler + DB (generate → extract round-trip + kind-gate negative).
- **2026-08-08 (kinds activated — Arman's ruling):** all five office kinds are now
  `is_active=true`. `office_document` / `office_presentation` / `office_spreadsheet` activated
  through the gated `content_ir.set_kind_activation` (dual gate passed clean: `render_ok`,
  `structural_ok`, web `generic_structured` component); `office_file_result` /
  `office_extraction_result` were swept in by the named-shapes campaign. Standalone model
  emissions now render; the tool/workflow FileRef path remains canonical. Blocker found and
  filed while doing it: `set_kind_activation` ignores `p_actor` in its super-admin leg
  (aidream `FOUND_DEFECTS.md`) — it breaks the platform's own `kind_activate` tool.

## Decisions needed

*(none — the `office_*` activation question was decided and executed 2026-08-08; see Done.)*
