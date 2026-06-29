# Build-time Turbopack warnings (review before fixing)

> **Status:** Documented 2026-06-28 — build succeeds but ~8 min on Vercel due in part to these patterns.
> **Do not fix blindly** — read each trace and confirm the scoped fix won't break admin docs or local-logs.

## Symptoms (from Vercel `MATRX_PROFILE=full` build)

Three Turbopack warnings, then successful compile:

### 1. Admin docs — overly broad `readFile` / `path.resolve`

**File:** `app/(admin)/admin/docs/[[...path]]/page.tsx` (lines ~53–63)

```
The file pattern matches ~19,946 files in [project]/
```

**Cause:** Runtime path resolution uses `process.cwd()` + dynamic `relPath` from URL segments. Turbopack traces the entire repo as a potential filesystem read target.

**Import trace:** `admin/docs/page` → `app/api/admin/local-logs/route.ts`

**Fix options (pick one after review):**

1. Statically scope reads to a known docs root, e.g. `path.join(process.cwd(), 'docs')` only — never bare `cwd()` + dynamic join.
2. Add `/* turbopackIgnore: true */` on the dynamic segment per Next.js NFT guidance (last resort).
3. Move markdown serving to a dedicated API route with an allowlist of paths under `docs/`.
4. Gate `local-logs` route so it doesn't pull admin docs into the same server bundle (if that's the accidental link).

### 2. `next.config.js` — whole-project NFT trace

**Import trace:** `next.config.js` → `app/api/admin/local-logs/route.ts`

**Cause:** Something in `local-logs` (or its static import graph) loads `next.config.js` at build time, which uses broad `path`/`fs` patterns.

**Fix options:**

1. Inspect `app/api/admin/local-logs/route.ts` — remove any import that reaches `next.config.js`.
2. Split config-only helpers out of `next.config.js` into a small file without filesystem ops.
3. Ensure `local-logs` is dev-only or behind `MATRX_PROFILE=full` with zero prod imports.

### 3. Build duration context

- Full profile build: **~6–8 minutes** compile + static generation.
- Input source on Vercel worker: **~2.3 GB** (per build report).
- These warnings correlate with tracing **the entire project** into server bundles — fixing them should reduce Turbopack graph size materially.

## Verification after fix

```bash
MATRX_PROFILE=full pnpm run build
```

Expect: zero “Overly broad patterns” / “unexpected file in NFT list” warnings, and measurably lower compile time.

## Related (not Turbopack — separate infra)

- **Node 20.x deprecated on Vercel** — set project to Node **24.x** in Vercel Project Settings.
- **pnpm 9 vs 10** — `package.json` declares `packageManager: pnpm@10.29.2`; `vercel.json` installCommand enables corepack (see repo root).

## Change log

- `2026-06-29` — `local-logs`: prod 404 gate, dynamic `node:fs` import, `turbopackIgnore` on `$HOME` paths. Admin docs viewer left unchanged pending manual review.
- `2026-06-28` — Initial doc from failed-then-fixed Vercel build log (`TEMP-CLEANUP.md`).
