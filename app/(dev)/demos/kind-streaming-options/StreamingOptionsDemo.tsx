"use client";

/**
 * Kind streaming options — the rules bakeoff (Arman, 2026-08-24).
 *
 * Ten-ish real kinds, each streaming its canonical example through the REAL
 * accumulator, with a per-kind switch between the three rendering postures:
 *
 *   A. Progressive  — loader only until the FIRST RENDERABLE UNIT, then the
 *      real component renders and fills (interaction may be limited).
 *   B. Smart loader — a data-fed animated loader performs the arriving
 *      content until the value completes (quiz gets the bespoke prototype;
 *      others get a generic data-aware preview).
 *   C. Wait for all — the kind's library loader for the whole stream, real
 *      component only at the end (acceptable ONLY for trivial payloads).
 *
 * Arman clicks through and rules per kind; the rulings become the per-kind
 * defaults and the doctrine examples. This page decides — it does not ship
 * behavior.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Play, RotateCcw, Zap } from "lucide-react";
import {
  IR_ENVELOPE_KEY,
  isCanonicalBlockIR,
  type CanonicalBlockIR,
} from "@ai-matrx/content-ir";
import type { RenderBlockPayload } from "@/types/python-generated/stream-events";
import { StreamBlockAccumulator } from "@/features/agents/redux/execution-system/utils/stream-block-accumulator";
import { kindRegistry } from "@/features/content-ir/registry/kind-registry";
import { componentRegistry } from "@/features/content-ir/registry/component-registry";
import { resolveKindLoadingComponent } from "@/features/content-ir/react/loading/kind-loading-registry";
import { earlyKeysFromValue } from "@/features/content-ir/react/loading/kind-loading.types";
import {
  buildWireText,
  chunkWireText,
} from "@/features/content-ir/studio/stream-simulator";
import SmartQuizLoader from "./SmartQuizLoader";

const BlockRenderer = dynamic(
  () =>
    import(
      "@/components/mardown-display/chat-markdown/block-registry/BlockRenderer"
    ).then((m) => m.BlockRenderer),
  { ssr: false, loading: () => null },
);

export interface DemoKind {
  kind: string;
  label: string;
  loadingComponent: string | null;
  example: Record<string, unknown>;
}

type Mode = "progressive" | "smart" | "wait";

const MODE_LABEL: Record<Mode, string> = {
  progressive: "A · Progressive (first unit → real component)",
  smart: "B · Smart loader (data-fed animation until done)",
  wait: "C · Wait for all (skeleton the whole time)",
};

const noop = () => {};

// ── First-renderable-unit predicates (the per-kind rule this page exists to
// let Arman set; these are the PROPOSED defaults) ───────────────────────────

function hasText(v: unknown, min = 8): boolean {
  return typeof v === "string" && v.trim().length >= min;
}

function firstUnitReady(kind: string, value: Record<string, unknown>): boolean {
  const arr = (k: string) => (Array.isArray(value[k]) ? (value[k] as unknown[]) : []);
  const first = (k: string) => arr(k)[0] as Record<string, unknown> | undefined;
  switch (kind) {
    case "quiz_set": {
      const q = first("questions");
      return (
        !!q && hasText(q.question) && Array.isArray(q.options) && q.options.length >= 2
      );
    }
    case "flashcard_set": {
      const c = first("cards");
      return !!c && hasText(c.front);
    }
    case "presentation_deck": {
      const s = first("slides");
      return !!s && (hasText(s.title) || hasText(s.content));
    }
    case "study_notes":
      return arr("sections").length > 0 || hasText(value.summary, 60);
    default: {
      // Generic default: any array field with a first object item that has a
      // meaningful text value, or any long scalar text.
      for (const v of Object.values(value)) {
        if (Array.isArray(v) && v.length > 0) {
          const item = v[0];
          if (typeof item === "object" && item !== null) {
            if (Object.values(item).some((f) => hasText(f))) return true;
          } else if (hasText(item, 4)) return true;
        }
        if (hasText(v, 120)) return true;
      }
      return false;
    }
  }
}

// ── Generic data-fed smart preview (for kinds without a bespoke one yet) ────

function SmartPreviewLoader({
  kind,
  value,
}: {
  kind: string;
  value: Record<string, unknown>;
}) {
  const arrays = Object.entries(value).filter(
    ([, v]) => Array.isArray(v) && (v as unknown[]).length > 0,
  );
  const newestText = (() => {
    let best = "";
    const visit = (v: unknown) => {
      if (typeof v === "string" && v.trim().length > best.trim().length) best = v;
      else if (Array.isArray(v)) v.forEach(visit);
      else if (typeof v === "object" && v !== null)
        Object.values(v).forEach(visit);
    };
    visit(value);
    return best.slice(-220);
  })();
  const title = typeof value.title === "string" ? value.title : kind;

  return (
    <div className="rounded-xl border border-primary/25 bg-gradient-to-br from-primary/5 via-card to-card p-5">
      <p className="text-sm font-semibold text-foreground">{title}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {arrays.map(([k, v]) => (
          <span
            key={k}
            className="rounded-full border border-border bg-card px-2.5 py-0.5 text-xs text-muted-foreground"
          >
            {k}: {(v as unknown[]).length} arrived
          </span>
        ))}
        {arrays.length === 0 && (
          <span className="text-xs text-muted-foreground">
            First content arriving…
          </span>
        )}
      </div>
      {newestText && (
        <p className="mt-3 line-clamp-3 text-sm italic text-muted-foreground">
          …{newestText}
        </p>
      )}
      <div className="mt-4 h-1 w-full overflow-hidden rounded-full bg-muted">
        <div className="h-full w-1/4 animate-pulse rounded-full bg-primary/60" />
      </div>
    </div>
  );
}

// ── One kind's card ─────────────────────────────────────────────────────────

const TICK_MS = 60;
const CHARS_PER_TICK = 30;

function envelopeOf(block: RenderBlockPayload | null): CanonicalBlockIR | null {
  const candidate = block?.metadata?.[IR_ENVELOPE_KEY];
  return isCanonicalBlockIR(candidate) ? candidate : null;
}

/**
 * Pick the block the card renders. Real chat keeps blocks in a MAP keyed by
 * blockId (the stream ends with a trailing empty text block — replacing the
 * structured block with it was the "goes blank at the end" bug). The card
 * mirrors that: keep every block, render the structured one.
 */
