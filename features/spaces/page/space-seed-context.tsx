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

/**
 * THIS block's seed: its answers, read synchronously by Spaces' own first reads (`useEntityRows`,
 * `ChartView`), and the records seed the package's own reads (`EntityChartBlock`, `TablePage`, the
 * records hooks) take through `<BlockRecordsSeed>`. A seed store lives until its provider's first effect,
 * so the provider sits right around the block's content (inside its `RecordsMount`), never above a mount
 * that draws its content a pass later — there it would close before anything below had asked.
 */
const BlockSeedContext = createContext<RecordsSeed | null>(null);

/** This block's seed answers (null outside a seeded block). Read once, in a first render's state. */
export function useBlockSeedAnswers(): RecordsSeed["answers"] | null {
  return useContext(BlockSeedContext)?.answers ?? null;
}

/** The block's records seed for the package's reads below — place it around the block's own content. */
export function BlockRecordsSeed({ children }: { children: ReactNode }) {
  const seed = useContext(BlockSeedContext);
  if (!seed) return <>{children}</>;
  return <RecordsSeedProvider seed={seed}>{children}</RecordsSeedProvider>;
}

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
  const promise = useContext(SpaceSeedContext).seeds?.[blockId];
  // Always through use() when there is a promise: a render that suspended must call use() again when it
  // retries, and the "landed" state can arrive while it is suspended (React: "called use() to suspend in a
  // previous render but did not call use() when it finished"). A settled seed answers synchronously.
  return promise ? use(settledSeed(promise)) : null;
}

/** The seed promise React can read without suspending once it has settled (a refusal reads as null). */
type TrackedSeed = Promise<BlockSeed | null> & { status?: "pending" | "fulfilled"; value?: BlockSeed | null };
const trackedSeeds = new WeakMap<Promise<BlockSeed | null>, TrackedSeed>();
function settledSeed(promise: Promise<BlockSeed | null>): TrackedSeed {
  let tracked = trackedSeeds.get(promise);
  if (!tracked) {
    const t: TrackedSeed = promise.catch(() => null);
    t.status = "pending";
    void t.then((value) => {
      t.status = "fulfilled";
      t.value = value;
    });
    trackedSeeds.set(promise, t);
    tracked = t;
  }
  return tracked;
}

/** One copy per landed seed and place (the first pass, or an editor block): a block that suspends and
 *  retries finds the same copy, and the two places never share one (each copy is its own seed store). */
const firstPassCopies = new WeakMap<BlockSeed, RecordsSeed>();
const lateCopies = new WeakMap<BlockSeed, RecordsSeed>();
function copyOf(seed: BlockSeed | null | undefined, held: WeakMap<BlockSeed, RecordsSeed>): RecordsSeed | null {
  if (!seed?.records) return null;
  let copy = held.get(seed);
  if (!copy) {
    copy = { at: seed.records.at, answers: seed.records.answers };
    held.set(seed, copy);
  }
  return copy;
}

/** The server's answers for the block below — drawn without asking again. */
function SeedRecords({ seed, children }: { seed: BlockSeed | null; children: ReactNode }) {
  const copy = copyOf(seed, firstPassCopies);
  if (!copy) return <>{children}</>;
  return <BlockSeedContext value={copy}>{children}</BlockSeedContext>;
}

/** How long an editor block mounted before its seed landed waits for it before it reads for itself. */
const LATE_WAIT_MS = 8_000;
const lateWaits = new WeakMap<Promise<BlockSeed | null>, Promise<BlockSeed | null>>();
function lateWait(promise: Promise<BlockSeed | null>): Promise<BlockSeed | null> {
  let held = lateWaits.get(promise);
  if (!held) {
    held = Promise.race([promise.catch(() => null), new Promise<null>((resolve) => setTimeout(() => resolve(null), LATE_WAIT_MS))]);
    lateWaits.set(promise, held);
  }
  return held;
}

function SeededCopy({ seed, children }: { seed: BlockSeed | null | undefined; children: ReactNode }) {
  const copy = copyOf(seed, lateCopies);
  if (!copy) return <>{children}</>;
  return <BlockSeedContext value={copy}>{children}</BlockSeedContext>;
}

function AwaitLateSeed({ promise, children }: { promise: Promise<BlockSeed | null>; children: ReactNode }) {
  const seed = use(lateWait(promise));
  return <SeededCopy seed={seed}>{children}</SeededCopy>;
}

/**
 * For a block mounted AFTER the first pass (an editor node view, drawn a frame after its editor): a seed
 * store is live only until its provider's first effect, so each such block gets its own copy of its
 * seed, live for its own first pass — it starts from the server's answers and asks nothing. A block whose
 * seed is still on its way waits for it (at most LATE_WAIT_MS) rather than asking the same reads again.
 * The Suspense sits ABOVE the provider: a seeded read suspends once, and the provider must not commit
 * (and close its store) while it does.
 */
export function LateSeedRecords({ blockId, fallback, children }: { blockId: string; fallback: ReactNode; children: ReactNode }) {
  const { seeds, landed } = useContext(SpaceSeedContext);
  const promise = seeds?.[blockId];
  if (blockId in landed) {
    if (!landed[blockId]?.records) return <>{children}</>;
    return (
      <Suspense fallback={fallback}>
        <SeededCopy seed={landed[blockId]}>{children}</SeededCopy>
      </Suspense>
    );
  }
  if (!promise) return <>{children}</>;
  return (
    <Suspense fallback={fallback}>
      <AwaitLateSeed promise={promise}>{children}</AwaitLateSeed>
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
