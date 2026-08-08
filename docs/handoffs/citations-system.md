---
status: active
updated: 2026-08-08
repos: [matrx-frontend, aidream]
vision: []
---

# Citations — capture from every provider, enable by default, render properly

## Vision — Arman's words

> "Including citations is actually one of the biggest missing pieces in our system. But I think it needs a focused session where we not only focus on making sure we're getting citation data properly from each provider since they all handle it differently, but we also need to make sure that we are properly setting up our UI so that when we get that information, we actually use it properly because currently we don't. And, also, making sure that the enabling process is properly set. Although the reality is that we wanna make sure that it's the default on all requests. There's no reason to ever not include citations unless something is there that I'm missing."

Ratified additions (Arman, 2026-07-17):
- **Default-on scope:** citations ON for every user-facing request that carries documents; OFF only for machine-consumed runs (structured-output extraction, voice synthesis, internal system runs). Every exclusion explicit and loudly logged — never silent. **No user-facing toggle — default-on IS the vision.**
- **Depth:** BOTH settle-time rendering AND live-stream rendering (typed `citation` stream event), one session.
- (inferred, confirmed by build) Render = inline numbered markers on cited spans + per-message Sources footer + click-through (our PDF opens at the exact page via the canonical `useOpenCitation` opener; web citations open the URL). ONE citation UI — reuse, never fork.

## Canonical citation schema — the cross-repo contract

Normalized per-text-block shape. Storage: top-level `citations` on each text part (`TextPart.citations`); in-memory (aidream): `TextContent.metadata["citations"]`. Source of truth: `aidream/packages/matrx-ai/matrx_ai/config/citations.py` (`NormalizedCitation`), surfaced to the FE via generated `types/python-generated/stream-events.ts` (NEVER hand-edit; regen: `uv run python scripts/generate_types.py stream` from aidream root).

```jsonc
{
  "kind": "document_char|document_page|document_block|search_result|web|grounding",
  "provider": "anthropic|openai|google|xai",
  "cited_text": "…", "title": "…", "url": "…",
  "source_index": 0, "file_id": null, "page": 1, "end_page": null,
  "source_start": 0, "source_end": 0,     // offsets INTO THE SOURCE (Anthropic)
  "answer_start": 0, "answer_end": 0,     // offsets INTO THE ANSWER (OpenAI/Gemini)
  "raw": {}                                // original provider payload (optional)
}
```

Normalization MUST be idempotent — `is_normalized_citation` keys on `kind`+`provider` only (`raw` is optional; requiring it caused silent per-round-trip data decay, fixed in `e355e97a9` with parity guard `packages/matrx-ai/tests/test_content_deserializer_parity.py`).

## Done (all pushed to origin/main in both repos)

