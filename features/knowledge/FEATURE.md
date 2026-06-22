# Knowledge — FEATURE.md

**Status:** Live (informational showcase) · guided walkthrough on roadmap
**Route:** `/knowledge` (`app/(core)/knowledge/page.tsx`)
**Feature home:** `features/knowledge/`

The `/knowledge` page is a beautiful, modern, *informational* (not sales-pitch)
showcase of the Matrx Knowledge System. It exists to honestly document what the
system does end-to-end — "source → knowledge → answer, one continuous system" —
and to be the entry point for the planned guided concept walkthrough.

This is intentionally distinct from `KnowledgeLanding`
(`features/auth/components/module-landing/landings/KnowledgeLanding.tsx`), the
conversion-oriented sales landing shown to guests at `/rag/data-stores`.

---

## Entry points

- `app/(core)/knowledge/page.tsx` — route; `bg-textured` wrapper + header spacer + `<Metadata>`.
- `features/knowledge/components/KnowledgeShowcasePage.tsx` — the page (server component).
- `features/knowledge/components/KnowledgePipelineDiagram.tsx` — `"use client"` interactive,
  theme-aware rebuild of the source SVG (tap a phase to focus it).
- `app/(core)/knowledge/extractions/` — extraction dataset catalog + per-dataset grid
  (see `features/page-extraction/FEATURE.md`); linked from the Knowledge nav menu.

## Source asset

- `docs/knowledge/visuals/matrx_knowledge_system_full.svg` — the original
  hand-authored diagram. Kept as the canonical reference; the page rebuilds it
  in React/HTML for responsiveness + light/dark theming rather than embedding
  the raster-ish SVG. If you change the system's phases, update **both** the SVG
  and `KnowledgePipelineDiagram.tsx`.

## The seven phases (as rendered)

1–2. **Acquire + Convert** — stamp origin lineage · PDF parse · transcribe · OCR · scrape-extract → raw text.
3. **Clean** — Tier A generic clean (OCR/structure/speakers); Tier B known-type agent → org rules → structured JSON.
4. **Enrich + branch** — fact-check · refine · one → many filtered derivatives.
- **Ingestion gate** — sources only; admitted knowledge is retained, versioned, traceable.
5. **Knowledge Hub** — representations (text, chunks, vectors, summaries, schemas, indices, scoped) described by **NER**, **Scopes** (type→scope→item→value), **Trust** (6-dim quality vector), **Lineage** (DAG root↔canonical). Can reprocess/derive → return.
6–7. **Retrieve** — semantic + structural + trust-weighted; drill to provenance.
**The Ask** — an agent resolves a real question end-to-end (the attorney/deposition worked example).

The **Agent Fabric** rail spans every stage: one agent, many shapes — chatbot,
button, form, app, automation, scheduled job, MCP egress.

---

## Truthful built / missing map

The audit below is the source of truth for what the walkthrough can use today.
Keep it honest — do not let the page imply capabilities that do not exist.

| Capability | State | Where |
|---|---|---|
| Upload PDF | Live | `features/files/` → `/files` |
| Upload CSV **as knowledge** | Partial | CSV uploads + previews (`DataPreview.tsx`) and is a first-class data table (`features/data-tables/` → `/tables`), but is **not** wired into the RAG/knowledge ingest path |
| Extraction pipeline (extract→clean→chunk→embed) | Live | `features/rag/` (`api/stages.ts`, `useFileIngest`), `/rag/library`, 4-pane viewer `/rag/viewer/[id]`; also `features/pdf-extractor/` |
| Create custom agent | Live | `features/agents/` → `/agents/new`, `/agents/[id]/build` |
| Run → inspect → edit → re-test | Live | `/agents/[id]/run`, `/agents/[id]/build`, execution-system redux |
| Agent battle (model/cost/quality compare) | Live | `features/agent-comparison/` ("Agent Battle") → `/agents/battle/*`, `/agents/compare`. **Judge/auto-score model = Phase 2, not built** |
| Extraction as **automated on-ingest step / trigger / schedule** | Live | Uploaded files auto-schedule for RAG (≈5 min) via the backend auto-RAG sweep; lifecycle is surfaced by `features/rag/api/rag-jobs.ts` + `useFileRagStatus` + `FileRagStatusChip`. Instant opt-in via the New-menu "Process for RAG immediately" toggle (`options_json.rag.trigger_now`), plus on-demand trigger/refresh per file. (A visual *automation/trigger builder* is still future — the standing on-ingest behavior itself is live.) |
| Chat agent | Live | `features/agents/components/chat/` → `/chat` |
| Save output as Note + edit | Live | `features/notes/` → `/notes`; `features/notes/actions/*` save buttons |
| Trigger RAG | Live | `features/rag/components/ProcessForRagButton.tsx` + per-stage actions |
| Trigger **NER manually** | Live | "Run NER now" in the note toolbar (`features/notes/components/NoteToolbar.tsx` → `ProcessForRagButton sourceKind="note"`); the note's "In knowledge base" indicator reads `processed_documents` directly (`features/notes/hooks/useNoteIngestStatus.ts`). The standing backend batch (`features/kg-suggestions/`, `features/kg-graph/`) still runs too |
| Knowledge graph visualization | Live | `features/kg-graph/` → `/knowledge-graph`, `/scopes/[scopeId]/graph`; admin `features/administration/kg-inspector/` |
| Manual RAG search | Live | `features/rag/components/search/RagSearchExperience.tsx` → `/rag/search` |
| Agent uses RAG → cited answer | Live | Search Lab agent chat + `rag_search` tool renderer (`features/tool-call-visualization/renderers/rag-search/`), `citationHrefFor()` |

