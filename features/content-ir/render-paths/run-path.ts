/**
 * Run one {@link RenderPathId} for real and report what the reader would get.
 *
 * Pure of React so it is unit-testable and so the UI cannot quietly diverge
 * from what the checker asserts. Every function here drives PRODUCTION
 * classes — `StreamBlockAccumulator`, `applyIrKindRoute`,
 * `resolveProvisionalKindRender` — never a lookalike. Where an input has to be
 * constructed locally (the server's partial event), the path spec says so and
 * the verdict carries a note.
 */

import {
  IR_ENVELOPE_KEY,
  envelopeFromCompleteValue,
  isCanonicalBlockIR,
  type CanonicalBlockIR,
} from "@ai-matrx/content-ir";
import type { RenderBlockPayload } from "@/types/python-generated/stream-events";
import { StreamBlockAccumulator } from "@/features/agents/redux/execution-system/utils/stream-block-accumulator";
import {
  applyIrKindRoute,
  readIrRouteMarker,
  DB_KIND_COMPONENT_KEY,
  GENERIC_STRUCTURED_COMPONENT_KEY,
} from "@/features/content-ir/react/kind-route";
import { kindRegistry } from "@/features/content-ir/registry/kind-registry";
import {
  buildWireText,
  chunkWireText,
  recordFromUpsert,
  withKindFirst,
  type StreamTickRecord,
} from "@/features/content-ir/studio/stream-simulator";
import type { RenderPathId, RenderPathVerdict } from "./paths";

/** What a path run hands the UI: blocks to render + the honest verdict. */
export interface RenderPathRun {
  pathId: RenderPathId;
  /** Blocks in their FINAL routed form — what the renderer mounts. */
  blocks: RenderBlockPayload[];
  /** Per-chunk history; empty for non-streaming paths. */
  records: StreamTickRecord[];
  /** The wire text this path put on the stream (null when it streams nothing). */
  wire: string | null;
  verdict: RenderPathVerdict;
}

function envelopeOf(block: RenderBlockPayload): CanonicalBlockIR | null {
  const candidate = block.metadata?.[IR_ENVELOPE_KEY];
  return isCanonicalBlockIR(candidate) ? candidate : null;
}

/**
 * Did the kind's OWN component render?
 *
 * Deliberately not "does a component row exist" — that question is what let
 * every broken kind report healthy. This reads the route's actual answer:
 * `generic_structured` is the floor, not the component; `db_kind_component` is
 * a user-authored component; anything else is the kind's registered key.
 */
function reachedRealComponent(block: RoutedBlock): boolean {
  if (block.type === GENERIC_STRUCTURED_COMPONENT_KEY) return false;
  if (block.type === DB_KIND_COMPONENT_KEY) return true;
  return Boolean(readIrRouteMarker(block.metadata)) || block.serverData !== undefined;
}

/**
 * The projection `SafeBlockRenderer` routes — `data` becomes `serverData`.
 * Built the same way here so the verdict describes the SAME decision the
 * renderer below it is about to make, not a parallel guess at it.
 */
