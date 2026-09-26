"use client";

// features/flashcards/fast-fire/components/FastFireClient.tsx
//
// Thin client wrapper that code-splits the heavy FastFire surface behind
// `next/dynamic({ ssr: false })`. FastFireSurface pulls in MediaRecorder, the
// shared AudioContext, rAF timers, and the agent-execution slices — all
// browser-only — so it must NEVER enter a server/SSR render path or bloat a
// route chunk. This wrapper is the single client boundary; the page imports
// only this. (CLAUDE.md heavy-client-code-split rule.)

import { useEffect, useState, type ComponentType } from "react";
import SuspenseLoader from "@/components/loaders/SuspenseLoader";
import { Button } from "@/components/ui/button";
import {
  FASTFIRE_SURFACE_LOAD_TIMEOUT_MESSAGE,
  loadFastFireSurface,
} from "./fastfire-initial-load";
import { ErrorNotice } from "@/components/errors/ErrorNotice";

type FastFireSurfaceComponent = ComponentType<{ setId?: string | null }>;

export function FastFireClient({ setId }: { setId?: string | null }) {
  const [attempt, setAttempt] = useState(0);
  const [surface, setSurface] = useState<FastFireSurfaceComponent | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;
    void loadFastFireSurface(() =>
      import("./FastFireSurface").then((module) => module.FastFireSurface),
    ).then(
      (component) => {
        if (!disposed) setSurface(() => component);
      },
      (error: unknown) => {
        if (!disposed) {
          setLoadError(
            error instanceof Error
              ? error.message
              : FASTFIRE_SURFACE_LOAD_TIMEOUT_MESSAGE,
          );
        }
      },
    );
    return () => {
      disposed = true;
    };
  }, [attempt]);

  const retry = () => {
    // Retry is a user event, so reset the visible terminal state before the
    // next request begins rather than synchronously cascading from the effect.
    setSurface(null);
    setLoadError(null);
    setAttempt((value) => value + 1);
  };

  if (loadError) {
    return (
      <div className="flex min-h-[60dvh] flex-col items-center justify-center gap-3 bg-textured p-6 text-center">
        <ErrorNotice size="inline" className="max-w-sm text-sm text-muted-foreground" message={loadError} />
        <Button type="button" variant="outline" onClick={retry}>
          Retry loading FastFire
        </Button>
      </div>
    );
  }

  if (!surface) {
    return (
      <div className="flex min-h-[60dvh] items-center justify-center bg-textured">
        <SuspenseLoader centered={false} message="Loading FastFire…" />
      </div>
    );
  }

  const Surface = surface;
  return <Surface setId={setId} />;
}
