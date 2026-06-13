# PDF System — Handoff & Honest Failure Report (2026-06-13)

**Audience:** the engineer who picks this up to finish it properly.
**Author's stance:** this is written against my own work. I am calling out what
I did NOT verify, what I claimed prematurely, and what is still broken. Trust
the "Verified" section; treat everything else as suspect until you re-prove it.

> **Bottom line: this is NOT production-ready, and the headline requirement —
> "clicking a PDF reliably loads it" — is only partially addressed and
> UNVERIFIED at scale or in production.** I fixed several real, concrete bugs
> (below) but I never reproduced the user's reported *intermittent* failure, so
> I cannot claim it is gone. The single most likely real-world cause —
> **files whose S3 bytes are missing** — is a data-integrity problem whose
> scope is unknown and was never audited.

Related docs (read in this order): this file → `SYSTEM_STATUS.md` (per-surface
status) → `FEATURE.md` (architecture) → `~/.claude/plans/feature-deep-dive-audit-rustling-hare.md` (the original audit/plan).

---

## 1. The central unsolved problem: load reliability is NOT proven

The user reports PDFs load "maybe 20% of the time it fails, no errors, no logs."
I never reproduced a *true intermittent* failure. What I actually found:

- **Consistent** failures from **dead-source files** (S3 object missing) — see §2.
- A real **caching gap** (the same PDF re-downloaded every view, even twice on
  one page) — fixed, see §4.
- A real **silent-hang** path (cold backend / CDN redirect) — fixed, see §4.

It is entirely possible the user's "20%" is mostly dead-source files + cold-load
latency being perceived as random. **It is also possible a genuine intermittent
bug remains that I never triggered.** Do not assume it's solved. Reproduce it
first (see §8, step 1) before believing any of my fixes closed it.

**What I changed and what I actually verified:**

| Change | Verified? | How |
|---|---|---|
| Viewer now uses cached blob path (`useFileBlob`) not Range-streaming | ✅ caching only | `performance.getEntriesByType('resource')` showed **0** new download requests on re-select of one file (`ap-world`) on **localhost dev → prod backend** |
| Loading state fills the area | ✅ | Measured the loading container: **821×1009px** (was 129px) |
| `blob:` URL avoids CDN-redirect/CORS failure | ⚠️ inferred | curl proved the CDN path + the redirect mechanics; the blob path sidesteps it by construction, but I did not A/B the failure in a real browser |
| 90s XHR timeout converts hangs → errors | ❌ | code-only; never triggered a real hang to confirm |
| Backend: missing S3 object → 404 not 500 | ⚠️ partial | curl shows ACOEM now returns 404 on a range probe; **deploy-dependent**, prod state unconfirmed |
| Inline NER "Entities" tab | ⚠️ renders only | Renders the **empty state**; I never saw it populated with real entities |

**Everything in that table was tested on localhost dev (Turbopack, which
wedged repeatedly and had to be restarted) hitting the production backend. The
production Vercel build, the production service worker, and real multi-file/
multi-user behavior are UNVERIFIED.**

---

## 2. The data-integrity problem (probably the real "it fails" — UNSCOPED)

Some `cld_files` rows have **no S3 object** — the row survives, the bytes are
gone (orphaned by the 2026-05 AWS storage migration, per `FEATURE.md`). Download
returns `NoSuchKey`.

**Measured (tiny sample — admin@admin.com, 3 PDFs):** 1 of 3 is dead
(`ACOEM…`, id `eaa44bb8-…`). `t.pdf` works (CDN), `ap-world` works.

**This was NEVER audited at scale.** The 2026-06-11 changelog says "10 dangling
Studio docs were archived" — but that was `processed_documents`, not the
`cld_files` file system the user browses. **Nobody has counted how many
user-facing PDFs are dead.** If it's a meaningful %, that alone explains the
"fails sometimes" with no code bug at all.

**TOOLING NOW EXISTS (2026-06-13):** a recurring data-integrity system was
built — don't re-write the audit script. See `lib/integrity/` (registry +
runner), the admin page `/administration/data-integrity`, and the CLI
`pnpm check:data-integrity[:strict]`. It already covers: visible files marked
`unrecoverable://` (the in-place dead-source flag — **the current state of the
known-dead ACOEM file**), empty `storage_uri`, dangling folder/bridge/duplicate
references, orphaned/deleted-source `processed_documents`, and an opt-in live S3
byte probe (`--probe` / "Run all + probe"). Live state at build time: **2**
visible-unrecoverable files (errors), **2** processed_documents on soft-deleted
sources (warnings); all other referential checks clean across 6,501 live files.

