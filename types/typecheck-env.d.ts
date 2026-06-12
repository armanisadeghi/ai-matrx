/// <reference types="next" />
/// <reference types="next/image-types/global" />

// Used by tsconfig.typecheck.json instead of next-env.d.ts.
// next-env.d.ts imports .next/dev/types/routes.d.ts, which is a dev/build
// artifact that can be stale or corrupted when next dev is interrupted.
// Batch type-checks (sync-types, CI) must not depend on that file.