- **Trigger pinned:** the 2026-07-16 "mystery citations" were Sonnet 5 + Anthropic server `web_search` tool activating citation machinery; empty arrays because `document_search` tool results are not citable sources. Evidence in `chat.request_snapshot d39c97d4`.
- **aidream capture matrix** — all four providers normalize into the canonical shape at ingestion (Anthropic per-block, OpenAI Responses annotations incl. `from_openai_modified`, Google grounding both sync+stream paths, xAI response-level). Commits `70d08acf3` (swept into a wave-a commit), `58ae6c1d7`, `e355e97a9`. Tests: `packages/matrx-ai/tests/test_citations_normalization.py` (22), `test_content_deserializer_parity.py`, `packages/matrx-connect/tests/test_citation_event.py` (5).
- **Enable-by-default** — `DocumentContent.to_anthropic` stamps `citations:{enabled:true}` + `title` (filename) + `context` on all three doc shapes (`config/media_config.py` `_anthropic_citation_fields`); machine-run gate in `providers/anthropic/translator.py` strips citability loudly when `response_format` is set or `config.metadata["citations_enabled"]=False` (force-on override supported). Tool-result docs inherit via the same path with real titles (`tools/models.py`).
- **`citation` stream event** — `EventType.CITATION` + `CitationPayload{block_index, citation}` in matrx-connect `context/events.py`, implemented on every emitter; emitted live by Anthropic (`citations_delta`) and OpenAI (`annotation.added`), at settle by Google. All three emission sites guarded: a malformed citation logs red and is skipped — it can never abort the answer stream (`58ae6c1d7`).
- **FE, settle + live** (matrx-frontend `b0f103e28`) — ONE citation core `features/agents/redux/execution-system/messages/message-citations.ts` (boundary parse, dedupe/numbering, `insertCitationMarkers`); inline `<matrxcite>` superscript chips via `remarkMatrxCite` + `CitationMarkerInline` (popover: quote/title/open); `MessageSourcesRow` footer; click-through reuses `features/rag/components/source-inspector/useOpenCitation` (PDF at exact page). Live path: `process-stream.ts` → `liveCitations` on active-request slice → markers during streaming. Markers are render-only — stripped/never present at every persistence chokepoint; inline-edit merge carries `citations` forward (`features/cx-chat/utils/buildContentBlocksForSave.ts`). 26+ FE tests.
- **FE UI hardening (2026-08-08, on main):** ONE shared chip primitive `CitationChip` + `CitationPopoverBody` (`components/official/citation-chip/CitationChip.tsx`) consumed by chat `MessageSourcesRow`, education `SourceCitations`, and `CitationMarkerInline`'s popover — the two-chip-UI fork is closed. `search_result` render path unit-verified (dedupe by kind+file_id+page, Source-Inspector-at-page click-through via the new pure `citation-open-request.ts`); `citationSourceDisplayKind` makes search_result always read as a document. `insertCitationMarkers` hardened: `computeCodeRegions` snaps `answer_end` offsets out of code fences / inline code spans; surrogate-pair + CJK/emoji + overlapping-citation tests added.
- **Reach layer (2026-08-08, aidream main, THE GAP closed in code):** `SearchResultContent` platform primitive — any tool's passages become Anthropic `search_result` blocks with citations enabled; `document_search` AND `knowledge_search` emit them via `ToolResult.provider_content` (stored JSON unchanged). **matrx:// identity sources** (`matrx://file/<id>?page=N&doc=<pd_id>`) are echoed verbatim by Anthropic into `search_result_location` citations and decoded at normalization into `file_id`+`page` — click-through round-trips with zero request bookkeeping (live-verified). `document_index`→`file_id` settle-time enrichment for attached docs at `unified_client._stamp_offering_usage`. Anthropic tool_result homogeneity fix (mixing search_result with text 400s — wrapped at the ONE serialization choke point, `config/tools_config.py`; live-verified defect). Commits `1d8b0077a`, `05ada9dc1`, `1b627804f`.
- **Provider completeness (2026-08-08):** shared settle emitter `providers/citation_emit.py` (xAI both paths + Google delegate); Groq (`document_citation`/`function_citation` annotations) + generic_openai/Perplexity-dialect capture via `normalize_openai_compatible_citations`; Cerebras/Together documented as having nothing citation-like. Machine-run exclusions implemented at THREE seams: `NamedAgent.citations_enabled` classvar, `executor.run_agent(system_run=True)` setdefault-False, podcast agents' shared base — explicit force-enable always wins, gate announces loudly. Commits `edc44c79c`, `fde4ecd6a`, `7d651f6c3`.
- **Verified for real:** two e2e probes through the actual matrx-ai stack against live Anthropic + Google APIs (wire capture; live events; storage round-trip; loud machine-gate strip; search_result citations carrying file_id+page). Settle-time UI browser-verified on seeded conversation `c17a7100-0000-4000-8000-c17a71000001` (still in the DB — reuse it). Adversarial Sonnet reviews each milestone; findings fixed same-session.
- **Adversarial round 2026-08-08, all findings fixed same-day:** citable passages get a hard size budget (`MAX_CITABLE_TEXT_CHARS` at both live builders via `cap_citable_blocks` + a red-alarm absolute-ceiling backstop measuring typed blocks — they previously bypassed BOTH size gates); DB-rebuilt conversations regain citability (`ToolResultContent.to_anthropic` rebuilds `search_result` wire blocks from stored citable-tool JSON — multi-turn follow-ups were silently un-cited); matrx:// ids percent-encoded; loud ghost-guard if a provider ever cites the non-citable "Search metadata" wrapper (note: the FE has no filter for that sentinel — non-citability is enforced backend-side at the wire); FE fence detection now handles blockquoted/indented fences and the region scan is memoized + O(n log k).

## Gap analysis — vision vs. today

| Pillar | Status | Gaps |
|---|---|---|
| Per-provider capture | DONE (live-verified: Anthropic, Google) | Groq/generic-openai(Perplexity)/xAI capture is SDK/fixture-proven, never run against those live endpoints. |
| Enable-by-default | DONE | Exclusions implemented + loud; force-enable override tested. |
| Render properly | DONE (settle, browser-verified) | Live-stream chips still never rendered against a REAL streamed citation in the browser (event pipeline unit-tested; needs the prod pass below). Inline chip tap size awaits Arman's ruling. |
| Reach (tool results cite) | **DONE in code — awaiting prod proof** | Deployed prod must show a `document_search`/`knowledge_search` quote producing chips with file/page click-through (verification recipe below). |
| Reach (the real vision) | **THE GAP** | The #1 real-world citing scenario — model quoting `document_search`/RAG tool results — still yields EMPTY citations: tool results are not sent as citable `search_result` blocks. Anthropic `document_index` → our `file_id` is unmapped (`citations.py` `normalize_anthropic_citation` hardcodes `file_id=None`), so document click-through-to-PDF-page cannot work for attached files. (The parallel `rag.citation` channel was deleted 2026-08-08 — see Decisions ruled.) |

## Remaining work (ordered; each item independently actionable)