The byte probe still needs a **backend service endpoint** for a true cross-user
audit — today it only covers files the caller's JWT can access (no cross-user
service token exists). Add a new check to `lib/integrity/checks.ts` to extend
coverage; both surfaces pick it up automatically.

**Original required-audit note (now implemented above):**
```
# For every PDF cld_files row, probe /files/{id}/download (range 0-0) and
# bucket by status. 200/206 = ok; 404 = dead source; 500 = backend bug.
# Script skeleton: iterate cld_files where mime_type='application/pdf' and
# deleted_at is null; curl each download endpoint with a service token.
```
**Then decide remediation** (product call): re-upload originals if they exist
anywhere; OR mark dead files (a `source_unavailable` flag) and filter/badge
them in the file UI; OR soft-archive them. Today the FE just shows an
"original unavailable" panel *after* a failed fetch — it does not know a file
is dead until it tries.

---

## 3. Known concrete failures still present

- **Dead-source files** show a failed fetch then the unavailable panel — but
  the file list/grid still shows them as normal files with no warning until you
  open them. No proactive "this file's original is missing" indicator. (§2.)
- **Backend 404 mapping is deploy-gated.** Until aidream deploys commit
  `12083dc9`, dead files return **500** in prod → the FE shows a scary
  "Download failed (500)" error card instead of the graceful panel (the FE maps
  404→panel, not 500→panel, by design). Verify after deploy.
- **The NER "Entities" tab and the RAG knowledge-graph NER are two different
  data stores.** The Overview "Knowledge" panel triggers RAG ingest
  (`kg_entities`, org-level); the Entities tab reads `file_entities`
  (annotation-derived, per-file). Clicking "Index for knowledge" does **not**
  populate the Entities tab. This is misleading and was not unified.
- **First-paint regression for large files (untested).** The viewer now
  downloads the WHOLE file before page 1 paints (blob path). For a few-MB doc
  it's a blink; for a 100MB doc it will be worse than the old progressive path.
  No size threshold / fallback was built. Untested above ~2.6MB.
- **The service worker (`blob-sw.js`) is half a cache.** It SERVES from
  IndexedDB but its `handleFetch` never STORES bytes on a network miss
  (`features/files/cache/service-worker/src/sw.ts` ~line 459). The page-side
  `blob-cache` is what actually caches now (via `useFileBlob`). The SW is
  largely dead weight for PDFs and a latent source of confusion; decide whether
  to finish it (store-on-miss) or stop intercepting `/download`.

---

## 4. What IS fixed (with evidence) — preserve these

- **Keystone source bug** (the original platform-wide breaker): the FE sent
  `media:{cld_id}`; the backend only honors `file_id` (`extra="allow"` silently
  dropped it → 422 on every cld_file-sourced op). Fixed via
  `features/pdf/utils/source.ts` `buildPdfSource`. Verified earlier: curl
  `extract-pages` 200 with `{file_id}` vs 422 with `{cld_id}`.
- **Caching**: viewer routes through `useFileBlob` (module LRU + IDB +
  in-flight dedup). Re-opening a file makes **zero** network requests
  (verified). This killed the "same PDF re-downloads every time / 30s" bug.
- **Silent hang → visible error**: 90s XHR timeout + clear error card + Retry
  that drops the cache; `[pdf-load]` console logging on every resolve.
- **Loading state** fills the viewport (overlay during pdfjs parse) — was a
  129px box, now fills (measured).
- **CDN-hosted PDFs** load (XHR handles the cross-origin redirect that pdfjs
  `fetch` could not).
- **Data consolidation (W2)**: the `cld_files.canonical_processed_document_id`
  bridge is backfilled + trigger-maintained; `pdf_unified_pages` view;
  `pdf_redaction_audits` applied + written. (Verified live via DB queries at the
  time; re-confirm before relying on it.)

---

## 5. Claimed but NOT verified end-to-end (re-prove before trusting)

The earlier waves (W0–W6) and the "canonical components" consolidation were
largely structural edits + subagent work that I verified **thinly**. The user
kept finding basic broken things (caching, dead files, tiny loading), which
tells you the verification depth across the whole effort was insufficient.
Specifically, these were confirmed to *exist and wire up* but their actual
operations were **never exercised end-to-end**:

- **Edit panels** (Pages / Doc Ops / Notes / Findings / Redact / Search): do
  rotate/exclude/extract/delete/redact/compress actually produce correct output
  on a real file? Unconfirmed beyond "the components mount."
- **Share**: does changing visibility / creating a share link actually work and
  persist? Unconfirmed.
- **Info**: correctness of every field. Unconfirmed.
- **The detect→redact one-flow, preset picker, detector-prefs** — built, never
  run against a real document to confirm output.
