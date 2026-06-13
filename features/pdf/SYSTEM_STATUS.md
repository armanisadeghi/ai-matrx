# PDF System — Canonical Status (2026-06-12)

**The rule:** one purpose → one implementation. The component listed here is the *same* one mounted in production AND on the demo bench. There is no second version anywhere.

**Demo bench (test everything from one place):** `/demos/ssr/pdf-processing/components`
— pick a PDF once at the top; every canonical surface mounts against it.
**Endpoint tests (per-API):** `/demos/ssr/pdf-processing` (27 routes).

Legend: 🟢 fully functional · 🟡 functional, known weakness · 🔴 known broken / gap.

---

## Canonical systems

| System | Canonical component | Path | Status | Notes |
|---|---|---|---|---|
| **PDF Preview** | `PdfDocumentRenderer` (via `PdfPreview`) | `features/pdf/components/viewer/` | 🟢 | One viewer everywhere. Range-streamed (progressive), zoom / fit / rotate, page nav, **new polished loading state**, Retry on failure, missing-source panel. Wrappers (code editor, RAG pane) are thin adapters — no forks. |
| **PDF Edit** | `PdfEditTab` (canvas + InspectorRail panels) | `features/files/components/surfaces/single-file/PdfEditTab.tsx` | 🟢 | Canvas modes **View / Select / Draw**. Six tool panels below — all real (see panel table). |
| **Knowledge** (was "Document") | `DocumentTab` | `features/files/components/surfaces/DocumentTab.tsx` | 🟢 | **Renamed Document → Knowledge** (it's the RAG/knowledge-index view: pages, cleaned text, chunks, lineage). Tab id unchanged; label + tooltip updated. |
| **Analysis** | `AnalysisTab` | `features/file-analysis/tab/AnalysisTab.tsx` | 🟡 | Detector sections + **NER now wired in**: `FileKnowledgePanel` at the top triggers / re-runs RAG+NER and shows index status. **Gap:** the extracted *entities themselves* are not yet displayed inline — the panel links to the Knowledge graph. See "NER" below. |
| **Share** | `FileShareTab` | `features/files/components/surfaces/FileShareTab.tsx` | 🟢 | Real (414 LOC): visibility (private/shared/public), active-link count, people & groups, owner gating. |
| **Info** | `FileInfoTab` | `features/files/components/surfaces/FileInfoTab.tsx` | 🟢 | **Converged**: the Info *dialog* now mounts `FileInfoTab` — one implementation whether opened as a tab or a dialog. |
| **Surface switcher** | `PdfSurfaceSwitcher` + registry | `features/pdf/components/PdfSurfaceSwitcher.tsx`, `surfaces/registry.ts` | 🟢 | "Open in" menu on every surface; "open here" + "open in new tab" per row. Add a surface = one registry entry → appears everywhere. |
| **Right-click / ⋮ menus** | `FileContextMenu`, `RowContextMenu` | `features/files/components/core/.../` | 🟢 | **Fixed**: now registry-driven — every PDF surface (File viewer, Analysis Studio, PDF Extractor) appears, plus the RAG actions. Previously only 3 RAG options showed. |
| **Studio preset catalog** | `PdfPresetPicker` | `features/pdf/components/PdfPresetPicker.tsx` | 🟢 | Backend preset catalog → studio render → download. |

## Edit sub-panels (all six built)

| Panel | File | Status | Notes |
|---|---|---|---|
| **Pages** | `PagesPanel.tsx` | 🟢 | In-place rotate / exclude / include (metadata, refetch wired, per-page busy); bulk extract / delete / duplicate / rotate (produce a derivative — labeled, confirmed). |
| **Doc Ops** | `DocumentOpsPanel.tsx` | 🟢 | Compress + the preset picker. Derivative download. |
| **Notes** | `AnnotationsPanel.tsx` | 🟢 | Create / edit / jump-to annotations on the canvas. |
| **Findings** | `FindingsPanel.tsx` | 🟡 | Detector findings — populated only after an analysis run (run it from the Analysis tab / Detectors rail). |
| **Redact** | `RedactPanel.tsx` | 🟢 | Mark-for-redaction list + Mask; **detect→redact-all one-flow** for repeated regions (headers/footers); writes `pdf_redaction_audits`. Reversible-key escrow is data-model-only (KMS pending — by design). |
| **Search** | `SearchPanel.tsx` | 🟢 | In-document text search with page jump. |

---

## The three bugs you reported

| Bug | Status | What was done |
|---|---|---|
| **1. Loading state = tiny box in white space** | ✅ FIXED | New `PdfLoadingState` fills the whole preview area: page skeleton with shimmer, filename, a real progress bar (determinate when byte counts known), and a PDF mark. Mounted in the renderer's load branch **and** pdfjs's in-document placeholder, so it shows on both first paint and page turns. Enterprise-clean, semantic tokens, Lucide only. |
| **2. File dropdown missing extraction + other UIs** | ✅ FIXED | `FileContextMenu` and `RowContextMenu` now render the **canonical surface registry** for PDFs — File viewer, Analysis Studio, PDF Extractor all appear, alongside the RAG actions. One registry drives the dropdowns, the "Open in" switcher, and the menus identically. |
| **3. First load 4–5 min, then fast** | 🟡 DIAGNOSED — operational, not a code defect | **Verified:** the Preview path streams (S3 `get_object(Range=…)` → `iter_chunks`, true partial content) and does **not** trigger analysis (only the Edit tab warms analysis, and tabs render lazily). So "slow once, fast after" is **cold backend** (container/lifespan warmup + cold S3/CDN), not a streaming break. **Mitigation for the demo: pre-warm** (open the app + one PDF a few minutes before; or hit `GET {backend}/health` on a timer). A risky backend streaming change the night before the demo was deliberately NOT made. |

---

## Honest gaps (so nothing surprises you on stage)

- **NER entity display in Analysis** 🔴→🟡 — NER is now *triggerable/refreshable* from Analysis (`FileKnowledgePanel`), and status (indexed / chunk count) shows. But the **extracted entities are not yet listed inline** — there is no FE component or read-API for `kg_entities` per document yet (matches the Knowledge-system gap analysis: the entity-read surface is unbuilt). Today the panel links to the Knowledge graph. *If entity display on the Analysis tab is demo-critical, flag it and it's the next build.*
- **Large-doc scale (W5)** 🟡 — reader mounts all page blocks (no virtualization yet); render-all/split ZIP in memory server-side; AI clean/extract on >200pp is a held request, not a resumable job. Fine for typical demo docs; can lag on 500+ page files.
- **Reversible-redaction key escrow** 🟡 — table + model exist; the wrap/unwrap write-path is intentionally unwired pending the security team's KMS interface. Redaction itself works; "reversible" recovery across devices is the part that's deferred.

---

## Pre-demo checklist (5 min)

1. **Pre-warm** the backend ~5 min before: load the app, open one PDF Preview, let it finish. (Kills the cold-first-load.)
2. From `/files`, right-click a PDF → confirm **Open in PDF Extractor / Analysis Studio / File viewer** all show.
3. Open a PDF → confirm the **loading state fills the pane** (no tiny box).
4. Open the **bench** `/demos/ssr/pdf-processing/components`, pick your demo file, and click through Preview / Edit (all 6 panels) / Knowledge / Analysis / Share / Info — this is the same code production runs.
5. In **Analysis**, click **Index for knowledge (runs NER)** to confirm the pipeline fires; then open the Knowledge graph link.
