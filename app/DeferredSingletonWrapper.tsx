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
import { installGlobalErrorCapture } from "@/lib/diagnostics/globalErrorCapture";
import { installErrorPersistence } from "@/lib/diagnostics/persistCapturedErrors";

// Install the global error listeners at MODULE scope, not in the effect below.
// React reports hydration mismatches (minified errors #418/#423/#425) through
// `console.error` DURING hydration — which is strictly before any effect runs.
// An effect-time install therefore cannot see the single most common
// production-only error class, and the Error Inspector recorded nothing while
// the browser console showed #418 on every marketing route (2026-08-11
// investigation: the error was visible in Arman's console and structurally
// invisible to our own diagnostics).
//
// This module is already statically imported into every route's client boot
// bundle, so module-scope evaluation happens as that bundle loads — before
// `hydrateRoot`. `installGlobalErrorCapture` is idempotent and returns
// immediately when `window` is undefined, so the SSR pass of this client
// module is a no-op.
installGlobalErrorCapture();

const DeferredSingletonCore = dynamic(
  () => import("./DeferredSingletonCore"),
  { ssr: false, loading: () => null },
);

export default function DeferredSingletonWrapper() {
  const [mounted, setMounted] = useState(false);
  const ready = useIdleReady();

  // Error capture itself is installed at module scope above (pre-hydration).
  // Persistence stays here: it writes to Supabase and has nothing to gain from
  // running before the client tree exists.
  useEffect(() => {
    // Persist red-tier captures to public.system_error (canonical sink) —
    // self-gates to production + authenticated; deduped + throttled. See
    // lib/diagnostics/persistCapturedErrors.ts.
    installErrorPersistence();
    setMounted(true);
  }, []);

  if (!mounted || !ready) return null;

  return <DeferredSingletonCore />;
}
