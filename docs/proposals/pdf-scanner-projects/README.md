# Photo-to-PDF / Document Pipeline — Master Execution Plan

> **Status date:** 2026-07-07 (v1).
> **Vision anchor:** [`features/pdf/FEATURE.md`](../../../features/pdf/FEATURE.md) — the PDF
> domain doc (shared parts, invariants, roadmap). No separate VISION doc exists for this
> domain; FEATURE.md's roadmap section + this plan are the working references.
> **Design sources:** [`design/Photo-to-PDF Desktop.dc.html`](./design/) + mobile — the actual
> Claude Design prototypes (read the HTML/CSS directly; pixel truth for every surface).
> Every brief in this folder is standalone — hand it to one agent blind using the copy-paste
> prompt in [`ASSIGN.md`](./ASSIGN.md). Every factual claim was re-verified against live code +
> the live DB (project `txzxabzwovsujtloxrus`) on 2026-07-07.

---

## 1. The thesis

The scanner is the platform's **physical-world ingest mouth**: any paper page, on any device,
becomes a durable, extracted, AI-cleaned, RAG-indexed document in one gesture. Both designed
skins are now shipped (mobile capture-first; desktop sidebar + workspace from the
"Photo-to-PDF Desktop" Claude Design). What remains is not UI — it is **certification on real
devices and prod**, **the visual/read→ask payoff loop** (thumbnails, recents, Ask), **scale**
(500-page docs), and **intelligence expansion** (figures, searchable PDFs, generation). Four
projects, fully parallel.

## 2. What the system is (one paragraph)

`/tools/scanner` (one engine `useScanSession` + `useScanSaveFlow`, two skins) captures/imports
pages → every add uploads instantly to hidden `system-files/scanner/{sessionId}` (zero loss;
localStorage manifest + resume) → server boundary detection pre-fills 4-corner crops
(`QuadEditor`; post-EXIF-transpose pixel contract) → Save is ONE stream
(`POST /utilities/pdf/from-images`): ordered items → one PDF in `Scans/`
(`derivation_kind='scanned'`) → extraction (OCR at pixel-exact DPI) → detached clean/chunk/RAG →
live ProcessingView ledger → verified navigation to the extractor
(`/tools/pdf-extractor/{doc_id}`), whose panes + agent panel ARE the design's Preview/Text/Ask.
P1 certifies this loop on real devices + prod; P2 makes the payoff visible (thumbnails, recents,
Ask); P3 makes it survive 500-page documents; P4 expands what extraction understands.

## 3. Current foundation (verified 2026-07-07)

- **Built + live (FE):** both skins shipped and hardened (`af0f7609f` desktop ship,
  `077b2fd1e` hardening: per-load skin lock, window drop guard, save-flow unmount guards,
  loud + owner-scoped recents). Full-project typecheck clean for scanner files; `/tools/scanner`
  and `/tools/pdf-extractor` serve 200 on dev.
