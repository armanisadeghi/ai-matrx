---
status: active
updated: 2026-07-28
repos: [aidream, matrx-frontend]
vision: []
---

# aidream API-contract hardening (backend half)

Most remaining work is in **aidream**; the doc lives here because the frontend campaign that found it does.

## Vision

No Arman quotes on record. **(inferred)** The frontend is bound to the generated OpenAPI
contract, so any body/response drift is a compile error after `pnpm sync-types`. The backend
half closes the gaps TypeScript cannot see: silently-ignored request keys, untyped streamed
responses, and response models so loose the FE can't bind to them at all.

Origin: a production 400 (`invalid_variant_spec: preset_id Field required`, `/images/convert`) —
the FE hand-mirrored a request type with `key` while the backend model used `preset_id`.

## Resources

- FE contract layer: `lib/api/typed-client.ts`, `lib/api/FEATURE.md`, ratchet
  `scripts/check-api-contracts.ts` + `scripts/api-contracts-baseline.json`.
- Generated schema (FE): `types/python-generated/openapi.json`, `types/python-generated/api-types.ts`.
- Type regen: `pnpm sync-types && pnpm type-check` after every backend model change — drift lights up red.
- aidream generator: `scripts/sync-types.mjs`.
- Asset models: `aidream/packages/matrx-files/matrx_files/asset_envelope.py` (`AssetPreviewRequest`),
  `aidream/api/routers/assets.py` (`AssetPdfCompressRequest`, the `/multipart` siblings).
- File response models: `aidream/api/routers/files/permissions.py` (`PermissionRecord`, `ShareLinkRecord`),
  `aidream/api/routers/files/__init__.py` (`PatchFolderRequest`).

## Remaining work

1. **`/images/generate` and `/images/face-detect` do not exist on the backend — and a live user
   page calls one.** Neither is a route in `aidream/api/routers/image_edit.py` or `image_studio.py`,
   and neither is in the published OpenAPI. The FE calls both from
   `features/image-studio/api/python.ts:380,410`, and `/images/generate` is reachable from the UI
   (`app/(core)/images/generate/GenerateShellClient.tsx`, linked from
   `app/(core)/images/_components/imagesRoutes.ts` and `ImagesLandingHero.tsx`). Either build the
   routes or delete the FE surface — today it is a user-facing 404. **Highest priority; this is a
   live break, not hardening.**
   (`/images/edit-by-prompt` + `/images/suggest-edits` are intentional FE stubs — ignore those.)

2. **`extra='forbid'` on request models.** Add `model_config = ConfigDict(extra='forbid')` to
   Pydantic REQUEST bodies so a renamed/unexpected key is rejected loudly instead of silently
   ignored. Asset-preview models still have none. **Sequencing is critical:** per-endpoint, ONLY
   after auditing that no live FE/extension callsite still sends a now-forbidden field — a
   forbidden extra becomes a runtime 422 TS won't always catch (excess-property checks miss
   spreads and variable-typed bodies). Staging first, watch for 422s, then prod. No big-bang.

3. **Streamed endpoints publish an empty 200 schema — 256 operations of 797** (was 229 at the
   2026-07-12 audit; it is getting worse). Still `unknown`: `POST /rag/search`, `/rag/search/stream`,
   `/rag/ingest`, `/rag/verify`, 10+ `/rag/library/*`, `/ai/agent/{id}`,
   `/ai/agents/{id}`, `/v2/ai/agent*`. Publish a typed terminal/summary payload, or register the
   NDJSON event envelope as a schema. **Do NOT blanket-fix** — target FE-consumed streamed
   responses only; health/warm calls are noise. Until then these calls stay on the raw client.

4. **`PermissionRecord` / `ShareLinkRecord` are unbindable.** Both in
   `aidream/api/routers/files/permissions.py` carry `ConfigDict(extra="allow")` with every field
   `str | None = None` → `required: null` + `additionalProperties: true` in OpenAPI.
   `TrashListResponse` / `StorageUsageResponse` also mark real fields optional. Tighten: required
   where the DB column is NOT NULL, drop `extra`/the index signature. Then
   `features/files/api/versions.ts` can leave the raw `@/lib/python-client`. Watch extension and
   mobile consumers — they read these too. (`FolderRecord` is already clean; the FE just needs a
   `dbRowToCloudFolder` mapper tweak. There is no `share-links.ts` on the FE, and
   `features/files/api/permissions.ts` goes straight to Supabase, not through aidream.)

5. **Prefer typed JSON endpoints over JSON-in-multipart.** Multipart bodies encode JSON fields as
   `string`, erasing the inner type from OpenAPI. Remaining offenders: `assets.py` `metadata_json`
   / `custom_variants_json` / `options_json` (lines ~144-149) and
   `aidream/api/routers/files/__init__.py:726-727`. Where raw bytes aren't required, add a JSON
   sibling (the `/assets/preview` vs `/assets/preview/multipart` pattern already exists). For
   multipart endpoints that must stay, document the inner schema so the FE can type the
   pre-stringify object against `components["schemas"][...]`.

6. **`PATCH /folders` is path-only — product call, not a bug.** `PatchFolderRequest`
   (`files/__init__.py:297`) accepts `folder_path` / `visibility` / `metadata`; the handler derives
   `folder_name` + `parent_id` from the path. The FE already matches (fixed in `74942304f`).
   Decide whether the backend SHOULD accept `folder_name`/`parent_id` as an ergonomic rename/move.

7. **FE ratchet is advisory and currently red.** `check:api-contracts` runs only via
   `scripts/run-release-gates.sh`, invoked `--advisory || true` post-push in `scripts/release.sh` —
   there is no CI workflow and no git hook, so nothing blocks. The baseline holds 17 offenders and
   there is **1 new one**: `features/rag/api/library-ingest.ts` imports the raw
   `@/lib/python-client`. Fix or accept it, and decide whether the gate should block.

8. **(Roadmap)** Runtime response validation on the FE seam (openapi-zod-client or similar) — the
   only thing that catches the server returning a payload that diverges from its own OpenAPI.

## Done

- FE bound to the generated OpenAPI contract — `lib/api/typed-client.ts`, ~25 adopting call sites.
- Defaulted Pydantic fields no longer emitted as REQUIRED — aidream `scripts/sync-types.mjs` passes
  `--default-non-nullable false` (`ee58b0d1a`); 0 new FE type errors on adoption.

## Decisions needed

1. **Images generate/face-detect.** The app has a live "generate an image" page whose backend
   endpoint has never existed. Should the backend route be built, or should the page and its two
   API callers be deleted?

2. **Contract gate enforcement.** The check that stops the frontend from hand-writing API types
   currently runs after a push and can't fail a build. Should it block the release, or stay advisory?
