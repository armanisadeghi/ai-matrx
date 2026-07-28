# TASK: route file traffic to the matrx-files microservice

**Status:** server routing is implemented. Direct authenticated browser routing is implemented
behind `NEXT_PUBLIC_FILES_BROWSER_CUTOVER=false` and is **unblocked** — the July 405 on the
`/files/upload` CORS preflight is fixed. Re-verified live 2026-07-28: `OPTIONS /files/upload` with
`Origin: https://aimatrx.com` returns **200** allowing `authorization` and `x-idempotency-key`.
All that remains is setting the flag to `true` in Vercel and watching the shadow log.

`lib/python-client.ts` owns the browser split at the final shared URL-construction boundary, but it
only activates when `NEXT_PUBLIC_FILES_BROWSER_CUTOVER=true`. `server-client.ts` handles server-side
calls and the service worker recognizes both origins. The route matcher is deliberately exact:
aidream-only `/files/{id}/ingest`, RAG, annotation, and media routes remain on the general backend
until parity lands.

## The change (surgical, no rewrite)

1. **`features/files/api/server-client.ts::resolveBaseUrl`** — add a files-specific base URL that
   takes precedence, falling back to the current backend URL so NOTHING changes until you set it:
   ```ts
   const configured =
     ctx.baseUrl ??
     (process.env.NEXT_PUBLIC_FILES_URL as string | undefined) ?? // NEW — files service
     (BACKEND_URLS.production as string | undefined) ??
     (process.env.NEXT_PUBLIC_BACKEND_URL_PROD as string | undefined) ??
     (process.env.NEXT_PUBLIC_BACKEND_URL as string | undefined);
   ```
2. **`features/files/cache/service-worker/src/sw.ts`** — same: it proxies
   `/files/{id}/download` + `/share/{token}/download`; give it `NEXT_PUBLIC_FILES_URL` with the same
   fallback.
3. **Do NOT** touch `NEXT_PUBLIC_BACKEND_URL` — that's the whole aidream backend (chat/agents/etc.).
   Only the file client moves.

## Cut over + verify

- Set `NEXT_PUBLIC_FILES_URL=https://files.matrxserver.com` in Vercel.
- Verify authenticated `OPTIONS /files/upload` returns 2xx with the deployed frontend origin,
  `Authorization`, `X-Request-Id`, and `X-Idempotency-Key` allowed. A 405 blocks cutover.
- Only after that check passes, set `NEXT_PUBLIC_FILES_BROWSER_CUTOVER=true` and redeploy.
- Verify on the aidream dashboard `/logs` → feature `file-cutover-shadow`: your origin's **`ready`
  tier must go silent**. That's the proof the FE is fully cut over. `needs_parity` routes (image
  studio, pdf, media) stay on the backend until the service grows those routers — they're expected
  to still appear.

Contract + full picture: `aidream/docs/handoffs/matrx-files-cutover.md` and
`/Users/armanisadeghi/code/common-docs/systems/matrx-files-service/FEATURE.md`.
