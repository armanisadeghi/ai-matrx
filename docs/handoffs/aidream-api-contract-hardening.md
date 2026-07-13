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

4. **✅ DONE (2026-07-12) — Defaulted fields were emitted as REQUIRED.**
   `openapi-typescript` promoted any `default`-bearing Pydantic field to
   REQUIRED, blocking typed POST bodies. Fixed at the generator: aidream
   `scripts/sync-types.mjs` now passes `--default-non-nullable false`
   (commit `ee58b0d1a`), making the TS faithful to the OpenAPI `required`
   arrays. Verified **0 new type errors** across matrx-frontend on adoption.
   RAG/service POSTs are now bindable.

5. **Untyped / missing endpoints the FE calls (audit 2026-07-12).**
   - **MISSING from OpenAPI entirely:** `/images/generate`, `/images/face-detect`
     (the FE calls both; not in `paths`). `/images/edit-by-prompt` +
     `/images/suggest-edits` are also missing but are intentional FE stubs for
     unbuilt Wave-2 features — ignore those two. Confirm whether generate /
     face-detect are live routes excluded from the schema (`include_in_schema`?)
     and register them, or delete the dead FE callers.
   - **229 endpoints publish an empty/`unknown` 200 schema** — mostly streaming
     (`/ai/agent/*`, `/rag/search`), health, and warm calls. The streaming AI/RAG
     ones are the ones worth a typed terminal payload (see item 3); the rest are
     noise. Do NOT blanket-fix; target the FE-consumed streamed responses.

6. **Some `*Record` response schemas are under-specified vs the real DB rows.**
   Verified shapes (2026-07-12): `FolderRecord` is actually CLEAN (required
   `id`/`owner_id`/`folder_path`/`folder_name`, no `additionalProperties`) — the
   FE just types folder responses as the Supabase `CloudFolderRow` via
   `dbRowToCloudFolder`; bindable FE-side with a small mapper tweak. The genuinely
   loose ones are **`PermissionRecord` and `ShareLinkRecord`**: `required: null`
   (ALL fields optional) + `additionalProperties: true` (index signature) — almost
   certainly `model_config = ConfigDict(extra='allow')` or an untyped dict build.
   `TrashListResponse` / `StorageUsageResponse` also mark real fields optional.
   The FE therefore types these as concrete DB-Rows and can't bind without
   WEAKENING the types + breaking redux-thunk consumers, so `permissions.ts` /
   `share-links.ts` / `versions.ts` list/create responses stay raw. Tighten those
   Pydantic response models (required where the DB is NOT NULL, drop `extra`/the
   index signature) and the FE bindings unblock. Decide per model which columns
   are guaranteed; watch extension/mobile consumers (they read these too).

7. **`PATCH /folders` ignores `folder_name`/`parent_id` (already worked around FE-side).**
   The FE was sending those (rename/move) and the model silently dropped them
   (fixed FE-side in `74942304f` by sending `folder_path`). CONSIDER whether the
   backend SHOULD accept `folder_name`/`parent_id` as an ergonomic rename/move
   API instead of path-only — product call. Until then the path-only contract is
   the source of truth and the FE matches it.

8. **(Roadmap, out of scope here)** Runtime response validation on the FE seam
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
