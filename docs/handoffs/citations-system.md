---
status: active
updated: 2026-07-17
repos: [matrx-frontend, aidream]
vision: []
---

# Citations — capture from every provider, enable by default, render properly

## Vision — Arman's words

> "Including citations is actually one of the biggest missing pieces in our system. But I think it needs a focused session where we not only focus on making sure we're getting citation data properly from each provider since they all handle it differently, but we also need to make sure that we are properly setting up our UI so that when we get that information, we actually use it properly because currently we don't. And, also, making sure that the enabling process is properly set. Although the reality is that we wanna make sure that it's the default on all requests. There's no reason to ever not include citations unless something is there that I'm missing."

(inferred) Three pillars, equal weight: **capture** (per-provider ingestion into one normalized shape), **enable-by-default** (citations on for every request that can carry them; surface a reason loudly if a path can't), **render** (real citation UI — inline cited spans, source chips, click-through to the document/page — not just "don't break the text").

## Context — what's true today (verified 2026-07-16)

- Anthropic returns cited answers as MANY `text` blocks split mid-sentence, each with a `citations` array. We store blocks verbatim in `cx_message.content` (`chat.message`); persistence is faithful.
- **Nothing in either repo enables citations today.** Exhaustive grep of aidream + matrx-frontend found zero `citations: {enabled: true}` — yet two conversations on 2026-07-16 (first ever) came back citation-split (e.g. conversation `883f68c6-55b2-485d-9ae6-124716a495a6`, message `b4bea16c-4f7d-468c-b658-77b20bba631a`). Empirical API tests show documents do NOT auto-cite (tested haiku-4.5 + sonnet-5: text doc, base64 PDF, doc-in-tool_result — all no citations without explicit enable). **Unresolved: what triggered it.** First job of the session: reproduce and pin the trigger (suspect: a Sonnet-5/API-side behavior change for document-grounded turns, or an enabler outside code).
- Zero stored messages have non-empty citations (30-day scan). `"citations": []` in stored blocks is a `TextPart` schema default, not evidence data existed.
- The full Anthropic ingest path is already lossless when citations DO arrive — verified live: SDK stream accumulation → `TextContent.from_anthropic` → `metadata["citations"]` → `to_storage_dict` top-level `citations` → `validate_message_content` → DB.

## Resources

- **aidream — provider layer:** `packages/matrx-ai/matrx_ai/providers/anthropic/anthropic_api.py` (`_handle_event`, `citations_delta` branch documented), `providers/anthropic/translator.py`, `config/unified_content.py` (`TextContent.from_anthropic` / `to_storage_dict` / `reconstruct_content` — the canonical citations home is `metadata["citations"]`), `config/message_config.py` (`parse_content` — now round-trips top-level citations; fixed 2026-07-16), `db/message_parts.py` (`TextPart.citations`).
- **aidream — where document blocks are built** (the places an `citations: {enabled: true}` default belongs): `config/media_config.py` `DocumentContent.to_anthropic` (~line 1550), tool-result documents `tools/models.py` `_build_document_ref_blocks`, boundary resolver `providers/unified_client.py` (`_annotate_and_resolve_image_refs`, document handling).
- **aidream — xai already normalizes** provider citations to `metadata["citations"]`: `providers/xai/translator.py:372` — use as the pattern for OpenAI (Responses API annotations/url_citation), Google (grounding metadata), web_search server tools.
- **FE — render path:** `features/agents/redux/execution-system/messages/messages.selectors.ts` `extractFlatText` (concatenates consecutive text blocks directly; regression test `messages/__tests__/extract-flat-text.test.ts`), display component `features/agents/components/messages-display/assistant/AgentAssistantMessage.tsx`, markdown pipeline `components/mardown-display/chat-markdown/EnhancedChatMarkdown.tsx`. Chat FEATURE: `features/agents/components/chat/FEATURE.md`.
- **FE — types:** `types/python-generated/stream-events.ts` (`MessagePart`) — regenerate from aidream (`uv run python scripts/generate_types.py stream` in `packages/matrx-ai`), never hand-edit.
- **Test login:** `http://localhost:<port>/api/dev-login?token=<DEV_LOGIN_TOKEN>&next=/chat` or `/login` `admin@admin.com` / `Password1234#`. Live repro asset: attach a PDF in `/chat` and ask a question that quotes it.
- **Repro scripts pattern:** direct-API probes from 2026-07-16 session used `uv run python` in aidream root with `.env` sourced — cheap way to test per-provider citation shapes before wiring.

## Remaining work

1. **Pin the trigger.** Reproduce the 2026-07-16 multi-block responses (attached-PDF chat, Sonnet 5) and determine what enabled the splitting. Capture the outbound wire request (`AppContext.snapshot` → `providers/outbound_capture.py`) to see exactly what Anthropic received. Until this is known, "default-on" work is guessing.
2. **Enable citations by default on every Anthropic document surface:** user-attached documents (`DocumentContent.to_anthropic`), documents inside tool results (`_build_document_ref_blocks` output path), text-source documents. Default ON per Arman; if a request shape cannot carry citations, that's fine — but never silently strip a document's citability. Add `title`/`context` where we have them (filename, page map) so citations are meaningful.
3. **Per-provider capture matrix.** For each live provider (Anthropic, OpenAI Responses, Google/Gemini grounding, xAI, web-search server tools): what citation/annotation data exists, where it arrives (stream event + final message), and normalize ALL of it into one canonical shape in `metadata["citations"]` (with a `provider` discriminator or a normalized cross-provider schema — design this deliberately; it becomes the FE contract via `TextPart`). Extend `TextPart`/generated types accordingly and regenerate both type sets.
4. **Stream citations to the FE live.** `_handle_event` currently no-ops `citations_delta`; decide the stream event shape (likely a per-block metadata event or fold into the block system) so the FE can show cited spans during the stream, not only after settle.
5. **Citation UI.** Currently none. Build: inline rendering of cited spans (subtle highlight/superscript marker on the cited text), a per-message sources list (document title + page), click-through to the source (attached document → open viewer at page via the PDF domain `features/pdf/`; web citation → external link). Respect existing patterns: RAG already renders citation chips (`features/research/components/sources/`, rag events) — reuse, don't fork a second citation UI.
6. **Round-trip guard tests.** aidream: a test asserting a citation-bearing block survives parse → storage → reconstruct → provider resend. FE: extend `extract-flat-text.test.ts` when citation spans get their own renderer.

## Done

- FE renders provider multi-text-block messages as one continuous string — `messages.selectors.ts` + regression test (2026-07-16).
- aidream `parse_content` round-trips top-level `citations` into metadata; `citations_delta` branch documented — commit `377e274b2`.
- Anthropic ingest path (stream → final message → storage dict) verified lossless against the live API.

## Decisions needed

- **Situation:** Citations add response latency/size and split text into many blocks; some surfaces (voice, structured-output extraction, internal system runs) consume answers as plain text and gain nothing. **Decide:** truly ALL requests default-on, or default-on for user-facing chat/document surfaces and off for system/extraction runs? (Arman's stated default: all, unless something's missing — the session should confirm no such blocker exists and note any found.)
