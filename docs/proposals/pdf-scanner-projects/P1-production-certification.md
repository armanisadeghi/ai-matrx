# P1 — Scanner Production Certification & Real-Device Hardening

> 2026-07-07 · Wave 1, Tier 1 · Master plan: [`README.md`](./README.md) · Delivers the
> "certified on real devices + prod" half of Convergence A.
> WHY: the scanner has never been exercised where users actually live — a real phone over
> HTTPS, or prod at all. Every polish wave so far was dev-localhost.

## Objective

Take the shipped scanner (both skins, one engine) from "verified locally" to **certified in
production on real hardware**, and close the two operational holes that certification will
expose: abandoned-session storage orphans and invisible failures. You own every bug the device
matrix finds in capture, crop, upload, resume, and save — this is a hardening project with a
test program attached, not a QA checklist.

## Current state (verified 2026-07-07)

- FE shipped + hardened: `features/pdf/scanner/` (engine: `useScanSession.ts`,
  `useScanSaveFlow.ts`; mobile `components/ScannerSurface.tsx`; desktop
  `components/desktop/ScannerDesktop.tsx` + `DesktopReview.tsx`; route
  `app/(core)/tools/scanner/ScannerRouteClient.tsx` — skin locked once per page load).
  Commits `af0f7609f`, `077b2fd1e`.
- Backend PROD-live: `POST /images/detect-document`, `POST /utilities/pdf/from-images` return
  401 on `https://server.app.matrxserver.com` (routes exist; authed E2E never run).
- DB: 10 scan docs / 10 `derivation_kind='scanned'` files, all local-dev-created.
- Known-untested (from `memory/project_pdf_phone_scanner`): iOS Safari capture cadence, HEIC
  library picks, system-camera fallback, resume after tab kill; getUserMedia requires HTTPS —
  LAN http will not grant.
- Orphan cleanup: **not built.** Every add uploads to hidden `system-files/scanner/{sessionId}`;
  a discarded browser (no explicit Discard) leaves files forever.
- Error capture: scanner failures are toasts + `console.error` only — nothing reaches the
  Error Inspector (`lib/diagnostics/`).

## Scope

**IN**
- Authed prod E2E on aimatrx.com: mobile (real iPhone + one Android) and desktop (Chrome +
  Safari + Firefox; drag-drop, webcam capture, mixed PDF+image import).
- The real-phone program: camera cadence, HEIC picks, EXIF rotation → quad round-trip, resume
  after tab kill / app switch, system-camera fallback, low-storage & flaky-network behavior
  (airplane-mode mid-upload → retry path).
- Fix everything the matrix finds, in the engine or skins (both repos — a needed aidream fix is
  part of this project, not a ticket).
- **Abandoned-session cleanup (aidream):** scheduled job deleting `system-files/scanner/**`
  sessions older than the resume window (default 7 days) that were never consumed by a
  `from-images` save — both criteria server-checkable (the resume manifest is browser
  localStorage; the server can NOT see it, so age + consumption are the whole test). Loud log
  line per deletion batch; idempotent.
- **Error capture:** wire scanner failure classes (upload error, detect error, save-stream
  error, poll timeout, clean-content-never-ready) into the Error Inspector via `captureError`
  with sensible tiers (invoke the `error-capture` skill).
- **Capture-overlay design parity** (source:
  [`design/Photo-to-PDF Desktop.dc.html`](./design/Photo-to-PDF%20Desktop.dc.html), camera
  screen ~lines 42-99): Auto/Manual capture-mode chips and a live "Page detected" indicator in
  the viewfinder. Detection today is post-upload background only — a live badge can ride the
  same `detect-document` call on a throttled preview frame, or a cheap client-side heuristic;
  pick what real devices can sustain (this is why it's yours, not P2's) and document the
  choice. Skippable ONLY if real-device testing shows it hurts capture cadence — then record
  that verdict here.
- Keep the FEATURE.md scanner sections + change log truthful as you go.

**OUT**
- Thumbnails, recents polish, Ask/extractor payoff — **P2** (you re-verify them at
  Convergence A, you don't build them).
- Reader performance on huge docs — **P3**.
- New extraction capabilities — **P4**.
- Education ingest wiring — education plan P9.

## Deliverables / Definition of done

1. A written device-matrix report (route: append to this brief or `features/pdf/docs/`) — every
   cell pass/fail with the fix commit for each fail.
2. Prod E2E green: phone scan → crop → save → extractor shows cleaned text → RAG search finds
   it. Same for desktop (drag-drop AND webcam).
3. Orphan cron live in aidream, verified by seeding an abandoned session and watching it
   reaped after the window (and a fresh session survive).
4. Scanner failure classes visible in the Error Inspector (force one of each, screenshot).
5. All fixes committed small, both repos; `features/pdf/FEATURE.md` change-logged.

## Surfaces touched

- `features/pdf/scanner/**`, `app/(core)/tools/scanner/**` (fixes only).
- aidream: cleanup job (their scheduler conventions), possibly `geometry.py` /
  `detect-document` / `from-images` fixes.
- `lib/diagnostics/**` (new `CapturedErrorSource` if needed).

## Dependencies & contracts

- Consumes C1 (thumbnails) only at Convergence A re-run — null-tolerant before then.
- Publishes nothing; coordinates with P2 on any shared engine file (small commits, pull often).

## Build guidance

- Skills: `error-capture`, `verify`, `finalize-and-ship`; aidream work follows that repo's
  CLAUDE.md.
- HTTPS for phone testing: prod itself is the honest path (downtime window = now); a Vercel
  preview URL also works. LAN http will never grant camera.
- THE bug class: quad coordinates are post-EXIF-transpose pixels; `normalize_input_image`
  transposes before ops. Any rotation bug you find — check this contract first.
- Dev-only gotcha: Turbopack drops `/tools/pdf-extractor/[id]` from its route cache after mass
  file changes — restart `next dev`; prod unaffected.

## Verification

Live only — real devices, prod URLs, live DB row checks (`docproc.processed_documents`,
`files.files`). No simulated streams, no mocked cameras. End by handing Arman the exact routes
+ a 5-minute phone-in-hand test script.

## Open questions

- Orphan window length (default 7 days) — pick a default, note it in the cron, flag in report.