- **Built + live (backend, PROD-verified today):** `POST /images/detect-document` and
  `POST /utilities/pdf/from-images` return 401 on prod (route exists; bogus routes 404) — the
  aidream deploy landed. Authed prod E2E has NOT run (P1's first deliverable).
- **Built + live (DB):** 10 scan docs (`docproc.processed_documents.metadata->>via =
  '/pdf/from-images'`), 10 `files.files` rows `derivation_kind='scanned'`; all polled columns
  exist (`clean_content_completed_at`, `cleaned_char_count`, `section_title`, `section_kind`,
  `used_ocr`); RLS on `processed_documents` = owner / org-member / curator.
- **Verified gaps:** scanned files have **zero thumbnails** (no `metadata.thumbnail_url`, no
  `files.pages` rows — desktop recent cards render a fake placeholder graphic) → P2. No
  real-phone pass ever ran (needs HTTPS) → P1. No orphan cleanup for abandoned
  `system-files/scanner/**` sessions → P1. Reader mounts all blocks (500-page docs) → P3.
  Figure extraction / searchable-PDF / `pdf/generate` never built (`pdf/ml`, `cloud_ocr`
  stubs) → P4.
- **Owned elsewhere — do not absorb:** education universal ingest (education P9) consumes
  scanner output but is its own plan; redaction key escrow is gated on the security team's KMS
  interface ([`W2-redaction-escrow.md`](./W2-redaction-escrow.md)); the extractor's mobile
  studio pass landed 2026-07-07 (`a6fbb4dde`) — build on it, don't redo it.

## 4. The project set

Tiers are staffing order, NOT sequencing — all Wave-1 projects run in parallel.

| # | Brief | One-liner | Tier |
|---|---|---|---|
| P1 | [`P1-production-certification.md`](./P1-production-certification.md) | Prod + real-device certification, orphan cleanup cron, error capture — the loop provably works where users live | 1 |
| P2 | [`P2-scan-document-experience.md`](./P2-scan-document-experience.md) | Thumbnails (durable-URL contract), recents that look real, extractor Preview/Text/Ask payoff, share/export | 1 |
| P3 | [`P3-large-document-scale.md`](./P3-large-document-scale.md) | Reader virtualization, resumable per-page job model >200pp, streamed ZIPs, reading-order tab | 2 |
| P4 | [`P4-document-intelligence.md`](./P4-document-intelligence.md) | Figure/image extraction with RAG tokens, OCRmyPDF searchable PDFs, `pdf/generate` | 2 |

## 5. The contracts (publish day 1)

| Contract | Owner | Consumers | Interface |
|---|---|---|---|
| **C1 — Thumbnail** | P2 | P1 (verify pass), files grid, education ingest | `files.files.metadata.thumbnail_url: string` — **durable public/CDN URL, never a signed URL** (media-durability doctrine; NOTE: `mtx_public_url_guard` checks top-level columns only — if a public page reads the thumbnail, extending the guard trigger for JSONB paths OR promoting `thumbnail_url` to a real column is part of C1) + `RecentScanRow.thumbnailUrl: string \| null` in `features/pdf/scanner/processing.ts`. Publish the typed field + null-tolerant rendering day 1; backfill later. |
| **C2 — Extractor surface registry** | P3 (reader internals) / P2 (Ask + preview wiring) | each other | Additive-only: new panes/tabs enter via `features/pdf/surfaces/registry.ts` + `PdfSurfaceSwitcher`; NEITHER project rewrites a shared pane the other owns. P3 owns the page-render/virtualization layer; P2 owns Ask-panel + preview composition. Conflicts → this table. |
| **C3 — Resumable job envelope** | P3 (aidream) | P4 (new ops adopt it) | NDJSON event schema for per-page resumable jobs (`job_started` / `job_page_done` / `job_checkpoint` / terminal + error). Day-1: publish event names + payload shapes as a stub doc in `features/pdf/docs/`; P4 codes against the doc, wires real types after `pnpm sync-types`. |

## 6. Cross-cutting mandates (audited at Convergence A)

- **Zero data loss** — the scanner's founding law: every capture durable before anything else;
  failures loud; the "PDF still saved to Scans/" pattern preserved.
- **Quad coordinate contract** — post-EXIF-transpose pixels everywhere; breaking it is THE bug
  class (`features/pdf/FEATURE.md` invariants).
- **Media durability** — no expiring URL ever persisted or rendered raw; `<InlineMediaRef>` /
  durable refs only.
- **One engine, two skins** — orchestration changes go in `useScanSaveFlow` / `useScanSession`,
  never forked per skin.
- **Direct UI↔DB** — status polling and lists stay supabase-js direct; Python only for bytes /
  compute (data-flow doctrine).
- **Shared-doc discipline** — all four projects touch `features/pdf/FEATURE.md`: change-log
  entries are append-only one-liners; pull/rebase immediately before every commit that edits
  it; parts-table edits announced in the commit message. (Parallel sessions clobbering shared
  registry/doc files is a documented failure class here.)

## 7. Waves, convergences, fan-out

- **Wave 1 (parallel):** P1 + P2 + P3.
- **Convergence A — "Production-certified scan loop"** (feeds: P1 + P2). Integration: P1's
  device matrix re-run over P2's thumbnails/recents; orphan cron verified against P2's writes.
  **DoD:** on prod aimatrx.com — real iPhone scan (camera, HEIC, rotate, resume-after-kill) and
  desktop scan (drag-drop, webcam) each land as an extracted, cleaned, indexed, *thumbnailed*
  document; Ask answers from its content; zero orphaned session files after the cron window;
  scanner failures visible in the Error Inspector.
- **Fan-out unlocked by A:** public/marketing scanner page; education P9 ingest wiring; mobile
  (Expo) scanner parity; scan-to-share growth loop.
- **Wave 2 (parallel):** P4 + [`W2-redaction-escrow.md`](./W2-redaction-escrow.md) (only when
  the KMS interface exists) + fan-out items above.
- **Convergence B — "Documents that understand themselves"** (feeds: P3 + P4). Integration:
  P4's figure tokens and searchable-PDFs flow through P3's job envelope and virtualized reader
  into RAG. **DoD:** a 300-page scanned mixed text/figure document extracts resumably, renders
  instantly, its figures are RAG-retrievable, and a searchable PDF downloads.

## 8. Flags → DECISIONS RECORDED

- **F1 — Design-file access:** — **RESOLVED 2026-07-07.** Arman provided the handoff bundle;
  sources now live in [`design/`](./design/) (desktop + mobile `.dc.html`). Full parity audit
  run against the shipped build: structure matches (sidebar / Home / Review / dark capture +
  crop / processing); shipped exceeds the design on crop (rotate/zoom/re-detect) and processing
  (live ledger). Six deltas found and folded into the briefs: per-page rename, "View all"
  recents, results-surface details (Ask suggested-questions, word-count/confidence stat, Copy
  text, Download/Share header) → P2 §Design parity; enhance modes (Auto/Original/Grayscale/B&W)
  → P2; capture-overlay parity (Auto/Manual chips, live "Page detected" badge) → P1. The
  design's in-scanner Results screen remains deliberately mapped onto the extractor (one
  canonical surface) — P2 must make that surface deliver everything the Results screen shows.
- **F2 — Competitive research:** — **DECIDED 2026-07-07 (Arman): no research for this one.**
- **F3 — Org visibility of scans:** — **DECIDED 2026-07-07 (Arman): "Absolutely not. No
  different than anything else. Don't override that stuff."** Scans behave exactly like every
  other resource — personal by default, shared via the canonical sharing system. No special
  team views, no scanner-specific visibility rules, ever.
- **F4 — P4 internal priority:** — **DECIDED 2026-07-07 (Arman): "do whatever is right"** —
  figures-first default stands.
- **F5 — Scope framing (Arman, 2026-07-07): the feature is built and fully functional; the
  active work is UI-tied only.** P1 (certification of what exists) and P2's design-parity +
  payoff items are the live scope. P3/P4 are functionality *expansions* — documented so they
  aren't lost, but **assign only on Arman's explicit request**, never as a default wave.
  (Pure-UI parity items — per-page rename, View all, 50 MB limit — were built directly on
  2026-07-07 rather than briefed.)

## Change log
- 2026-07-07 — v1. Created post desktop-ship (`af0f7609f`) + hardening (`077b2fd1e`); all
  claims re-verified against live code, prod endpoints, and live DB today.
