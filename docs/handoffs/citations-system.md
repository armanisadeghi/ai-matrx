---
status: active
updated: 2026-07-17
repos: [matrx-frontend, aidream]
vision: []
---

# Citations — capture from every provider, enable by default, render properly

## Vision — Arman's words

> "Including citations is actually one of the biggest missing pieces in our system. But I think it needs a focused session where we not only focus on making sure we're getting citation data properly from each provider since they all handle it differently, but we also need to make sure that we are properly setting up our UI so that when we get that information, we actually use it properly because currently we don't. And, also, making sure that the enabling process is properly set. Although the reality is that we wanna make sure that it's the default on all requests. There's no reason to ever not include citations unless something is there that I'm missing."

Ratified 2026-07-17: default-ON for all user-facing surfaces, explicitly + loudly OFF for machine-consumed runs (structured output, voice, internal); both settle-time UI and live streaming built. No user-facing toggle — default-on IS the vision.

## Canonical citation schema (ratified — the FE contract)

`NormalizedCitation`, defined in aidream `packages/matrx-ai/matrx_ai/config/citations.py`, generated into FE `types/python-generated/stream-events.ts` (never hand-edit; regen from aidream ROOT: `uv run python scripts/generate_types.py stream` → writes `aidream/api/generated/stream-events.ts` → copy to FE). Per-text-block, stored top-level on `TextPart.citations`, in-memory `TextContent.metadata["citations"]`:

```jsonc
{
  "kind": "document_char|document_page|document_block|search_result|web|grounding",
  "provider": "anthropic|openai|google|xai",
  "cited_text": "…", "title": "…", "url": "…",
  "source_index": 0, "file_id": null,
  "page": 1, "end_page": null,
  "source_start": 0, "source_end": 0,     // offsets INTO THE SOURCE (Anthropic)
  "answer_start": 0, "answer_end": 0,     // offsets INTO THE ANSWER (OpenAI/Gemini)
  "raw": {}                                // original provider payload, always kept
}
```

Live wire fixtures from all four providers: aidream `packages/matrx-ai/tests/fixtures/citations/`.

## Trigger — PINNED (2026-07-16 mystery, solved 2026-07-17)

The Anthropic server `web_search` tool (`internal_web_search: true`) activates citation machinery — blocks split into citable spans — but `document_search` tool-result text is NOT a citable source, so `citations` stayed `[]`. Evidence: `chat.request_snapshot` `d39c97d4` (no `citations` string in the outbound request; server web_search tool present). Real fix for tool-result citability = emit Anthropic `search_result` blocks from document tools (open item below).

## Resources

- **aidream:** schema+normalizers `config/citations.py`; ingestion `config/unified_content.py` (all `TextContent.from_*`) + `providers/{google,xai}/translator.py`; enable gate `config/media_config.py` `_anthropic_citation_fields` + `providers/anthropic/translator.py` (machine-run strip); stream emit `providers/{anthropic,openai,google}/*_api.py`; event `packages/matrx-connect/matrx_connect/context/events.py` (`EventType.CITATION`, `CitationPayload`); tests `packages/matrx-ai/tests/test_citations_normalization.py`, `packages/matrx-connect/tests/test_citation_event.py`.
- **FE:** ONE citation core `features/agents/redux/execution-system/messages/message-citations.ts` (parse/dedupe/markers — extend this, never fork); persisted path `messages.selectors.ts` (`extractFlatText({withCitationMarkers})`); live path `process-stream.ts` `isCitationEvent` → `active-requests.slice.ts` `liveCitations` → `active-requests.selectors.ts`; render `components/mardown-display/chat-markdown/citations/` (remark plugin + chip + context) + `features/agents/components/messages-display/citations/MessageSourcesRow.tsx`; click-through reuses `features/rag/components/source-inspector/useOpenCitation.ts` (PDF at exact page). Edit-save preservation: `features/cx-chat/utils/buildContentBlocksForSave.ts` + test.
- **Repro:** e2e probe pattern (real APIs through the real matrx-ai stack, wire capture via `outbound_capture.py` with `AppContext.snapshot=True`); dev test conversation with real-shaped citation data: `/chat/c17a7100-0000-4000-8000-c17a71000001` (admin user).
- **Test login:** `/login` `admin@admin.com` / `Password1234#`.

