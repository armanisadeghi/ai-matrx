// lib/media/signed-url.ts
//
// THE single source of truth for "is this a LEGACY signed, time-limited URL?"
// is now `@ai-matrx/data/files` (the C9 collapse) — both AWS signing dialects,
// one regex, canonical in the package. Re-exported here so the existing call
// sites (durability guards, adapters) keep one import path. The service
// worker keeps its own byte-identical mirror (`cache/service-worker/src/sw.ts`
// has no app imports) — change the package and the mirror together.

export { isSignedUrl, SIGNED_URL_RE } from "@ai-matrx/data/files";
