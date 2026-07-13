# TASK: route file traffic to the matrx-files microservice

**Status:** service is LIVE at `https://files.matrxserver.com` (us-east-1, identical wire contract).
**Blocking:** the server must first add `/files/{id}/share-links` to the service (aidream task —
see `aidream/docs/handoffs/matrx-files-cutover.md`). Everything else `server-client.ts` calls is
already served. Do the FE change now (safe, env-gated); flip the env once share-links lands.

## The change (surgical, no rewrite)

1. **`features/files/api/server-client.ts::resolveBaseUrl`** — add a files-specific base URL that
   takes precedence, falling back to the current backend URL so NOTHING changes until you set it:
   ```ts
   const configured =
     ctx.baseUrl ??
     (process.env.NEXT_PUBLIC_FILES_URL as string | undefined) ??   // NEW — files service
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

- Set `NEXT_PUBLIC_FILES_URL=https://files.matrxserver.com` in Vercel (after aidream ships share-links).
- Verify on the aidream dashboard `/logs` → feature `file-cutover-shadow`: your origin's **`ready`
  tier must go silent**. That's the proof the FE is fully cut over. `needs_parity` routes (image
  studio, pdf, media) stay on the backend until the service grows those routers — they're expected
  to still appear.

Contract + full picture: `aidream/docs/handoffs/matrx-files-cutover.md` and
`/Users/armanisadeghi/code/common-docs/matrx-files-service/FEATURE.md`.
