---
status: active
updated: 2026-08-21
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
  Inventory: `/Users/armanisadeghi/code/common-docs/systems/media/file-service/FILE_SURFACES.md` § OFFICE.
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
   bytes re-render fine afterwards, so it's the creation-time render, not the codec. Existing
   rows were healed by the 2026-08-24 backfill (below); the creation-time defect itself remains.
4. **xlsx "extract" parity note:** xlsx previews client-side via SheetJS (good); the office
   markdown endpoint also handles xlsx if a text view is ever wanted.
5. **Follow-up (efficiency, not correctness):** a DECK upload now runs LibreOffice up to three
   times (baseline thumb raster, `page1_url` variant, PDF-derivative warm; Word/Excel skip the
   warm since 2026-08-24) — consolidate to one conversion feeding all three lanes inside
   `thumbnails.py::_process_source` when it matters. Also at that time: give the bounded-memory
   (>64 MiB) path a real Office `page1_url` lane (today it loud-skips, matching the large-PDF
   posture).
6. **Follow-up (race hardening, LOW):** two concurrent cache-miss converts can both write a
   `pdf_conversion` (or `audio_extracted`) derivative — readers converge on the oldest row, so
   this is waste, not corruption. Close with per-kind partial unique indexes on
   `(parent_file_id, derivation_kind, derivation_metadata->>'<kind>_key') where deleted_at is
   null` — mind the soft-delete/unique-constraint law in `packages/matrx-files/CLAUDE.md`.

## Done

- **2026-08-24 — Adversarial-review fixes + full backfill.** Sonnet adversarial pass over the
  visual-preview ship confirmed one HIGH: the `pdf_conversion` derivative write hand-rolled its
  metadata and never inherited the parent's org → an org-owned deck's PDF would land in the
  uploader's PERSONAL org (silent 403s for co-members once decks default to visual). Fixed by
  routing `office_pdf.py` AND `audio_extract.py` (same latent defect) through
  `inherit_derived_file_policy`; pinned by `test_derivative_inherits_parent_org_and_visibility`;
  live DB checked — zero wrong-org rows existed. Also: upload warm now fires for DECKS only
  (Word/Excel convert lazily on first click); the >64 MiB path loud-skips Office `page1_url`
  like it does PDFs; the LibreOffice-gated conversion test ran for the first time (LibreOffice
  now on the dev Mac) and exposed a wrong page-count expectation (the generator's `title=` adds
  a title slide) — test fixed to measure via the codec. **Backfill executed** (was Remaining
  item 4): all 24 pending Office masters now carry fresh baseline thumbs + the full-res
  `page1_url` (`seen=25 processed=24 noop=1 failed=0`). FE: Text-mode slide cards gained a
  hover "View" that jumps to that slide in the visual mode (controlled `pageNumber` on
  `PdfPreview`; 1:1 slide↔page for decks) — the extracted-contents ↔ source connection from
  the vision. Live browser verify of that jump is blocked by the AD203 files-read outage
  (aidream FOUND_DEFECTS) — re-verify once that closes.
- **2026-08-21 — Visual-fidelity preview SHIPPED (was item 4).** The LibreOffice→PDF render lane
  is live end to end: new `matrx_files/office_pdf.py` creates the cached `pdf_conversion` files
  derivative (idempotent per source revision, `parent_file_id` lineage, page/slide count in
  `derivation_metadata`; new derivation kind + check constraint applied live; SQL 021);
  `POST /files/{id}/office-pdf` on the package router (host + standalone parity);
  `POST /office/{id}/convert` repointed to the same lane (no more duplicate PDFs per click);
  automatic warm on every office upload via `upload_hook._warm_office_pdf` (all transports);
  Office masters now emit the full-res `page1_url` kind-specific variant (same contract as PDF).
  FE: `OfficePreview` gained a **Slides/Pages ↔ Text** toggle — decks DEFAULT to the visual
  mode, rendered through the canonical `PdfPreview` from the derivative's file id; PDF FileRef
  cached beside the extraction and invalidated through the same choke points. aidream
  `61a6df5ca` + matrx-frontend (this commit).
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
