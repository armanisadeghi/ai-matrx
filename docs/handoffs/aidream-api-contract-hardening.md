# Handoff: aidream API-contract hardening (backend half)

**Owner repo:** aidream (backend). **Target:** ~5 business days. **Status:** queued.
**Origin:** the frontend API-contract campaign (matrx-frontend) — 2026-07-12.

## Why

A production 400 shipped (`invalid_variant_spec: preset_id Field required`,
`/images/convert`): the FE hand-mirrored a request type with `key` while the
backend model used `preset_id`. The FE is now bound to the generated OpenAPI
contract (`lib/api/typed-client.ts`, `lib/api/FEATURE.md`, ratchet
`scripts/check-api-contracts.ts`), so JSON body/response drift is a **compile
error** after `pnpm sync-types`.

Two gaps only the backend can close. They are deliberately NOT done on the FE
because their failure mode is a runtime 422 that TypeScript cannot fully catch
ahead of time — doing them blind would risk the exact prod outages we're trying
to prevent.

## The work (do in order, staging-first)

1. **`extra='forbid'` on request models.** Add
   `model_config = ConfigDict(extra='forbid')` to Pydantic REQUEST bodies so a
   renamed/unexpected key is rejected loudly instead of silently ignored.
   - **Sequencing is critical:** per-endpoint, ONLY after auditing that no live
     FE/extension callsite still sends a now-forbidden field. A forbidden extra
     field becomes a runtime 422 that TS won't always flag (object-literal
     excess-property checks catch some cases; spread / variable-typed bodies do
     not). Roll out on **staging first**, watch for 422s, then prod. No big-bang.

2. **Prefer typed JSON endpoints over JSON-in-multipart.** FastAPI multipart
   bodies encode JSON fields as `string` (e.g. `variants_json: str`), erasing the
   inner type from OpenAPI — the FE can't get compile-time safety on that payload.
   Where raw file **bytes** aren't required, expose/prefer a JSON sibling endpoint
   (like `/assets/preview` vs `/assets/preview/multipart`) with a typed body model.
   For multipart endpoints that must stay, document the inner schema so the FE can
   type the pre-stringify object against `components["schemas"][...]`.

3. **Streaming endpoints publish `unknown` responses.** The frontend campaign
   found that most `/rag/*` endpoints (and other post-`stream-everything`
   routes) type their 200 response as `unknown` in the generated OpenAPI — so
   the FE gets ZERO response typing for them, the exact surface most prone to
   drift. Either publish a typed terminal/summary payload for streamed
   responses, or document the NDJSON event envelope as a schema so the FE can
   bind to it. Until then these calls stay on the raw client by necessity.

4. **Defaulted fields are emitted as REQUIRED, blocking typed request bodies.**
   `openapi-typescript` renders a Pydantic field with a default (e.g.
   `multi_query: int = 5`) as a REQUIRED property, not optional. That makes
   routing POSTs through the typed client hostile — callers would have to pass
   every defaulted field. Fix on the FE-tooling side (a `sync-types`
   post-process that marks `default`-bearing fields optional) OR on the backend
   (mark them `Optional` where the FE legitimately omits them). Tracked so the
   POST surfaces can be bound next. This is why the RAG POSTs were left on the
   raw client in wave 1.

5. **(Roadmap, out of scope here)** Runtime response validation on the FE seam
   (openapi-zod-client or similar) — the only thing that catches the server
   returning a payload that diverges from its own published OpenAPI.

## After each backend model change

Regenerate FE types and surface any drift:
`cd matrx-frontend && pnpm sync-types && pnpm type-check`. Every disagreement now
lights up red — that is the point.

## Done when

`extra='forbid'` is live (staging-validated) on the asset-preview models + the
high-traffic REST bodies, JSON siblings exist for the multipart endpoints that
don't need raw bytes, and a `sync-types` + `type-check` on the FE is clean.