**Real gaps to build:** (a) CSV/tabular as a knowledge/RAG ingest source; (b) a
user-facing automation/trigger *builder* UI (the standing auto-RAG-on-upload
behavior is live; a visual rule/trigger editor is not); (c) the battle judge
model for auto-scoring.

**Recently landed (2026-06-12):** auto-RAG-on-upload (scheduled ≈5 min, instant
opt-in toggle, on-demand trigger/refresh) and a manual "Run NER now" control on
notes — gaps (b-auto) and (c-NER) from the original audit.

---

## The vision: guided concept walkthrough (roadmap)

> Captured verbatim-in-intent from the original request so it is not lost.

The next big build is a **guided, on-screen wizard** that walks a first-time
user through the entire system **using the native UI — not a fake demo**. The
wizard navigates the user page to page, tells them what to do, and each step
makes something real happen. The 14 conceptual steps:

1. Upload a PDF **and** a CSV file.
2. Run extraction on them.
3. Go to the agents window and create a custom agent that specializes in getting some specific data out of one of the documents.
4. Run the agent, see results, then modify it to fix potential issues, test again, and finalize.
5. Run an **agent battle** — several models head-to-head: speed + low cost vs. quality but slow/expensive.
6. Add the extraction as an **automated** part of the PDF process.
7. Upload the document again (or a new one) and watch the automation in action.
8. Create a chat agent, ask generic questions, and **save the answer as a Note**.
9. Edit the note to clean it up and improve it.
10. Trigger the **RAG / NER** process.
11. **Visualize the graph.**
12. Do a manual search to confirm you can pull good data.
13. Create a new top-tier ("badass") agent wired to your knowledge base.
14. Ask that agent a hard, industry-knowledge question and watch a top-of-the-line
    (e.g. Opus) agent hit the RAG, reason it out, and respond like a pro — cited
    and traceable.

Steps 6, 7 (on-ingest automation) and the manual NER trigger in step 10 are now
**live** (auto-RAG-on-upload + the notes "Run NER now" control). Everything in
the walkthrough is live today except CSV-as-knowledge (step 1, partial); the
`/knowledge` page links straight to each surface.

### Implementation notes for the wizard (when built)

- Drive it page-to-page over the **real routes** (table above), not mocked screens.
- Likely a thin overlay/coach-mark layer + a progress slice; reuse the overlay
  system (`features/overlays/`) rather than inventing a parallel modal stack.
- Each step = { instruction, target route, completion signal }. Completion should
  read real state (a doc reached `embed`, an agent ran, a note was saved) so the
  wizard can't be faked.

---

## Change log

- **2026-06-21** — Added `/knowledge/extractions` to the Knowledge nav menu (shell `nav-data.ts`).
- **2026-06-06** — Feature created. Built `/knowledge` informational showcase:
  theme-aware interactive pipeline diagram (rebuilt from the source SVG), truthful
  capability grid linking real surfaces, the deposition worked example, and the
  14-step guided-walkthrough preview with honest Live/Partial/Coming tags.
  Documented the full walkthrough vision + built/missing map here.