1. **Prove the Reach layer in prod.** After the 2026-08-08 aidream release lands (confirm `1b627804f` is an ancestor of the SHA at `/health/version`): in `/chat`, attach a PDF (or rely on auto-attached docs) and ask a question the document answers — the model's `document_search`/`knowledge_search` quotes must produce inline chips + Sources footer, and clicking a document source must open the Source Inspector at the page. Watch DURING streaming too (chips mid-stream, no double markers after settle, no `<matrxcite` in the DB row). Then SQL (Supabase MCP, project `txzxabzwovsujtloxrus`): `select count(*) from chat.message where created_at > now() - interval '1 day' and content::text like '%"kind": "search_result"%'` — non-zero = Reach live.
2. **Live-endpoint verification for the fixture-proven providers** (cheap probes from aidream root, pattern in Resources): Groq annotations, a Perplexity-style OpenAI-compatible endpoint, xAI. Fix dialect drift in `normalize_openai_compatible_citations` if found.

## Resources

- **aidream:** `packages/matrx-ai/matrx_ai/config/citations.py` (schema + normalizers + gate helpers — read its docstrings first), `config/media_config.py` (~1554 `_anthropic_citation_fields`), `providers/anthropic/translator.py` (machine gate) + `anthropic_api.py` (`citations_delta`), `config/FEATURE.md` (deserializer/citation invariants), fixtures `packages/matrx-ai/tests/fixtures/citations/` (real captured wire shapes, all providers).
- **matrx-frontend:** `features/agents/redux/execution-system/messages/message-citations.ts` (the ONE core — extend, never fork), `components/mardown-display/chat-markdown/citations/`, `features/agents/components/messages-display/citations/MessageSourcesRow.tsx`, `thunks/process-stream.ts` (`isCitationEvent`), chat FEATURE: `features/agents/components/chat/FEATURE.md`.
- **Test assets:** seeded conversation `c17a7100-0000-4000-8000-c17a71000001` (settle-time UI, real citation payloads, owned by `admin@admin.com`). Login: `/login` `admin@admin.com` / `Password1234#`.
- **Commands:** aidream `uv run pytest packages/matrx-ai/tests/test_citations_normalization.py packages/matrx-connect/tests/test_citation_event.py packages/matrx-ai/tests/test_content_deserializer_parity.py`; FE `pnpm type-check` + jest on `message-citations`/`extract-flat-text`/`remarkMatrxCite`/`citation-live-stream` suites. Direct-API probes: `uv run python` from aidream root with `.env` sourced.
- **Traps:** markers (`<matrxcite>`) are RENDER-ONLY — any path that persists, copies, TTS-reads, or resends text must use the plain flatten (default). `extractFlatText` has a `withCitationMarkers` option; only the render path passes it. Never hand-edit `types/python-generated/stream-events.ts`. aidream citation history is interleaved with unrelated "wave-a" commits — trust file contents, not commit messages. Dev-server text vanishing after HMR = known Turbopack corruption; restart the dev server, a reload won't fix it.

## Decisions ruled

- **`rag.citation` → DELETED (2026-08-08).** Ruling executed per the recommendation on record: one citation UI is the doctrine, and provider-native citations (search_result blocks from document_search/knowledge_search) now cover RAG content — so the parallel channel was deleted, not folded. Investigation confirmed ZERO live consumers of either variant: the FE `ragSearch()` `onCitation` callback had no callers (only the terminal `rag.search.result` is read; `rag.citation.summary` was read by nobody), and the cross-doc `tag` variant streamed to `/rag/cross-doc/stream`, an endpoint no FE code calls (that flow moved to the `knowledge_compare` agent shortcut, which cites through the unified channel). Removed: both `RagCitation` models + `RagCitationSummary` and their emitters (`matrx_rag/rag_events.py`, `matrx_rag/search.py` incl. its now-dead `emitter` param, `aidream/services/rag/rag_events.py`, `library_streams.py`), the schema-snapshot entries + citation-shape test, FE `RagSearchCitationEvent`/`onCitation` (`features/rag/api/search.ts`), and the event-vocabulary docs (`FE_STREAMING_MIGRATIONS.md` §3/§5b, `01_RAG_REALITY.md`). No DB artifacts existed (pure stream events). `features/research` had no consumers. Generated `api-types.ts`/`openapi.json` docstring mentions refresh on the next sync-types after aidream deploys. Follow-up executed 2026-08-08: `/rag/cross-doc/stream` was deleted end-to-end (endpoint + `CrossDocRequest` + the `rag.cross_doc.*` event models + generated-type/doc mentions); the `rag.search_cross_doc` graph action was kept (workflow-node surface, zero saved workflows use it — flagged for Arman).

## Decisions needed (Arman)
- **Inline chip tap size.** Inline superscript chips are ~18px (mobile guidance says ≥44px); enlarging breaks line flow. Decide: accept as-is (popover targets are large), or add a mobile-only affordance (e.g. long-press zone / footer-only on mobile).
