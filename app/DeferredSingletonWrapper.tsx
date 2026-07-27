"use client";

// DeferredSingletonWrapper — the ONLY entry point for the new deferred-
// singleton tree (successor to `app/DeferredSingletons.tsx`, built on the
// `components/MarkdownStream.tsx` shell/impl pattern).
//
// The split contract:
//   - THIS file is the thin client shell. It holds every gate: client-only
//     mount (useEffect), page-idle readiness, and the `next/dynamic`
//     (ssr: false) boundary that keeps the core's entire module graph out
//     of the server render and out of every route's static dep graph.
//   - `DeferredSingletonCore.tsx` is the full body. It does NO dynamic
//     imports and NO render conditions — it statically imports and
//     directly renders every singleton.
//
// The core is never rendered before the client guard resolves: `mounted`
// flips only in a browser effect, and `useIdleReady` holds it back until
// the page has gone idle, so the core chunk is not even requested during
// boot/hydration.

// Side-effect import: schedules the bundle-leak guard's boot-end macrotask
// during the CLIENT boot bundle. This MUST live in a statically-imported
// `"use client"` module (this shell), NOT in the dynamically-loaded core —
// if the guard first evaluates inside the lazy core chunk, it lands in the
// same synchronous turn as the registry/OverlaySurface modules and
// false-positives on legitimate lazy loads.
import "@/features/window-panels/utils/lazy-bundle-guard";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { useIdleReady } from "@/utils/idle-scheduler";

const DeferredSingletonCore = dynamic(
  () => import("./DeferredSingletonCore"),
  { ssr: false, loading: () => null },
);

export default function DeferredSingletonWrapper() {
  const [mounted, setMounted] = useState(false);
  const ready = useIdleReady();

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || !ready) return null;

  return <DeferredSingletonCore />;
}
