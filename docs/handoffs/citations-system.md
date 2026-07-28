---
status: active
updated: 2026-07-28
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
- **Verified for real:** e2e probe through the actual matrx-ai stack against live Anthropic + Google APIs (wire capture shows `citations:{enabled:true}`+title; live events; typed storage round-trip; loud machine-gate strip). Settle-time UI browser-verified on seeded conversation `c17a7100-0000-4000-8000-c17a71000001` (real probe-derived data; still in the DB — reuse it). Adversarial Sonnet review findings fixed same-session.

## Gap analysis — vision vs. today

| Pillar | Status | Gaps |
|---|---|---|
| Per-provider capture | PARTIAL | xAI emits no live event (settle-only, by provider design — document or accept); OpenAI-compatible providers (Groq, Moonshot, Cerebras, Together, `generic_openai/`) have ZERO citation code; OpenAI + xAI normalization proven on fixtures only, never against their live APIs. |
| Enable-by-default | PARTIAL | Only the `response_format` gate actually fires today; NO code path sets `citations_enabled=False` for voice/internal runs (harmless now — those paths attach no documents — but the ratified exclusions are unimplemented). |
| Render properly | MOSTLY DONE | Live-stream chips have NEVER rendered against a real streamed citation end-to-end (unit-tested only). Chat `MessageSourcesRow` and education `SourceCitations` are two chip UIs with no shared primitive. Inline chips ~18px (<44px mobile guidance) — conscious tradeoff, unratified. `answer_end` insertion has no markdown-token/surrogate-pair awareness tests for exotic content. |
| Reach (the real vision) | **THE GAP** | The #1 real-world citing scenario — model quoting `document_search`/RAG tool results — still yields EMPTY citations: tool results are not sent as citable `search_result` blocks. Anthropic `document_index` → our `file_id` is unmapped (`citations.py` `normalize_anthropic_citation` hardcodes `file_id=None`), so document click-through-to-PDF-page cannot work for attached files. `rag.citation` events (matrx-rag) have zero FE consumers — a parallel citation channel feeding nothing. |

## Remaining work (ordered; each item independently actionable)

1. **Prove it in prod (30 min, do FIRST).** Backend is confirmed live — `58ae6c1d7` and `e355e97a9` are both ancestors of the SHA prod reports at `/health/version`, so a missing chip is NOT a deploy gap. In prod `/chat`: attach a small PDF, ask a question that quotes it. Expect: multi-block answer, inline numbered chips, Sources footer. Then SQL (Supabase MCP, project `txzxabzwovsujtloxrus`): `select id from chat.message where created_at > now() - interval '1 day' and content::text like '%"kind": "document_char"%'` — non-empty = capture live.
2. **Live-stream visual pass.** Same repro, watch DURING streaming: chips + Sources must appear mid-stream, no double markers after settle, no marker text in the DB row afterward.
3. **Citable tool results** (closes the pinned-trigger scenario — highest user value). Convert `document_search` / RAG tool output into Anthropic `search_result` content blocks (`{type:"search_result", source, title, content:[{type:"text",…}], citations:{enabled:true}}`) instead of JSON text. Start: `aidream/tools/document_search_tool.py` + `tools/models.py` serialization; wire fixture: `packages/matrx-ai/tests/fixtures/citations/anthropic_search_result.json`.
4. **`document_index` → `file_id` mapping** (unlocks PDF click-through for attached files). `normalize_anthropic_citation` (`config/citations.py`) can't see the request; thread the request's ordered document list (file_id per index) into `TextContent.from_anthropic` / the response translator, or post-process citations where request+response meet (`providers/unified_client.py`). FE already routes `file_id`+`page` → Source Inspector at page — backend-only work.
5. **xAI live emission + OpenAI-compatible providers.** Mirror Google's `_emit_citations_from_response` in `xai_api.py`; extend annotation normalization to `generic_openai` (Groq/Moonshot/Cerebras/Together) or document per-provider why not.
6. **Implement the ratified machine-run exclusions.** Grep aidream for voice/TTS-prep and internal-pipeline LLM entry points; set `config.metadata["citations_enabled"]=False` (loud) there instead of relying only on `response_format`.
7. **UI hardening (small, FE):** shared chip primitive with `features/education/trust/components/SourceCitations.tsx`; tests for `answer_end` mid-markdown-token + surrogate pairs; mobile tap-target decision.

## Resources

- **aidream:** `packages/matrx-ai/matrx_ai/config/citations.py` (schema + normalizers + gate helpers — read its docstrings first), `config/media_config.py` (~1554 `_anthropic_citation_fields`), `providers/anthropic/translator.py` (machine gate) + `anthropic_api.py` (`citations_delta`), `config/FEATURE.md` (deserializer/citation invariants), fixtures `packages/matrx-ai/tests/fixtures/citations/` (real captured wire shapes, all providers).
- **matrx-frontend:** `features/agents/redux/execution-system/messages/message-citations.ts` (the ONE core — extend, never fork), `components/mardown-display/chat-markdown/citations/`, `features/agents/components/messages-display/citations/MessageSourcesRow.tsx`, `thunks/process-stream.ts` (`isCitationEvent`), chat FEATURE: `features/agents/components/chat/FEATURE.md`.
- **Test assets:** seeded conversation `c17a7100-0000-4000-8000-c17a71000001` (settle-time UI, real citation payloads, owned by `admin@admin.com`). Login: `/login` `admin@admin.com` / `Password1234#`.
- **Commands:** aidream `uv run pytest packages/matrx-ai/tests/test_citations_normalization.py packages/matrx-connect/tests/test_citation_event.py packages/matrx-ai/tests/test_content_deserializer_parity.py`; FE `pnpm type-check` + jest on `message-citations`/`extract-flat-text`/`remarkMatrxCite`/`citation-live-stream` suites. Direct-API probes: `uv run python` from aidream root with `.env` sourced.
- **Traps:** markers (`<matrxcite>`) are RENDER-ONLY — any path that persists, copies, TTS-reads, or resends text must use the plain flatten (default). `extractFlatText` has a `withCitationMarkers` option; only the render path passes it. Never hand-edit `types/python-generated/stream-events.ts`. aidream citation history is interleaved with unrelated "wave-a" commits — trust file contents, not commit messages. Dev-server text vanishing after HMR = known Turbopack corruption; restart the dev server, a reload won't fix it.

## Decisions needed (Arman)

- **`rag.citation` unification.** Situation: matrx-rag emits its own `rag.citation` stream events (per library/case hit) that nothing in chat consumes; provider-native citations now flow through the new normalized channel. Decide: fold RAG-tool citations into the same `citation` event + chat UI (one system), or keep RAG citations a separate research-surface-only concept. (Recommendation: fold in — one citation UI is the doctrine, and item 3 above naturally produces provider-native citations for RAG content anyway, which may make `rag.citation` deletable.)
- **Inline chip tap size.** Inline superscript chips are ~18px (mobile guidance says ≥44px); enlarging breaks line flow. Decide: accept as-is (popover targets are large), or add a mobile-only affordance (e.g. long-press zone / footer-only on mobile).