## Remaining work (ranked by user-visible impact)

1. **Deploy + real-stream verification.** aidream citation commits are local-only (not pushed; interleaved with a parallel wave-a session's commits — coordinate the push). Nothing cites in prod until aidream deploys. After deploy: one REAL streamed `/chat` conversation with an attached PDF — confirm live chips mid-stream, settle, reload. (Live path has unit coverage only; settle-time UI was browser-verified against real-shaped seeded data.)
2. **`document_index` → our `file_id`.** `normalize_anthropic_citation` hard-codes `file_id=None` (documented in its docstring) — thread request-time document order to ingestion so document citations click through to the actual attached PDF at page. Highest-value single fix.
3. **Make tool-result documents citable.** `document_search`/RAG tools return plain text snippets; convert to Anthropic `search_result` content blocks (source/title, citations enabled) so the pinned-trigger scenario produces REAL citations.
4. **Machine-run seams.** Only `response_format` gates today; no voice/internal path sets `config.metadata["citations_enabled"]=False` yet (none currently attaches documents). Verify the page-extraction pipeline sets `response_format` (flagged in review); add explicit set-points when other machine paths gain documents.
5. **Provider tail.** xAI emits no live `citation` events (settle-only; also attaches the full citation list to every text block — fine while responses are single-block). generic_openai/Groq/Moonshot/Cerebras/Together have zero citation code (matters if a citation-capable model fronts them, e.g. Perplexity).
6. **Marker robustness follow-ups.** Answer-offset insertion is surrogate-pair-safe but not markdown-structure-aware (an offset landing inside a link/code construct can degrade rendering — Anthropic's block-end mode, the dominant path, is safe). Inline chip tap targets ~18px (<44px mobile guidance — conscious superscript tradeoff; revisit on a mobile pass).
7. **Pre-existing, widened blast radius:** aidream `config/tools_config.py` `_serialize_block_for_anthropic` bare-except silently drops a document block on any serialization error — should scream.

## Done

- Canonical NormalizedCitation schema + per-provider normalization (Anthropic/OpenAI/Google/xAI), lossless parse→storage→reconstruct→resend round-trip, typed `TextPart.citations` — aidream `config/citations.py` + 27 tests.
- Citations default-ON on every Anthropic document shape with title/context; loud machine-run strip — verified on the live wire (outbound capture) via a 6-assertion e2e probe through the real stack, all passed (incl. Gemini grounding).
- `citation` stream event (typed, all emitters), emitted live by Anthropic/OpenAI mid-stream + Google at settle; normalization failure skips that citation loudly, never aborts the answer (adversarial-review fix).
- FE settle-time + live citation UI: inline numbered superscript chips (remark `matrxcite`), quote popovers, deduped Sources footer, click-through via canonical `useOpenCitation`; markers render-only (stripped at every persistence path); inline-edit preserves citations (adversarial-review fix + regression test). Browser-verified.
- Adversarial review (3× Sonnet agents: backend, FE, vision-gap): both "ship-with-fixes" verdicts → every confirmed finding fixed same-session (stream-abort guards, edit-save citation loss, dedupe collision, surrogate-pair safety, rewind loudness); "hand-mirrored generated types" finding disproven (FE file byte-identical to fresh regen).

## Decisions needed

- **Situation:** Agents' own RAG/document-search tools emit a separate, older `rag.citation` stream event (aidream `packages/matrx-rag/matrx_rag/rag_events.py`) that no chat UI consumes; provider-native citations now render through the new chat citation UI. Two citation channels exist side by side. **Decide:** should tool-search citations feed the SAME chat citation UI (one sources footer mixing provider + RAG citations), or stay separate (e.g. rendered only inside tool-call visualizations)? Recommendation: same UI — one citation system; requires mapping `rag.citation` → NormalizedCitation and consuming it in `process-stream.ts`.
