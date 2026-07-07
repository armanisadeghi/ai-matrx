# P2 — Scan Document Experience (CONTRACT OWNER: C1 thumbnails — publish day 1)

> 2026-07-07 · Wave 1, Tier 1 · Master plan: [`README.md`](./README.md) · Delivers the visible
> payoff half of Convergence A: the design's recent-scans grid and Preview/Text/Ask loop,
> for real.
> WHY: today a saved scan looks like nothing — placeholder-graphic cards, no visual identity,
> and the "Ask" promise of the desktop design lives un-verified on the extractor.

## Objective

Make every scanned document *look and pay off* like a document: real page-1 thumbnails
everywhere scans appear, a recents experience with real management (open / rename / delete),
and a proven read→ask loop on the extractor for scan-born docs — the design's Preview/Text/Ask
tabs made true, not just mapped in a comment.

## Current state (verified 2026-07-07)

- **Zero thumbnails exist:** all 10 `derivation_kind='scanned'` files have no
  `metadata.thumbnail_url` and no `files.pages` rows. Desktop recent cards
  (`ScannerDesktop.tsx` recents grid) render a hardcoded placeholder document graphic.
  `features/pdf/FEATURE.md` roadmap: "Verify aidream variant pipeline renders PDF page-1
  thumbnails (FE grid path already prefers `thumbnailUrl`)" — the FE files-grid preference
  exists; the pipeline does not produce them for scans.
- `fetchRecentScans` (`features/pdf/scanner/processing.ts`) is owner-scoped, loud on error,
  reads `metadata->>via='/pdf/from-images'` + `clean_content_completed_at` marker (never the
  body). `RecentScanRow` has no thumbnail field yet — that's your C1.
- Extractor: `/tools/pdf-extractor/[id]` is the canonical results surface; agent panel exists;
  mobile studio pass landed 2026-07-07 (`a6fbb4dde`, Agents button). Whether Ask actually
  grounds in a scan-born doc's cleaned content end-to-end is UNVERIFIED.
- Sharing plumbing is platform-canonical (`features/sharing/`); nothing scan-specific exists.

## Scope

**IN**
- **C1 day 1:** add `thumbnailUrl: string | null` to `RecentScanRow` + null-tolerant card
  rendering (keep the placeholder as the null state) and document the storage contract:
  `files.files.metadata.thumbnail_url` = **durable public/CDN URL — never a signed URL**
  (media-durability doctrine). NOTE: `mtx_public_url_guard`'s trigger checks top-level columns
  only (`migrations/mtx_public_media_url_guard.sql`) — if any anonymous/public page will read
  the thumbnail, extending the trigger for JSONB paths OR promoting `thumbnail_url` to a real
  column is part of C1; owner-only surfaces need no registration. Commit before anything else.
- **Thumbnail generation (aidream):** page-1 thumbnail rendered at `from-images` time (and for
  existing scans via backfill), persisted through the canonical file pipeline, URL written to
  the contract location. Decide render size once (~480px wide is plenty for cards).
- Recents everywhere: desktop home grid + sidebar consume real thumbs; scan rows gain
  open / rename / delete (soft-delete via `deleted_at`, canonical patterns); "Indexed" badge
  stays truthful (`clean_content_completed_at`).
- **The Ask loop, proven:** from a scan-born doc on the extractor, the agent panel answers
  questions grounded in its cleaned content — verify on desktop AND the mobile studio; fix
  whatever breaks (chunking, doc targeting, panel wiring). Add a first-class "Ask about this
  scan" affordance from the scanner's ProcessingView done-state if one doesn't exist.
- Share/export: canonical share of a scanned file + PDF download from the extractor surface
  verified for scan-born docs.
