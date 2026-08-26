"use client";

/**
 * Stream tab — replay the EXACT stream this shape's component receives in
 * production, before an agent ever streams it for real.
 *
 * The canonical example is serialized to wire text (chat fence or bare
 * structured-output), chunked, and fed through the REAL
 * `StreamBlockAccumulator` — the same class chat runs — and the resulting
 * blocks render through the REAL `SafeBlockRenderer` stages (kind route →
 * provisional → pending loader → dispatch). Nothing here is a lookalike:
 * if the loading skeleton doesn't appear instantly, or the component
 * snaps in only at the end, that is exactly what users see in chat.
 *
 * The verdict panel makes the check explicit: instant detection, loading
 * component identity, progressive growth, raw-JSON flash, final swap.
 * Contract: common-docs/systems/content-ir-system/STREAMING_PARTIAL_KINDS.md.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CircleAlert,
  CircleCheck,
  CircleX,
  Gauge,
  Play,
  RotateCcw,
} from "lucide-react";
import type { Json } from "@/types/database.types";
import type { RenderBlockPayload } from "@/types/python-generated/stream-events";
import { StreamBlockAccumulator } from "@/features/agents/redux/execution-system/utils/stream-block-accumulator";
import { SafeBlockRenderer } from "@/components/mardown-display/chat-markdown/internal-handlers/SafeBlockRenderer";
import { kindRegistry } from "@/features/content-ir/registry/kind-registry";
import { componentRegistry } from "@/features/content-ir/registry/component-registry";
import { isPartialReadyKind } from "@/features/content-ir/react/partial-kind-route";
import { resolveLoadingSlugForKind } from "@/features/content-ir/react/loading/resolve-loading-slug";
import { useKindExamples } from "@/features/content-ir/studio/kind-examples";
import {
  WIRE_MODE_LABEL,
  buildWireText,
  chunkWireText,
  deriveStreamVerdicts,
  recordFromUpsert,
  type StreamTickRecord,
  type StreamVerdicts,
  type WireMode,
} from "@/features/content-ir/studio/stream-simulator";

interface ShapeStreamTabProps {
  kind: string;
  label: string;
  kindDefinitionId: string;
}

const TICK_MS = 60;

const SPEEDS: Array<{ label: string; charsPerTick: number }> = [
  { label: "Slow", charsPerTick: 12 },
  { label: "Realistic", charsPerTick: 36 },
  { label: "Fast", charsPerTick: 140 },
];

type RunState = "idle" | "playing" | "done" | "error";

const noop = () => {};

function VerdictRow({
  ok,
  warn,
  title,
  detail,
}: {
  ok: boolean;
  /** Soft outcome — expected for some kinds, shown amber instead of red. */
  warn?: boolean;
  title: string;
  detail: string;
}) {
  const Icon = ok ? CircleCheck : warn ? CircleAlert : CircleX;
  const tone = ok
    ? "text-emerald-600 dark:text-emerald-400"
    : warn
      ? "text-amber-600 dark:text-amber-400"
      : "text-destructive";
  return (
    <div className="flex items-start gap-2 py-1.5">
      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${tone}`} />
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground">{detail}</p>
      </div>
    </div>
  );
}

export default function ShapeStreamTab({
  kind,
  label,
  kindDefinitionId,
}: ShapeStreamTabProps) {
  const examples = useKindExamples(kindDefinitionId);
  const [mode, setMode] = useState<WireMode>("fenced");
  const [speedIdx, setSpeedIdx] = useState(1);
  const [runState, setRunState] = useState<RunState>("idle");
  const [runId, setRunId] = useState(0);
  const [blocks, setBlocks] = useState<RenderBlockPayload[]>([]);
  const [verdicts, setVerdicts] = useState<StreamVerdicts | null>(null);
  const [progress, setProgress] = useState({ chunk: 0, total: 0 });

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordsRef = useRef<StreamTickRecord[]>([]);

  // Warm both registries up front so a cloud kind's schema/component resolve
  // during the run the same way they would mid-chat (cold fetch included).
  useEffect(() => {
    void kindRegistry.ensureWarm();
    void componentRegistry.ensureWarm();
  }, []);

  useEffect(
    () => () => {
      if (timerRef.current) clearInterval(timerRef.current);
    },
    [],
  );

  const canonical =
    examples.status === "ready"
      ? (examples.rows.find((r) => r.isCanonical) ?? examples.rows[0] ?? null)
      : null;

  const play = useCallback(() => {
    if (!canonical) return;
    const data = canonical.data as Json;
    if (typeof data !== "object" || data === null || Array.isArray(data))
      return;

    if (timerRef.current) clearInterval(timerRef.current);
    recordsRef.current = [];
    setBlocks([]);
    setVerdicts(null);
    setRunState("playing");
    setRunId((n) => n + 1);

    const wire = buildWireText(data as Record<string, unknown>, kind, mode);
    const chunks = chunkWireText(wire, SPEEDS[speedIdx].charsPerTick);
    setProgress({ chunk: 0, total: chunks.length });

    const requestId = `shape-stream-sim-${kind}-${Date.now()}`;
    const byId = new Map<string, RenderBlockPayload>();
    let chunkNo = 0;

    const accumulator = new StreamBlockAccumulator(requestId, (payload) => {
      const block = payload.block;
      byId.set(block.blockId, block);
      recordsRef.current.push(recordFromUpsert(chunkNo, block));
      return payload;
    });
    const publish = () => {
      setBlocks([...byId.values()].sort((a, b) => a.blockIndex - b.blockIndex));
      setVerdicts(deriveStreamVerdicts(recordsRef.current, kind));
      setProgress({ chunk: chunkNo, total: chunks.length });
    };
    const dispatch = (action: unknown) => action;

    timerRef.current = setInterval(() => {
      chunkNo += 1;
      const next = chunks[chunkNo - 1];
      if (next !== undefined) {
        accumulator.ingest(next, dispatch);
        publish();
        return;
      }
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
      accumulator.finalize(dispatch);
      publish();
      setRunState("done");
    }, TICK_MS);
  }, [canonical, kind, mode, speedIdx]);

  const interrupt = useCallback(() => {
    if (runState !== "playing") return;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    setRunState("error");
  }, [runState]);

  const partialReady = isPartialReadyKind(kind);
  // What the RUNTIME will actually render for this kind — declared, derived,
  // or generic — from the one module the render path uses.
  const resolvedLoading = resolveLoadingSlugForKind(kind);
  const isStreamActive = runState === "playing";

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
      {/* ── Live render (the production path) ── */}
      <div className="min-w-0">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={play}
            disabled={!canonical || runState === "playing"}
            className="inline-flex h-11 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {runState === "done" ? (
              <RotateCcw className="h-3.5 w-3.5" />
            ) : (
              <Play className="h-3.5 w-3.5" />
            )}
            {runState === "done" ? "Replay stream" : "Play stream"}
          </button>
          {runState === "playing" ? (
            <button
              type="button"
              onClick={interrupt}
              className="inline-flex h-11 items-center gap-1.5 rounded-md border border-destructive/40 px-3 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10"
            >
              <CircleX className="h-3.5 w-3.5" />
              Simulate interruption
            </button>
          ) : null}
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as WireMode)}
            disabled={runState === "playing"}
            className="h-11 rounded-md border border-border bg-card px-2 text-base text-foreground sm:text-xs"
            aria-label="Wire mode"
          >
            {(Object.keys(WIRE_MODE_LABEL) as WireMode[]).map((m) => (
              <option key={m} value={m}>
                {WIRE_MODE_LABEL[m]}
              </option>
            ))}
          </select>
          <select
            value={speedIdx}
            onChange={(e) => setSpeedIdx(Number(e.target.value))}
            disabled={runState === "playing"}
            className="h-11 rounded-md border border-border bg-card px-2 text-base text-foreground sm:text-xs"
            aria-label="Stream speed"
          >
            {SPEEDS.map((s, i) => (
              <option key={s.label} value={i}>
                {s.label} ({s.charsPerTick} chars/tick)
              </option>
            ))}
          </select>
          {progress.total > 0 && (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Gauge className="h-3.5 w-3.5" />
              {Math.min(progress.chunk, progress.total)}/{progress.total} chunks
            </span>
          )}
        </div>

        {runState === "error" ? (
          <div
            role="alert"
            className="mb-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
          >
            Simulated stream interruption. No data was written. The last valid
            partial render stays visible below with streaming disabled.
          </div>
        ) : null}

        <div className="rounded-lg border border-border bg-card p-4">
          {examples.status === "error" && (
            <p className="text-sm text-destructive">{examples.message}</p>
          )}
          {examples.status === "ready" && !canonical && (
            <p className="text-sm text-muted-foreground">
              No saved example for {label} — add a canonical sample on the
              Preview tab first; the simulator streams that sample.
            </p>
          )}
          {canonical && runState === "idle" && (
            <p className="text-sm text-muted-foreground">
              Press Play to stream the canonical example through the real chat
              pipeline. Watch for: an instant loading state, progressive
              fill-in, and a clean final swap — never raw JSON.
            </p>
          )}
          <div key={runId}>
            {blocks.map((block, index) => (
              <SafeBlockRenderer
                key={block.blockId}
                block={{
                  type: block.type,
                  content: block.content ?? "",
                  serverData: block.data ?? undefined,
                  metadata: block.metadata,
                  isStreamingBlock: block.status === "streaming",
                }}
                index={index}
                isStreamActive={isStreamActive}
                replaceBlockContent={noop}
                handleOpenEditor={noop}
              />
            ))}
          </div>
        </div>
      </div>

      {/* ── The checks ── */}
      <aside className="space-y-4">
        <div className="rounded-lg border border-border bg-card p-3">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Registry facts
          </p>
          {/* THE RUNTIME'S OWN ANSWER, not a re-derivation. This panel used
              to compute only "is the declared slug known?", which since
              derivation shipped stated the OPPOSITE of the pane rendering
              beside it: it called every undeclared kind a generic skeleton
              (~95% of them now derive a real silhouette) and claimed an
              invalid declaration falls back to generic (it falls through to
              derivation). It also read DB metadata only, so ~23 kinds that
              declare a loader in CODE were reported as undeclared. */}
          <VerdictRow
            ok={resolvedLoading.origin !== "generic"}
            warn={resolvedLoading.invalidDeclared !== undefined}
            title={
              resolvedLoading.slug
                ? `Loading component: ${resolvedLoading.slug}${
                    resolvedLoading.origin === "derived" ? " (derived)" : ""
                  }`
                : "No loading component — generic skeleton"
            }
            detail={
              resolvedLoading.invalidDeclared !== undefined
                ? `Declares “${resolvedLoading.invalidDeclared}”, which is not in the loading library — ignored, and ${
                    resolvedLoading.slug
                      ? `“${resolvedLoading.slug}” was derived from this shape's schema instead`
                      : "nothing could be derived, so it streams behind the generic skeleton"
                  }. Fix the declaration (unknown-loading-component).`
                : resolvedLoading.origin === "declared"
                  ? "Declared on the shape and present in the loading library."
                  : resolvedLoading.origin === "derived"
                    ? "Derived from this shape's own schema — a real, shape-appropriate loader. Declare one only to override it."
                    : "This shape isn't distinctive enough to derive a loader, so it streams behind the generic skeleton. Set metadata.loading_component."
            }
          />
          <VerdictRow
            ok={partialReady}
            warn={!partialReady}
            title={partialReady ? "Partial-ready" : "Withheld while partial"}
            detail={
              partialReady
                ? "Opted in — the server's provisional values route into the real component mid-stream."
                : "Not opted into partial rendering; on run pages this kind keeps its loading state until complete (withhold-by-default)."
            }
          />
        </div>

        <div className="rounded-lg border border-border bg-card p-3">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Stream verdicts
          </p>
          {!verdicts && (
            <p className="text-xs text-muted-foreground">
              Run the stream to measure this shape's live behavior.
            </p>
          )}
          {verdicts && (
            <>
              <VerdictRow
                ok={verdicts.detectedWhileStreaming}
                title={
                  verdicts.detectedAtChunk !== null
                    ? `Structured region detected at chunk ${verdicts.detectedAtChunk}`
                    : "Region never detected while streaming"
                }
                detail="The parser must recognize the region mid-stream — that is what puts a loading state (not raw text) on screen instantly."
              />
              <VerdictRow
                ok={verdicts.kindResolvedWhileStreaming}
                title={
                  verdicts.kindResolvedWhileStreaming
                    ? "Kind identified while streaming"
                    : "Kind only resolved at the end"
                }
                detail="Identifying the kind mid-stream selects THIS kind's loading component and lets the route engage early."
              />
              <VerdictRow
                ok={!verdicts.rawTextFlash}
                title={
                  verdicts.rawTextFlash
                    ? "Raw JSON flashed as text"
                    : "No raw-JSON flash"
                }
                detail='A streaming block typed text/code exposing "__kind" with no envelope is the classic convert-only-when-done defect.'
              />
              <VerdictRow
                ok={verdicts.growthSteps > 1}
                title={`Progressive snapshots: ${verdicts.growthSteps}`}
                detail="More than one growing streaming snapshot means the value fills in bit by bit instead of snapping in at the end."
              />
              <VerdictRow
                ok={verdicts.completedAsKind}
                title={
                  verdicts.completedAsKind
                    ? `Completed as ${kind}`
                    : "Did not complete as this kind"
                }
                detail="The final block must carry a complete envelope for this kind so the real component renders the finished value."
              />
            </>
          )}
        </div>
      </aside>
    </div>
  );
}