export interface RoutedBlock {
  type: string;
  serverData?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export function routeBlock(block: RenderBlockPayload): RoutedBlock {
  return applyIrKindRoute({
    type: block.type,
    ...(block.data ? { serverData: block.data } : {}),
    metadata: block.metadata,
  });
}

/** The block this run is ABOUT — the one whose envelope names the kind. */
function principalBlock(
  blocks: RenderBlockPayload[],
  kind: string,
): RenderBlockPayload | null {
  return (
    blocks.find((b) => envelopeOf(b)?.root.kind === kind) ?? blocks[0] ?? null
  );
}

function verdictFor(
  blocks: RenderBlockPayload[],
  kind: string,
  notes: string[],
): RenderPathVerdict {
  const source = principalBlock(blocks, kind);
  const principal = source ? routeBlock(source) : null;
  if (!principal || !source) {
    return {
      resolvedAs: "(nothing rendered)",
      reachedRealComponent: false,
      kindState: null,
      fallbackReason: null,
      notes: [...notes, "This path produced no block at all."],
    };
  }
  const marker = readIrRouteMarker(principal.metadata);
  return {
    resolvedAs: principal.type,
    reachedRealComponent: reachedRealComponent(principal),
    kindState: envelopeOf(source)?.root.kindState ?? null,
    fallbackReason: marker?.reason ?? null,
    notes,
  };
}

/**
 * Feed wire text through the REAL accumulator, chunk by chunk, routing every
 * upsert exactly as the chat renderer does.
 *
 * `chunkSize` mimics a provider's token cadence; the value only affects how
 * many intermediate frames are recorded, never the settled result.
 */
export function runStreamingPath(
  pathId: RenderPathId,
  kind: string,
  wire: string,
  chunkSize = 36,
): RenderPathRun {
  const latest = new Map<string, RenderBlockPayload>();
  const order: string[] = [];
  const records: StreamTickRecord[] = [];
  let chunkNo = 0;

  const accumulator = new StreamBlockAccumulator(`render-path-${pathId}`, ((
    payload: { requestId: string; block: RenderBlockPayload },
  ) => ({ type: "render-path/upsert", payload })) as never);

  const dispatch = (action: unknown) => {
    const block = (action as { payload?: { block?: RenderBlockPayload } })
      .payload?.block;
    if (!block) return action;
    // Keep the RAW block for the renderer — SafeBlockRenderer routes it itself,
    // and pre-routing here would mean the preview renders something the chat
    // renderer never sees. Route a projection alongside, purely to record what
    // the decision WAS on this frame.
    if (!latest.has(block.blockId)) order.push(block.blockId);
    latest.set(block.blockId, block);
    const routed = routeBlock(block);
    const record = recordFromUpsert(chunkNo, block);
    record.routed = {
      type: routed.type,
      hasServerData: routed.serverData !== undefined,
    };
    records.push(record);
    return action;
  };

  for (const chunk of chunkWireText(wire, chunkSize)) {
    chunkNo += 1;
    accumulator.ingest(chunk, dispatch);
  }
  chunkNo += 1;
  accumulator.finalize(dispatch);

  const blocks = order
    .map((id) => latest.get(id))
    .filter((b): b is RenderBlockPayload => Boolean(b))
    .filter((b) => (b.content ?? "").trim().length > 0);

  return {
    pathId,
    blocks,
    records,
    wire,
    verdict: verdictFor(blocks, kind, []),
  };
}

/** Wrap a payload the way the artifact system does. */
export function artifactWire(kind: string, value: Record<string, unknown>) {
  const body = JSON.stringify(withKindFirst(value, kind));
  return `<artifact type="${kind}" id="preview" title="${kind}">\n${body}\n</artifact>\n`;
}

/**
 * The RELOAD path: a stored value, already parsed, routed as a rehydrated
 * message is. No text is produced and none is parsed — in production either.
 */
export function runReloadPath(
  kind: string,
  value: Record<string, unknown>,
): RenderPathRun {
  const envelope = envelopeFromCompleteValue({ ...value }, kind);
  const block: RenderBlockPayload = {
    blockId: "reload-0",
    blockIndex: 0,
    type: "code",
    status: "complete",
    content: JSON.stringify(withKindFirst(value, kind), null, 2),
    metadata: { [IR_ENVELOPE_KEY]: envelope },
  };
  return {
    pathId: "reload",
    blocks: [block],
    records: [],
    wire: null,
    verdict: verdictFor([block], kind, []),
  };
}

/**
 * The SERVER-PARTIAL path. The rendering is production
 * (`resolveProvisionalKindRender` → `applyIrKindRoute`); the partial event is
 * built here rather than received from Python, and the verdict says so.
 */
export function runServerPartialPath(
  kind: string,
  value: Record<string, unknown>,
): RenderPathRun {
  const envelope = envelopeFromCompleteValue({ ...value }, kind);
  const block: RenderBlockPayload = {
    blockId: "partial-0",
    blockIndex: 0,
    type: "code",
    status: "streaming",
    content: JSON.stringify(withKindFirst(value, kind)),
    metadata: {
      __ir_partial: {
        seq: 1,
        root: { ...envelope.root, kindState: "speculative", status: "streaming" },
      },
      [IR_ENVELOPE_KEY]: envelope,
    },
  };
  return {
    pathId: "server_partial",
    blocks: [block],
    records: [],
    wire: null,
    verdict: verdictFor([block], kind, [
      "The partial event was constructed in this browser, not received from the server — this checks the render half only.",
    ]),
  };
}

/** Build the wire text for a streaming path. */
export function wireForPath(
  pathId: RenderPathId,
  kind: string,
  value: Record<string, unknown>,
): string | null {
  if (pathId === "chat_fence") return buildWireText(value, kind, "fenced");
  if (pathId === "chat_bare") return buildWireText(value, kind, "bare");
  if (pathId === "chat_artifact") return artifactWire(kind, value);
  return null;
}

/** Run whichever path was asked for. `direct`, `loading` and `input` mount a
 * component rather than producing blocks, so the UI owns those. */
export function runRenderPath(
  pathId: RenderPathId,
  kind: string,
  value: Record<string, unknown>,
  chunkSize = 36,
): RenderPathRun | null {
  const wire = wireForPath(pathId, kind, value);
  if (wire !== null) return runStreamingPath(pathId, kind, wire, chunkSize);
  if (pathId === "reload") return runReloadPath(kind, value);
  if (pathId === "server_partial") return runServerPartialPath(kind, value);
  return null;
}

/** Is this kind's schema loaded? Shown beside a verdict, because an
 * `unverified` result means the shape has no contract, not a bad payload. */
export function hasSchema(kind: string): boolean {
  return kindRegistry.getSchema(kind) !== undefined;
}