function pickStructuredBlock(
  blocks: Map<string, RenderBlockPayload>,
): RenderBlockPayload | null {
  let best: RenderBlockPayload | null = null;
  for (const b of blocks.values()) {
    if (envelopeOf(b)) return b;
    if ((b.content ?? "").length > (best?.content ?? "").length) best = b;
  }
  return best;
}

function KindStreamCard({ demo }: { demo: DemoKind }) {
  const [mode, setMode] = useState<Mode>("progressive");
  const [running, setRunning] = useState(false);
  const [block, setBlock] = useState<RenderBlockPayload | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const blocksRef = useRef(new Map<string, RenderBlockPayload>());
  // First-renderable-unit LATCH: once the unit has arrived it never un-arrives
  // (the value only grows) — the latch guarantees the real component can never
  // flicker back to the loader on an odd intermediate frame.
  const unitReadyRef = useRef(false);

  useEffect(
    () => () => {
      if (timerRef.current) clearInterval(timerRef.current);
    },
    [],
  );

  const run = useCallback(
    (instant: boolean) => {
      if (timerRef.current) clearInterval(timerRef.current);
      blocksRef.current = new Map();
      unitReadyRef.current = false;
      setBlock(null);
      setRunning(!instant);
      // Bare structured-output wire: ONE region, the provider shape.
      const wire = buildWireText(demo.example, demo.kind, "bare");
      const accumulator = new StreamBlockAccumulator(
        `stream-options-${demo.kind}`,
        (payload) => {
          const b = payload.block as RenderBlockPayload;
          blocksRef.current.set(b.blockId, b);
          setBlock(pickStructuredBlock(blocksRef.current));
          return payload;
        },
      );
      const dispatch = (action: unknown) => action;
      if (instant) {
        // The DB-load equivalent: same pipeline, whole document at once —
        // the final render MUST be identical to the streamed one.
        accumulator.ingest(wire, dispatch);
        accumulator.finalize(dispatch);
        return;
      }
      const chunks = chunkWireText(wire, CHARS_PER_TICK);
      let i = 0;
      timerRef.current = setInterval(() => {
        const next = chunks[i];
        i += 1;
        if (next !== undefined) {
          accumulator.ingest(next, dispatch);
          return;
        }
        if (timerRef.current) clearInterval(timerRef.current);
        timerRef.current = null;
        accumulator.finalize(dispatch);
        setRunning(false);
      }, TICK_MS);
    },
    [demo],
  );

  const play = useCallback(() => run(false), [run]);

  const envelope = envelopeOf(block);
  const value = (envelope?.root.value ?? {}) as Record<string, unknown>;
  const streaming = block?.status === "streaming";
  const complete = block?.status === "complete";
  if (!unitReadyRef.current && firstUnitReady(demo.kind, value)) {
    unitReadyRef.current = true;
  }
  const unitReady = unitReadyRef.current;

  const Loader = resolveKindLoadingComponent(demo.loadingComponent);
  const loaderEl = (
    <Loader {...earlyKeysFromValue(value, demo.kind)} />
  );

  const realEl = block ? (
    <BlockRenderer
      block={{
        type: block.type,
        content: block.content ?? "",
        serverData: block.data ?? undefined,
        metadata: block.metadata,
        isStreamingBlock: streaming,
      }}
      index={0}
      isStreamActive={streaming}
      suppressLoadingGate
      replaceBlockContent={noop}
      handleOpenEditor={noop}
    />
  ) : null;

  let body: React.ReactNode;
  if (!block) {
    body = (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Press Play to stream the canonical example.
      </p>
    );
  } else if (complete) {
    body = realEl;
  } else if (mode === "progressive") {
    body = unitReady ? realEl : loaderEl;
  } else if (mode === "smart") {
    body =
      demo.kind === "quiz_set" ? (
        <SmartQuizLoader value={value} />
      ) : (
        <SmartPreviewLoader kind={demo.kind} value={value} />
      );
  } else {
    body = loaderEl;
  }

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
        <span className="font-mono text-xs font-semibold text-foreground">
          {demo.kind}
        </span>
        <span className="text-xs text-muted-foreground">{demo.label}</span>
        <span className="ml-auto" />
        <select
          value={mode}
          onChange={(e) => setMode(e.target.value as Mode)}
          className="rounded-md border border-border bg-card px-2 py-1 text-xs text-foreground"
          aria-label={`Rendering posture for ${demo.kind}`}
        >
          {(Object.keys(MODE_LABEL) as Mode[]).map((m) => (
            <option key={m} value={m}>
              {MODE_LABEL[m]}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={play}
          disabled={running}
          className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {complete ? (
            <RotateCcw className="h-3 w-3" />
          ) : (
            <Play className="h-3 w-3" />
          )}
          {complete ? "Replay" : "Play"}
        </button>
        <button
          type="button"
          onClick={() => run(true)}
          disabled={running}
          title="Skip the stream — render the complete value at once (the DB-load path); must look identical to the streamed end state"
          className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2.5 py-1 text-xs font-medium text-foreground hover:bg-accent disabled:opacity-50"
        >
          <Zap className="h-3 w-3" />
          Instant
        </button>
      </div>
      {/* Fixed-height stage: the card NEVER changes shape while content
          streams — content scrolls inside; the final render persists until
          the next run. */}
      <div className="h-[26rem] overflow-y-auto p-3">{body}</div>
      {block && (
        <div className="border-t border-border px-3 py-1.5 text-[11px] text-muted-foreground">
          {streaming
            ? unitReady
              ? "streaming — first renderable unit ARRIVED"
              : "streaming — waiting on the first renderable unit"
            : "complete — final render"}
          {" · loader: "}
          {demo.loadingComponent ?? "generic (undeclared)"}
        </div>
      )}
    </div>
  );
}

export default function StreamingOptionsDemo({ kinds }: { kinds: DemoKind[] }) {
  useEffect(() => {
    void kindRegistry.ensureWarm();
    void componentRegistry.ensureWarm();
  }, []);

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
      <div className="mb-4">
        <h1 className="text-lg font-semibold text-foreground">
          Kind streaming options — pick the posture per kind
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Each card streams that kind's real canonical example through the real
          pipeline. Switch a card between the three postures and press Play:
          A renders the real component from the first renderable unit; B runs a
          data-fed smart loader until the value completes (quiz has the bespoke
          prototype); C keeps the library skeleton the whole time. Your picks
          become the per-kind defaults.
        </p>
      </div>
      <div className="space-y-4">
        {kinds.map((k) => (
          <KindStreamCard key={k.kind} demo={k} />
        ))}
      </div>
    </div>
  );
}
