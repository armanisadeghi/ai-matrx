"use client";

// features/spaces/page/space-seed-context.tsx — round 34: the server's first reads for THIS page's
// inline tables (`space-page-seed.server.ts`), for the database blocks that draw from them.
//
// The seed arrives as a promise streamed from the route. A block that draws in the first pass (the
// server's HTML, and the browser while hydrating) waits on it inside its own Suspense, so the page's
// text never waits for a table. Once it lands it is kept here resolved, so the editor's own database
// blocks (mounted when the room is joined) start from the same answers and ask nothing again.
// A React context, never module state: on the server it is per request.

import { RecordsSeedProvider } from "@ai-matrx/records/react";
import type { RecordsSeed } from "@ai-matrx/records/core";
import { createContext, use, useContext, useEffect, useState, type ReactNode } from "react";

/** `custom.where_id_opens`'s answer for one table, as the server got it. */
export interface SeededWhere {
  data: unknown;
  error: { code?: string | null; message?: string | null } | null;
}

export interface SpaceTablesSeed {
  /** Per table id: where the table opens (asked by the knob's door), whatever the knob said. */
  where: Record<string, SeededWhere>;
  /** Every table's door answers (`askTablePageSeed`), only for tables whose `data/server_rows` is on. */
  records: RecordsSeed | null;
}

interface SeedState {
  promise: Promise<SpaceTablesSeed | null> | null;
  resolved: SpaceTablesSeed | null;
}

const SpaceSeedContext = createContext<SeedState>({ promise: null, resolved: null });

export function SpaceSeedProvider({ seed, children }: { seed?: Promise<SpaceTablesSeed | null>; children: ReactNode }) {
  const [resolved, setResolved] = useState<SpaceTablesSeed | null>(null);
  useEffect(() => {
    let live = true;
    void seed?.then((s) => live && setResolved(s));
    return () => {
      live = false;
    };
  }, [seed]);
  return <SpaceSeedContext value={{ promise: seed ?? null, resolved }}>{children}</SpaceSeedContext>;
}

/** The page's seed once landed (null before, or when there is none). Never suspends. */
export function useLandedSpaceSeed(): SpaceTablesSeed | null {
  return useContext(SpaceSeedContext).resolved;
}

/** Suspends until the page's seed answers (a first-pass block inside its own Suspense). */
export function useAwaitedSpaceSeed(): SpaceTablesSeed | null {
  const { promise, resolved } = useContext(SpaceSeedContext);
  if (resolved || !promise) return resolved;
  return use(promise);
}

/** Records seed answers for the tables below — the server's rows, drawn without asking again. */
export function SeedRecords({ seed, children }: { seed: SpaceTablesSeed | null; children: ReactNode }) {
  if (!seed?.records) return <>{children}</>;
  return <RecordsSeedProvider seed={seed.records}>{children}</RecordsSeedProvider>;
}

/** Where one table opens, from the page's seed (null when the server did not ask it). */
export function useSeededWhere(tableId: string): SeededWhere | null {
  const { resolved } = useContext(SpaceSeedContext);
  return resolved?.where[tableId] ?? null;
}

/** For a first-pass block: the page's seed handed down already resolved (the block awaited it). */
export function ResolvedSpaceSeed({ seed, children }: { seed: SpaceTablesSeed | null; children: ReactNode }) {
  const outer = useContext(SpaceSeedContext);
  return (
    <SpaceSeedContext value={{ promise: outer.promise, resolved: seed }}>
      <SeedRecords seed={seed}>{children}</SeedRecords>
    </SpaceSeedContext>
  );
}