- **Mobile** layouts — code exists, never tested on a device/viewport.
- **The Analysis detector pipeline actually producing findings/entities** — the
  Entities tab only ever showed empty.

Treat §4 as the trustworthy floor and §5 as "unproven inventory."

---

## 6. Architecture debt the next person should resolve

1. **Two NER/entity systems** (`file_entities` vs RAG `kg_entities`). Decide the
   canonical one and unify, or clearly delineate them in the UI. Right now the
   "incorporate NER into Analysis" requirement is half-met.
2. **Service-worker caching is half-built** (§3). Finish or remove.
3. **Range-stream vs full-blob tradeoff** — the blob path caches but loses
   progressive first-paint. Add a size threshold: blob-cache small/medium,
   range-stream (or chunked) huge files. Untouched.
4. **Dead-source detection is reactive** — the system should know a file's bytes
   are missing without a failed fetch (a column, or a periodic reconciler).
5. **Verification was dev-only.** Stand up a real production smoke test
   (Playwright against the deployed app, real account, several real files) — the
   Turbopack dev server is unreliable and is NOT what users run.

---

## 7. What's missing to call this "done"

- A **scoped audit + remediation** of dead-source files (§2). This is likely the
  biggest single lever on the user's perceived reliability.
- **Production verification** of the load path across many real files and both
  reported accounts (the user's own + admin) — reproduce the 20% first.
- **End-to-end exercise** of every Edit panel, Share, Info, and the surfaced
  capabilities (§5) — click every button, confirm real output.
- **NER unification** or honest UI separation (§6.1).
- **Large-file handling** (§6.3).
- **Mobile** pass.
- **Observability**: the `[pdf-load]` console logs are a start; there are no
  server-side load metrics. Add structured logging on `/files/{id}/download`
  (status, bytes, ms, cache outcome) so failures are diagnosable from logs —
  the user explicitly asked for this and it is only partially done (FE console
  only).

---

## 8. How to finish this right (recommended sequence)

1. **Reproduce the failure first.** Real production build, the user's own
   account, click 10–20 different real PDFs, record every outcome (success /
   404 / 500 / hang / slow). Do NOT write code until you've seen the real
   failure distribution. This tells you whether it's data (§2), cold-backend
   latency, or a genuine code bug.
2. **Audit dead-source scope** (§2 script) and decide remediation with the
   product owner.
3. **Add server-side download logging** so the next failure is self-explaining.
4. **Verify or fix** the blob-cache path in the **production build + prod SW**
   (not dev).
5. **Exercise §5 inventory** end-to-end; fix what's actually broken (expect
   surprises — the pattern so far is "looks wired, doesn't work").
6. **Unify NER** (§6.1), **large-file threshold** (§6.3), **mobile**, then
   re-baseline `SYSTEM_STATUS.md`.

---

## 9. Map of my changes (for review)

Recent PDF commits on `main` (frontend `armanisadeghi/ai-matrx`):
- `ba5731812` loading state fills viewport (overlay during parse)
- `37481e3d6` inline NER Entities tab
- `e1647372d` caching + reliability (the big one — `useFileBlob` switch)
- `804dff7cb` CDN "Failed to fetch" fix (superseded by the blob switch)
- earlier: `features/pdf` consolidation, surface switcher, W2 data migrations,
  context-menu registry, FileInfo convergence, Document→Knowledge rename.

aidream (`AI-Matrix-Engine/aidream`):
- `12083dc9` missing S3 object → 404 (NEEDS DEPLOY to take effect)
- earlier: redaction audits write, detector prefs endpoints, file-pages N+1 fix.

Key files: `features/pdf/hooks/usePdfRemoteSource.ts` (now delegates to
`useFileBlob`), `features/files/hooks/useFileBlob.ts` (+ in-flight dedup),
`features/pdf/components/viewer/PdfDocumentRenderer.tsx` (overlay + retry),
`features/pdf/components/viewer/PdfLoadingState.tsx`, `lib/python-client.ts`
(XHR timeout), `aidream/api/routers/files/__init__.py` (`_map_exc`).

---

## 10. Open questions for the product owner

1. **Dead-source files**: do the original bytes exist anywhere to re-upload, or
   are they permanently lost? This decides whether §2 is "restore" or "mark &
   move on."
2. **Progressive vs cached**: acceptable to download the whole file before first
   paint (instant on re-open) for the common case, with a threshold for huge
   files? Or is progressive first-paint a hard requirement?
3. **NER**: should the Analysis "Entities" tab show the RAG knowledge-graph
   entities (`kg_entities`), the file-analysis entities (`file_entities`), or
   both unified? They are different systems today.
