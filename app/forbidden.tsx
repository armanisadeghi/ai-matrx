// app/forbidden.tsx — the root boundary for Next's `forbidden()`.
//
// FIRST use of the `forbidden()` convention in this repo (2026-08-11); it needs
// `experimental.authInterrupts` in next.config.js, which is set in the same
// commit as this file. Route groups that need their own chrome define their own
// `forbidden.tsx` (see `app/(core)/forbidden.tsx`) — this is the bare fallback
// for everything else.
import { ForbiddenSurface } from "@/features/access-gate/components/ForbiddenSurface";

export default function Forbidden() {
  return (
    <div className="min-h-dvh bg-textured">
      <ForbiddenSurface />
    </div>
  );
}