- **Design parity** (source: [`design/Photo-to-PDF Desktop.dc.html`](./design/Photo-to-PDF%20Desktop.dc.html)
  — read the HTML directly; these are in the prototype and missing from the build):
  - Per-page rename in Review: each grid card / list row has an editable label input
    (design lines ~355, ~394). Today `DesktopReview` renders `item.fileName` statically —
    add `label` to `ScanItem` + the session manifest; labels become PDF bookmark/section
    names if the backend supports it, else FE-only display.
  - "View all" link on the RECENT SCANS header (design ~269) → route to the full recents
    view you build (or `/files` Scans folder — your call, note it).
  - Results-surface details the extractor must deliver for scan-born docs: header
    Download + Share buttons, "Indexed for RAG" pill, Extracted-text stat line
    ("N words · M% confidence") + Copy text button, Ask tab's suggested-questions grid
    (four content-derived prompts) + "grounded in its text" framing (design ~445-531).
  - Enhance modes at capture/crop time: Auto / Original / Grayscale / B&W (design confirm
    screen ~131-141). Needs an aidream per-item color-mode op applied at build time
    (like `perspective_crop` — original never mutated); FE picker in the crop sheet.
  - Dropzone copy: "up to 50 MB each" size hint (design ~248) — add and enforce the limit
    client-side with a loud toast.

**OUT**
- Device/prod certification matrix — **P1** (they re-run over your thumbnails at
  Convergence A).
- Reader virtualization / huge docs — **P3**. You must not rewrite the page-render layer
  (C2: additive registry entries only).
- aidream clean/chunk pipeline internals — **P3** (they're rebuilding it as resumable jobs in
  the same wave). Your Ask-loop fixes stop at doc targeting + panel wiring; if a fix genuinely
  needs chunk-pipeline surgery, coordinate with P3 first, never land it unilaterally.
- Figure extraction, searchable PDFs — **P4**.

## Deliverables / Definition of done

1. C1 published (typed field + doc + null-tolerant rendering) — day 1, own commit.
2. New scans get a thumbnail automatically; the 10 existing scans backfilled; recents grid +
   sidebar show real page images (verified live DB: `metadata->>'thumbnail_url'` non-null and a
   durable URL for all scanned files).
3. Rename/delete work from the recents UI and round-trip the DB (soft delete honored by
   `fetchRecentScans`' `deleted_at` filter).
4. Ask verified: screenshot of a correct, content-grounded answer about a scanned doc, desktop
   + mobile; the entry affordance shipped.
5. Share link to a scanned file opens for the grantee; PDF download works.
6. Design parity closed: per-page rename round-trips the manifest; enhance modes produce
   visibly different PDF output (grayscale scan verified); results surface shows the stat
   line, Copy text, suggested questions, Download/Share; 50 MB limit enforced loudly.
7. `features/pdf/FEATURE.md` updated (parts table if you add a primitive; change log always).

## Surfaces touched

- `features/pdf/scanner/processing.ts`, `components/desktop/**`; extractor surface
  (`app/(core)/tools/pdf-extractor/**`, `features/pdf/` panes via registry only).
- aidream: `from-images` thumbnail step + backfill script.
- DB: `files.files.metadata` writes; possibly `mtx_public_url_guard` registration
  (migration via Supabase MCP + ledger + `pnpm db-types` if any DDL).

## Dependencies & contracts

- **Publishes C1** (day 1). Honors **C2** (additive extractor registry; P3 owns reader
  internals). Coordinates with P1 on engine files.

## Build guidance

- Skills: `type-safety` (any Supabase typing), `db-change` family (if DDL), `verify`,
  `finalize-and-ship`; `rich-document-actions` if you add actions to extractor content.
- Thumbnail generation + persistence happen server-side through aidream's canonical file
  persistence (`fileHandler` is an FE primitive — its uploads-only rule applies only if you
  add any FE-side upload path, which you shouldn't need).
- Media durability is the trap: a signed URL in `thumbnail_url` works for days then breaks
  forever. Public/CDN URL or nothing.
- Recents reads stay direct supabase-js (data-flow doctrine) — do not add a Python "list scans"
  endpoint.

## Verification

Live app + live DB only. Fresh scan on dev → thumbnail appears without refresh tricks;
backfill checked by SQL; Ask answered with content only the scanned page contains. Hand Arman
exact routes + a 3-step visual test.

## Open questions

- None blocking. (Org-visible "Team scans" is master-plan flag F3 — Arman's call, not yours.)
