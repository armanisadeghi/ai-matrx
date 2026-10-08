"use client";

// features/spaces/page/space-seed-context.tsx — the server's first reads for THIS page's database blocks
// (`space-page-seed.server.ts`), for the blocks that draw from them.
//
// Round 36: one promise PER BLOCK, streamed from the route (a slow table never holds a fast chart). A block
// drawn in the first pass (the server's HTML, and the browser while hydrating) waits on its own promise
// inside its own Suspense, so the page's text never waits for a table. Once a block's answers land they
// are kept here resolved, so the editor's own database blocks (mounted when the room is joined) start from
// the same answers and ask nothing again. The editor waits for the seeds at most EDITOR_WAIT_MS: past it,
// a block not yet answered reads for itself. A React context, never module state: on the server it is per
// request.

import { RecordsSeedProvider } from "@ai-matrx/records/react";
import type { RecordsSeed } from "@ai-matrx/records/core";
import { createContext, Suspense, use, useContext, useEffect, useState, type ReactNode } from "react";

/** `custom.where_id_opens`'s answer for one table, as the server got it. */
export interface SeededWhere {
  data: unknown;
  error: { code?: string | null; message?: string | null } | null;
}

/** One database block's first reads, as the server asked them. */
export interface BlockSeed {
  /** A custom table block: the table and where it opens (asked whatever the knob said). */
  tableId?: string;
  where?: SeededWhere;
  /** Every door answer the block's first pass asks; null when the person's `data/server_rows` is off. */
  records: RecordsSeed | null;
}

/** Per database block id, its first reads (each streams on its own; never rejects). */
export type SpaceBlockSeeds = Record<string, Promise<BlockSeed | null>>;

/** How long the editor waits for the blocks' seeds before it is built anyway. */
const EDITOR_WAIT_MS = 2_500;

interface SeedState {
  seeds: SpaceBlockSeeds | null;
  landed: Record<string, BlockSeed | null>;
  /** Every block's seed has answered (or there are none, or the wait is over): blocks mounted now start from what landed. */
  settled: boolean;
}

const SpaceSeedContext = createContext<SeedState>({ seeds: null, landed: {}, settled: true });

export function SpaceSeedProvider({ seeds, children }: { seeds?: SpaceBlockSeeds; children: ReactNode }) {
  const [state, setState] = useState<{ seeds: SpaceBlockSeeds; landed: Record<string, BlockSeed | null>; waited: boolean } | null>(null);
  useEffect(() => {
    if (!seeds) return;
    let live = true;
    setState({ seeds, landed: {}, waited: false });
    for (const [id, promise] of Object.entries(seeds)) {
      const settle = (value: BlockSeed | null) => live && setState((s) => (s && s.seeds === seeds ? { ...s, landed: { ...s.landed, [id]: value } } : s));
      void promise.then(settle, () => settle(null));
    }
    const wait = window.setTimeout(() => live && setState((s) => (s && s.seeds === seeds ? { ...s, waited: true } : s)), EDITOR_WAIT_MS);
    return () => {
      live = false;
      window.clearTimeout(wait);
    };
  }, [seeds]);
  const mine = state && state.seeds === seeds ? state : null;
  const ids = seeds ? Object.keys(seeds) : [];
  const settled = !seeds || ids.length === 0 || (!!mine && (mine.waited || ids.every((id) => id in mine.landed)));
  return <SpaceSeedContext value={{ seeds: seeds ?? null, landed: mine?.landed ?? {}, settled }}>{children}</SpaceSeedContext>;
}

/** Whether the page's seeds have answered (true when there are none, or the editor's wait is over). */
export function useSpaceSeedSettled(): boolean {
  return useContext(SpaceSeedContext).settled;
}

/** Suspends until this block's seed answers (a first-pass block inside its own Suspense). */
export function useAwaitedBlockSeed(blockId: string): BlockSeed | null {
  const { seeds, landed } = useContext(SpaceSeedContext);
  if (blockId in landed) return landed[blockId] ?? null;
  const promise = seeds?.[blockId];
  return promise ? use(promise) : null;
}

/** Records seed answers for the block below — the server's answers, drawn without asking again. */
function SeedRecords({ seed, children }: { seed: BlockSeed | null; children: ReactNode }) {
  if (!seed?.records) return <>{children}</>;
  return <RecordsSeedProvider seed={seed.records}>{children}</RecordsSeedProvider>;
}

/**
 * For a block mounted AFTER the first pass (an editor node view, drawn a frame after its editor): a seed
 * store is live only until its provider's first effect, so each such block gets its own copy of its
 * landed seed, live for its own first pass — it starts from the server's answers and asks nothing. The
 * Suspense sits ABOVE the provider: a seeded read suspends once, and the provider must not commit (and
 * close its store) while it does.
 */
export function LateSeedRecords({ blockId, fallback, children }: { blockId: string; fallback: ReactNode; children: ReactNode }) {
  const landed = useContext(SpaceSeedContext).landed[blockId];
  const [copy] = useState(() => (landed?.records ? { at: landed.records.at, answers: landed.records.answers } : null));
  if (!copy) return <>{children}</>;
  return (
    <Suspense fallback={fallback}>
      <RecordsSeedProvider seed={copy}>{children}</RecordsSeedProvider>
    </Suspense>
  );
}

/** Where one table opens, from the page's seeds (null when the server did not ask it). */
export function useSeededWhere(tableId: string): SeededWhere | null {
  const { landed } = useContext(SpaceSeedContext);
  for (const seed of Object.values(landed)) if (seed?.tableId === tableId && seed.where) return seed.where;
  return null;
}

/** For a first-pass block: its seed handed down already resolved (the block awaited it). */
export function ResolvedBlockSeed({ blockId, seed, children }: { blockId: string; seed: BlockSeed | null; children: ReactNode }) {
  const outer = useContext(SpaceSeedContext);
  return (
    <SpaceSeedContext value={{ seeds: outer.seeds, landed: { ...outer.landed, [blockId]: seed }, settled: outer.settled }}>
      <SeedRecords seed={seed}>{children}</SeedRecords>
    </SpaceSeedContext>
  );
}
