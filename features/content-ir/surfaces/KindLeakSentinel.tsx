"use client";

/**
 * Mounts THE LEAK SENTINEL (G1) once for the app. Rendered by
 * `app/DeferredSingletonCore.tsx` — already behind the client-only, idle-gated
 * `ssr:false` edge, so it adds nothing to the main chunk and starts only after
 * the page goes idle. Renders nothing; see `kind-leak-sentinel.ts`.
 */

import { useEffect } from "react";
import { installKindLeakSentinel } from "@/features/content-ir/surfaces/kind-leak-sentinel";

export function KindLeakSentinel(): null {
  useEffect(() => installKindLeakSentinel(), []);
  return null;
}

export default KindLeakSentinel;
