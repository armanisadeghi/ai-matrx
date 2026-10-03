"use client";
import type { AnswerEditRemarkMeta } from "@ai-matrx/chat/agents/redux/execution-system/instance-resources/remarks";
import { durableRecordId } from "@ai-matrx/kit/ids";
import React, { useCallback } from "react";
import { BlockComponents, LoadingComponents } from "./BlockComponentRegistry";
import { resolveArtifactDef } from "@/features/canvas/artifact-types/artifact-type-registry";
import {
  ArtifactRender,
  hasArtifactRenderer,
} from "@/features/canvas/artifact-types/artifact-renderers";
import { useAppSelector } from "@/lib/redux/hooks";
import { useMachineFramesVisible } from "@ai-matrx/chat/agents/components/shared/transcript-audience";
import {
  selectHideReasoning,
  selectHideToolResults,
} from "@ai-matrx/chat/agents/redux/execution-system/instance-ui-state/instance-ui-state.selectors";
import { GENERIC_STRUCTURED_COMPONENT_KEY } from "@/features/content-ir/react/kind-route";
import {
  routeBlockAtRegistryVersion,
  routeBlockNow,
} from "@/features/content-ir/react/route-at-version";
import { useContentIrKindVersion } from "@/features/content-ir/react/use-registry-repaint";
import { useEnsureKindRenderable } from "@/features/content-ir/react/ensure-kind-renderable";
import { resolveKindLoadingComponent } from "@/features/content-ir/react/loading/kind-loading-registry";
import { resolveLoadingSlugForKind } from "@/features/content-ir/react/loading/resolve-loading-slug";
import { earlyKeysFromValue } from "@/features/content-ir/react/loading/kind-loading.types";
import { readEnvelope } from "@/features/content-ir/redux/render-block-envelope";
import {
  firstKindSlug,
  jsonKindSignal,
} from "@/features/content-ir/surfaces/json-kind-signal";
import { withIrEnvelope } from "@/features/content-ir/registry/region-envelope-memo";
import {
  resolveAnnouncedKindLoading,
  resolveProvisionalKindRender,
} from "@/features/content-ir/react/partial-kind-route";
import {
  ProvisionalKindBoundary,
  ProvisionalKindFrame,
} from "@/features/content-ir/react/ProvisionalKindBoundary";
import { applyIrKindRoute } from "@/features/content-ir/react/kind-route";
import { componentRegistry } from "@/features/content-ir/registry/component-registry";
import {
  IR_ENVELOPE_KEY,
  IR_VERSION,
  readPartialKindEvent,
  reconstructRegionValue,
  type CanonicalBlockIR,
} from "@ai-matrx/content-ir";
import {
  KindRecordChrome,
  kindHasRecordChrome,
} from "@/features/content-ir/records/KindRecordChrome";
import {
  isBlockLoading,
  resolveBlockDispatch,
  reportUnregisteredBlockType,
  type BlockDispatchContext,
  type RenderBlock,
} from "./block-dispatch";

// The flat render-block shape lives with the dispatch registry now; re-export
// so the existing importers (EnhancedChatMarkdown, SafeBlockRenderer, …) keep
// working unchanged.
export type { RenderBlock } from "./block-dispatch";

interface BlockRendererProps {
  requestId?: string;
  block: RenderBlock;
  index: number;
  isStreamActive?: boolean;
  onContentChange?: (newContent: string) => void;
  /** Owning message context forwarded to canonical artifact renderers. */
  conversationId?: string;
  messageId?: string;
  taskId?: string;
  isLastReasoningBlock?: boolean;
  /** Generic handler: replaces `original` substring with `replacement` in the full content string. */
  replaceBlockContent: (original: string, replacement: string, remark?: AnswerEditRemarkMeta) => void;
  handleOpenEditor: () => void;
  /**
   * Streaming partial kinds ONLY. Set on the recursive render of a
   * PROVISIONAL block so the loading gates below (which exist to hide a
   * half-arrived payload) stand down and the real kind component renders the
   * provisional value. Never set by an ordinary caller.
   */
  suppressLoadingGate?: boolean;
  outputSchema?: unknown | null;
}

/**
 * canvasType → its dedicated streaming skeleton — LEGACY (non-kind) blocks
 * ONLY. A block carrying a `metadata.__ir` envelope went through the kind
 * system and follows the ONE loading sequence instead (kind loader → real
 * component from its first renderable frame); this table serves the old
 * envelope-less blocks (history messages, direct typed fences) so their
 * behavior stays untouched. Do not add kinds here — the per-kind streaming
 * knob is the bridge ({provisional: true} + its too-thin gate).
 */
const ARTIFACT_LOADING_COMPONENTS: Partial<
  Record<string, () => React.ReactElement>
> = {
  quiz: LoadingComponents.QuizLoading,
  presentation: LoadingComponents.PresentationLoading,
  recipe: LoadingComponents.RecipeLoading,
  timeline: LoadingComponents.TimelineLoading,
  research: LoadingComponents.ResearchLoading,
  resources: LoadingComponents.ResourcesLoading,
  progress: LoadingComponents.ProgressLoading,
  comparison: LoadingComponents.ComparisonLoading,
  troubleshooting: LoadingComponents.TroubleshootingLoading,
  "decision-tree": LoadingComponents.DecisionTreeLoading,
  diagram: LoadingComponents.DiagramLoading,
  math_problem: LoadingComponents.MathProblemLoading,
};

/**
 * The pending window for a streaming JSON region: the envelope exists but the
 * region cannot render its real component yet — either the `__kind`
 * discriminator hasn't streamed in (`kind` empty), or the kind IS identified
 * but its schema is still cold-fetching (`kindState === "pending_schema"`, a
 * db/cloud kind's window). Rendering the raw text here is the "shows the
 * whole JSON, converts only when done" flash — instead the loading library
 * renders (registry-driven, fed by the early keys). Gated on `type ===
 * "code"` so a block the splitter/accumulator already typed keeps its own
 * type-aware loader.
 *
 * Returns the envelope when pending so the caller can select + feed the
 * loading component; null otherwise.
 */

/**
 * The block's instance value for the record chrome, in the SAME descending
 * fidelity every kind consumer uses: the envelope first (it merges residues
 * back, so nothing a producer sent is lost), a bare `JSON.parse` as the floor,
 * and `null` when the region genuinely never parsed. `null` is not a failure to
 * hide — the chrome prints it as a sentence instead of offering a Save that
 * would write nothing.
 */
function readRecordValue(block: {
  content?: string | null;
  metadata?: Record<string, unknown>;
}): Record<string, unknown> | null {
  const envelope = readEnvelope(block.metadata);
  const value = envelope
    ? reconstructRegionValue(envelope)
    : (() => {
        try {
          return JSON.parse(block.content ?? "") as unknown;
        } catch {
          return null;
        }
      })();
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function pendingStructuredEnvelope(block: {
  type: string;
  content?: string | null;
  metadata?: Record<string, unknown>;
  isStreamingBlock?: boolean;
}): CanonicalBlockIR | null {
  if (block.type !== "code") return null;
  const envelope = readEnvelope(block.metadata);
  if (!envelope) return unparsedKindPendingEnvelope(block);
  if (envelope.root.status !== "streaming") {
    // The parser gave up on a region whose BLOCK is still streaming (an array
    // root — the kernel parses one object — or a grammar slip mid-payload):
    // it names no kind, so the first-key rule decides exactly as it does for
    // a region no parser opened (A6). A settled block falls through.
    if (envelope.root.kind) {
      // Identified, the BLOCK still streaming, the route says "code": the
      // region's own envelope may already read complete (its last chunk) but
      // the block is not settled — the kind's loader, whatever the registry
      // state. Bounded by the stream: finalize settles the block.
      if (block.isStreamingBlock) return envelope;
      // Identified, SETTLED, and still "code" after the route: the route is
      // holding its verdict because the component registry has not settled
      // (THE COLD-VERDICT RULE). Show the kind's loader, never the raw card;
      // the settle repaints this kind (@ai-matrx/content-ir-react ≥ 0.13.0)
      // and the route answers — its component or the generic floor (A11).
      return componentRegistry.hasSettled() ? null : envelope;
    }
    return unparsedKindPendingEnvelope(block);
  }
  if (envelope.root.kind) {
    // Identified but UNROUTED. This function sees the block AFTER the kind
    // route ran, so a still-"code" type means the route had nothing to say
    // yet — the schema is cold-fetching, or the definition/component rows are
    // still in flight (the ensure-hook's fetches land a beat after the kind
    // streams in). That beat used to render ONE raw-JSON frame before the
    // registry repaint swapped the real component in (caught live,
    // 2026-08-26). Identified + streaming + unrouted → the loader, always;
    // the window is bounded by the stream, and a COMPLETE unrouted region
    // still falls through to the code block (the honest final answer).
    return envelope;
  }
  // No kind yet: THE FIRST-KEY RULE (Arman, 2026-09-30). Until the first key
  // has arrived it COULD be a kind → loader. A `__kind` key anywhere → it IS
  // one (the parser names it in a beat) → loader. A complete first key that is
  // not `__kind`, with no `__kind` seen → plain JSON, streamed LIVE below (a
  // loader is a promise of a component, never a lid over content).
  return jsonKindSignal(block.content) === "not_kind" ? null : envelope;
}

/**
 * The terminal envelope for a settled block that arrived without one: reload
 * has only the original text when an interrupted run could not stamp a
 * COMPLETE persistence envelope, so the stream's parser runs at this terminal
 * boundary — never on a live prefix — and keeps its error status intact.
 */
export function withTerminalEnvelope<
  T extends {
    content?: string | null;
    metadata?: Record<string, unknown>;
    isStreamingBlock?: boolean;
  },
>(block: T, isStreamActive: boolean | undefined): T {
  // Settled = its producer says so (`isStreamingBlock === false`: a closed
  // region of a live accumulator — the rest of the MESSAGE may still stream,
  // V5), or, with no per-block word (a static split), the message has ended.
  const settled =
    block.isStreamingBlock === false || (!isStreamActive && !block.isStreamingBlock);
  if (!settled || readEnvelope(block.metadata)) {
    return block;
  }
  const metadata = withIrEnvelope(block.content ?? "", block.metadata, {
    allowTerminalError: true,
  });
  return metadata !== block.metadata ? { ...block, metadata } : block;
}

/**
 * A SETTLED json region that names its kind in its text while the parser
 * could not name it — the payload broke before (or around) its `__kind`, or
 * no envelope exists at all — is that kind's BROKEN state, never the raw JSON
 * card (A10, the never-raw law). The route takes it with `kindState: "raw"`
 * (the kernel's "checked and failed" word, FEATURE.md), which is the
 * broken-instance floor. A complete kindless envelope is genuine JSON (its
 * nested kinds are the recovery pass's), and a streaming block is the pending
 * gate's.
 */
export function settleBrokenKindRoute<
  T extends {
    type: string;
    content?: string | null;
    metadata?: Record<string, unknown>;
    isStreamingBlock?: boolean;
  },
>(block: T): T {
  if (block.type !== "code" || block.isStreamingBlock) return block;
  const slug = firstKindSlug(block.content ?? "");
  if (!slug) return block;
  const envelope = readEnvelope(block.metadata);
  if (envelope?.root.kind || envelope?.root.status === "complete") return block;
  const broken: CanonicalBlockIR = {
    v: IR_VERSION,
    engine: "fe-kind-parser",
    fingerprint: "broken-kind-text",
    root: {
      role: "structured",
      kind: slug,
      kindState: "raw",
      discriminator: { format: "json", key: "__kind" },
      status: "error",
      path: [],
      value: {},
      residue: null,
    },
  };
  return applyIrKindRoute({
    ...block,
    metadata: { ...(block.metadata ?? {}), [IR_ENVELOPE_KEY]: broken },
  } as T & { content: string }) as T;
}

/**
 * A streaming code block NO parser opened for (a fence with no language, or
 * ```jsonc / ```json5, or any arrival path that stamps no envelope) still
 * obeys the first-key rule: JSON text that COULD be a kind shows a kind
 * loader, never raw. The envelope is render-local — a loader's input only,
 * seeded nowhere; the host's region-close recovery decides what it really is.
 */
function unparsedKindPendingEnvelope(block: {
  content?: string | null;
  isStreamingBlock?: boolean;
}): CanonicalBlockIR | null {
  if (!block.isStreamingBlock) return null;
  const text = block.content ?? "";
  if (!/^\s*[[{]/.test(text)) return null;
  if (jsonKindSignal(text) === "not_kind") return null;
  return {
    v: IR_VERSION,
    engine: "fe-kind-parser",
    fingerprint: "first-key-signal",
    root: {
      role: "structured",
      kind: firstKindSlug(text) ?? "",
      kindState: "pending_kind",
      discriminator: { format: "json", key: "__kind" },
      status: "streaming",
      path: [],
      value: {},
      residue: null,
    },
  };
}

/**
 * What the renderer shows in place of the block's own dispatch while its kind
 * is still arriving: the provisional render (Stage 1.5), or a kind loader
 * (Stages 1.6, 2, 2.5 and the kind half of Stage 3). Null → the block is
 * dispatched by its routed type.
 */
export type BlockRenderGate =
  | {
      kind: "provisional";
      provisional: NonNullable<
        ReturnType<typeof resolveProvisionalKindRender<RenderBlock>>
      >;
    }
  | { kind: "loader"; envelope: CanonicalBlockIR }
  | null;

export interface BlockRenderDecision {
  /** The input with its terminal envelope (settled blocks of a settled message). */
  rawBlock: RenderBlock;
  /** The routed block — what the dispatch registry receives. */
  block: RenderBlock;
  gate: BlockRenderGate;
}

/**
 * THE DECISION BlockRenderer makes, as a pure function (V5): terminal
 * envelope, kind route, broken-kind settle, then the loading gates in order.
 * BlockRenderer calls it; so does the frame judge (`draws-raw-kind-json.ts`),
 * so a guard can never drift from what the reader sees. `isStreamActive` is
 * the MESSAGE's stream state, exactly as the renderer receives it — a settled
 * block inside a still-streaming message is judged the way it is drawn.
 * `route` is the kind route at a registry version (BlockRenderer passes its
 * versioned, memoised route; pure callers take the uncached one).
 */
export function decideBlockRender(
  inputBlock: RenderBlock,
  {
    isStreamActive,
    suppressLoadingGate = false,
    route = routeBlockNow,
  }: {
    isStreamActive?: boolean;
    suppressLoadingGate?: boolean;
    route?: (block: RenderBlock) => RenderBlock;
  } = {},
): BlockRenderDecision {
  const rawBlock = withTerminalEnvelope(inputBlock, isStreamActive);
  const block = settleBrokenKindRoute(route(rawBlock));
  const decided = (gate: BlockRenderGate): BlockRenderDecision => ({
    rawBlock,
    block,
    gate,
  });

  // Stage 1.5 — streaming partial kinds (server-announced provisional value).
  const provisional = suppressLoadingGate
    ? null
    : resolveProvisionalKindRender(rawBlock, { streamActive: isStreamActive });
  if (provisional) return decided({ kind: "provisional", provisional });

  // Stage 1.6 — announced, not yet renderable: that kind's loader.
  const announced = suppressLoadingGate
    ? null
    : resolveAnnouncedKindLoading(rawBlock, { streamActive: isStreamActive });
  if (announced) return decided({ kind: "loader", envelope: announced.envelope });

  // Stage 2 — the pending gate (the first-key rule).
  const pendingEnvelope = pendingStructuredEnvelope(block);
  if (pendingEnvelope) return decided({ kind: "loader", envelope: pendingEnvelope });

  // Stage 2.5 — identified, routed to the generic floor mid-stream: loader.
  if (block.type === GENERIC_STRUCTURED_COMPONENT_KEY && !suppressLoadingGate) {
    const genericEnvelope = readEnvelope(block.metadata);
    if (genericEnvelope?.root.kind && genericEnvelope.root.status === "streaming") {
      return decided({ kind: "loader", envelope: genericEnvelope });
    }
  }

  // Stage 3 (kind half) — a materializable kind block still loading with no
  // renderable frame yet shows the kind's declared loader.
  if (block.type !== "artifact" && !suppressLoadingGate) {
    const def = resolveArtifactDef(block.type);
    if (def && hasArtifactRenderer(def.canvasType) && isBlockLoading(block)) {
      const kindEnvelope = readEnvelope(block.metadata);
      if (kindEnvelope?.root.kind && block.serverData === undefined) {
        return decided({ kind: "loader", envelope: kindEnvelope });
      }
    }
  }

  return decided(null);
}

/**
 * The registry-driven pending loader: picks the kind's declared
 * `loading_component` slug (kind_definition.metadata, read from the warm/cold
 * registry) — generic default otherwise — and feeds it the early keys the
 * parser has surfaced so far (title, loading_message, …).
 */
const PendingStructuredBlock: React.FC<{ envelope: CanonicalBlockIR }> = ({
  envelope,
}) => {
  const kind = envelope.root.kind || undefined;
  // Declared → derived → generic, resolved by the ONE module that owns that
  // order (`resolve-loading-slug.ts`). It also contains the trap: an INVALID
  // declaration must fall through to derivation rather than short-circuiting
  // to the shapeless generic skeleton, which is why this is never re-inlined
  // as a `??` chain.
  const slug = resolveLoadingSlugForKind(kind).slug;
  const early = earlyKeysFromValue(envelope.root.value, kind);
  // createElement over JSX: the loader is a STATIC module-level component
  // selected from the registry at render time (not created during render) —
  // this form makes that legible to react-hooks/static-components.
  // The full partial value rides along (KindLoadingProps.value) so data-fed
  // smart loaders can perform the arrival; skeleton loaders ignore it.
  return React.createElement(resolveKindLoadingComponent(slug), {
    ...early,
    value: envelope.root.value ?? null,
  });
};

/**
 * Renders individual content blocks through four ordered stages:
 *
 *  1. KIND ROUTE (Shape blocks, first-class) — `applyIrKindRoute`: a block
 *     whose `metadata.__ir` envelope resolved a REGISTERED kind routes through
 *     the kind registry (`resolveComponent` / legacy bridge) before any
 *     type-keyed dispatch. This is how bare/fenced JSON `flashcard_set` —
 *     which the legacy detectors can only call "code" — becomes real
 *     flashcards, live while streaming.
 *  1.5 PROVISIONAL KIND (streaming partial kinds) — a block carrying a
 *     `metadata.__ir_partial` `partial` event for an opted-in kind renders
 *     that provisional value through the SAME component the final value uses,
 *     marked "still arriving". Terminal events produce nothing here, so the
 *     final value replaces the provisional render in one frame.
 *  2. PENDING SKELETON — a still-streaming JSON region with an unresolved
 *     kind shows a neutral skeleton instead of flashing raw text.
 *  3. UNIFIED ARTIFACT RENDERER — standalone materializable blocks render
 *     through the single shared artifact path (chat/canvas/artifact identical).
 *  4. DISPATCH REGISTRY — the declarative, crosswalk-classified table in
 *     block-dispatch.tsx (protocol / scalar_generic / shape / opaque). An
 *     unregistered type SCREAMS (reportUnregisteredBlockType) and renders as
 *     basic markdown — never a silent default.
 *
 * Components are lazy-loaded (see BlockComponentRegistry) for code splitting.
 */
export const BlockRenderer: React.FC<BlockRendererProps> = ({
  requestId,
  block: inputBlock,
  index,
  isStreamActive,
  onContentChange,
  conversationId,
  messageId,
  taskId,
  isLastReasoningBlock,
  replaceBlockContent,
  handleOpenEditor,
  suppressLoadingGate = false,
  outputSchema = null,
}) => {
  // TWO MEANINGS, TWO FIELDS. `messageId` is the TRANSCRIPT KEY — always
  // present (a client-temp answer included) and used for UI keys, anchors,
  // canvas de-duplication and local state. `durableMessageId` is the DATABASE
  // identity — null-filtered through the seam (@ai-matrx/kit/ids)
  // and the only one a database read or write may use. A block that writes
  // provenance takes `durableMessageId`; never the transcript key.
  const durableMessageId = durableRecordId(messageId) ?? undefined;
  // Reload has only the original text when an interrupted run could not stamp
  // a COMPLETE persistence envelope. Reuse the stream's parser at this terminal
  // boundary, never on a live prefix, and keep its error status intact.
  const terminalBlock = withTerminalEnvelope(inputBlock, isStreamActive);
  // Late-arrival repaint, GRANULAR: subscribe to THIS block's envelope kind
  // only — a schema/component that lands after this block rendered (cold
  // fetch losing the race with region end) re-runs the route on the frozen
  // envelope, while arrivals for OTHER kinds never touch this block.
  const partialEvent = readPartialKindEvent(terminalBlock.metadata);
  const announcedKind =
    partialEvent?.state === "partial"
      ? partialEvent.root.kind
      : partialEvent?.kind;
  const envelopeKind =
    readEnvelope(terminalBlock.metadata)?.root.kind ?? announcedKind ?? null;
  const kindRouteVersion = useContentIrKindVersion(envelopeKind);
  // Fetch-from-render (the convergence seam): rendering a kind block IS the
  // demand for its schema + component, on EVERY arrival path — live stream,
  // DB reload, workflow. Before this, only the live accumulator requested
  // them, so history blocks sat unrendered until something else warmed the
  // registry ("works after you navigate away and come back"). Idempotent —
  // both registries dedupe in-flight requests and remember misses.
  useEnsureKindRenderable(envelopeKind);

  // Stage 1 — content-ir kind routing: a block whose metadata.__ir envelope
  // resolved a registered kind renders as that kind's component
  // (envelope-derived serverData) — e.g. bare/fenced JSON flashcard_set, which
  // the legacy detectors can only call "code". Everything else passes through
  // untouched.
  // 🚨 THE VERSION IS AN ARGUMENT, NEVER A DEPENDENCY (DD-215c). This used to
  // be a `useMemo` over `applyIrKindRoute(rawBlock)` whose invalidation key was
  // `void kindRouteVersion;` and whose comment said React Compiler was off.
  // React Compiler is ON (`next.config.js` reactCompiler: true); it re-infers
  // memo inputs from data flow, a `void`-ed value is not an input, and the
  // shipped cache was keyed on the block alone — so a block that mounted before
  // its organization's component row landed kept the platform's bundled
  // component for the life of the mount, silently, on production. Jest does not
  // run the compiler, which is why three lanes' tests said this worked.
  // `routeBlockAtRegistryVersion` takes the version, so no compiler pass can
  // decide it is dead. Guard: `pnpm check:registry-repaint`.
  // The whole decision — route, broken settle, loading gates — is ONE pure
  // function the frame judge calls too (`decideBlockRender`, V5).
  const decision = decideBlockRender(inputBlock, {
    isStreamActive,
    suppressLoadingGate,
    route: (b) => routeBlockAtRegistryVersion(b, kindRouteVersion),
  });
  const block = decision.block;

  const interruptedEnvelope = readEnvelope(block.metadata);
  const hasInterruptedKind = Boolean(
    !isStreamActive &&
    interruptedEnvelope?.root.kind &&
    interruptedEnvelope.root.status === "error",
  );

  // Per-conversation display flags. When a surface has `hideReasoning` or
  // `hideToolResults` set on its `instanceUIState`, the matching block
  // types self-gate in their dispatch registrations so there's exactly one
  // source of truth — no scattered conditional-render sites, no missed
  // branches, no need for parents to remember to filter.
  const hideReasoning = useAppSelector(
    conversationId ? selectHideReasoning(conversationId) : () => false,
  );
  const hideToolResults = useAppSelector(
    conversationId ? selectHideToolResults(conversationId) : () => false,
  );
  // Thinking is a machine frame: the transcript's declared audience decides.
  const machineFramesVisible = useMachineFramesVisible();

  /**
   * RECORD CHROME (THE WRAPPER LAW's other half). A kind component renders
   * BARE; the host draws the frame. A kind that declares the `record`
   * disposition (`features/content-ir/records/kind-record-registry.ts`) gets a
   * strip under its finished block: the confirmation badge for the row that
   * chat turn already wrote, the organization's count of that kind with a link
   * to its table, and the Confirm / Archive doors.
   *
   * Registry-keyed, never kind-specific: `wine_tasting` is only the first slug
   * in the table. Drawn ONLY on a settled block — while the message streams the
   * server has not finished writing the row, so a strip then would be a
   * promise the database has not kept yet.
   */
  const recordChromeKind =
    envelopeKind && !suppressLoadingGate && kindHasRecordChrome(envelopeKind)
      ? envelopeKind
      : null;
  const withRecordChrome = <T extends React.ReactElement | null>(
    el: T,
  ): T | React.ReactElement => {
    if (el && hasInterruptedKind) {
      return (
        <div key={index} data-incomplete-kind={interruptedEnvelope?.root.kind}>
          <p
            role="status"
            className="mb-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-800 dark:text-amber-200"
          >
            This response is incomplete. The content received so far is shown
            below.
          </p>
          {el}
        </div>
      );
    }
    if (
      !el ||
      !recordChromeKind ||
      isStreamActive ||
      isBlockLoading(block) ||
      readEnvelope(block.metadata)?.root.status !== "complete"
    ) {
      return el;
    }
    return (
      <div key={index} data-kind-record-host={recordChromeKind}>
        {el}
        <KindRecordChrome
          kind={recordChromeKind}
          durableMessageId={durableMessageId}
          conversationId={conversationId}
          value={readRecordValue(block)}
          fingerprint={readEnvelope(block.metadata)?.fingerprint ?? null}
        />
      </div>
    );
  };

  const renderFallbackContent = useCallback(
    (content: string, language: string = "json") => {
      return (
        <BlockComponents.CodeBlock
          key={index}
          code={content}
          language={language}
          fontSize={16}
          className="my-3"
          isStreamActive={isStreamActive}
        />
      );
    },
    [index, isStreamActive],
  );

  const blockType = String(block.type);
  const renderBasicMarkdown = useCallback(
    (content: string) => {
      return (
        <BlockComponents.BasicMarkdownContent
          key={index}
          content={content}
          isStreamActive={isStreamActive}
          onEditRequest={onContentChange ? handleOpenEditor : undefined}
          messageId={messageId}
          showCopyButton={false}
          tableRenderDiagnostic={{
            blockType,
            conversationId,
            messageId,
            requestId,
          }}
        />
      );
    },
    [
      index,
      isStreamActive,
      onContentChange,
      handleOpenEditor,
      messageId,
      blockType,
      conversationId,
      requestId,
    ],
  );

  // Stage 1.5 — STREAMING PARTIAL KINDS: the server announced what this region
  // is and what has arrived so far (`metadata.__ir_partial`). A provisional
  // value for an opted-in kind renders through the SAME component the final
  // value renders in, so the block fills in instead of sitting behind a
  // skeleton — and the terminal events (`superseded` / `retracted`) produce no
  // provisional render at all, so the swap to the final value happens in the
  // same frame with no flicker. Withheld by default per kind; a component that
  // throws anyway is caught and falls back to this kind's loading skeleton.
  // Contract: common-docs/systems/architecture/content-ir/FEATURE.md
  if (decision.gate?.kind === "provisional") {
    const provisional = decision.gate.provisional;
    return (
      <ProvisionalKindBoundary
        key={index}
        kind={provisional.kind}
        fallback={<PendingStructuredBlock envelope={provisional.envelope} />}
      >
        <ProvisionalKindFrame>
          <BlockRenderer
            requestId={requestId}
            block={provisional.block}
            index={index}
            isStreamActive={isStreamActive}
            onContentChange={onContentChange}
            conversationId={conversationId}
            messageId={messageId}
            taskId={taskId}
            isLastReasoningBlock={isLastReasoningBlock}
            replaceBlockContent={replaceBlockContent}
            handleOpenEditor={handleOpenEditor}
            suppressLoadingGate
            outputSchema={outputSchema}
          />
        </ProvisionalKindFrame>
      </ProvisionalKindBoundary>
    );
  }

  // Stages 1.6, 2, 2.5 and Stage 3's kind half — a kind still arriving shows
  // ITS loader, never its raw text (see `decideBlockRender` for each stage):
  // the server announced the kind (the only signal a WORKFLOW run page has —
  // Arman, 2026-08-21), the first-key rule says it could be a kind, the
  // component is still cold-fetching mid-stream, or a materializable kind
  // block has no renderable frame yet. (After all hooks, so the early return
  // never changes hook order.)
  if (decision.gate?.kind === "loader") {
    return <PendingStructuredBlock key={index} envelope={decision.gate.envelope} />;
  }

  // Stage 3 — unified artifact renderer (Wave B): standalone materializable
  // blocks whose type has a unified renderer are rendered through the single
  // shared path (chat/canvas/artifact identical). `artifact` blocks go through
  // the dedicated `artifact` registration below (UUID id → render-by-id; else
  // inline ArtifactBlock chrome). Standalone materializable types (```tasks,
  // ```mermaid, JSON blocks, …) route through the unified renderer here.
  if (block.type !== "artifact") {
    const _def = resolveArtifactDef(block.type);
    if (_def && hasArtifactRenderer(_def.canvasType)) {
      // Gate on the BLOCK's own completion, not the global message stream.
      // Previously every block received the message-wide `isStreamActive`, so a
      // quiz/slide-deck that had fully streamed in still showed its loader until
      // the ENTIRE message finished — the "loading forever" bug. A block is
      // "loading" only while its own content is incomplete (isStreamingBlock /
      // metadata.isComplete === false). While loading, show the type-aware
      // skeleton instead of the generic "Initializing Matrx" loader; once
      // complete, render immediately with isStreamActive=false even if later
      // blocks in the same message are still streaming.
      // (Regression guard: forcing `isStreamActive={false}` + a loader for all
      // types is what made tables/flashcards batch — see the doctrine that all
      // render blocks stream live.)
      // `suppressLoadingGate` is the provisional render (Stage 1.5): the
      // point is to REPLACE this skeleton with the real component fed the
      // provisional value.
      const loading = !suppressLoadingGate && isBlockLoading(block);
      // ONE LOADING SEQUENCE for kind blocks (Arman, 2026-08-24): a block
      // that came through the kind system (`metadata.__ir`) never hits the
      // legacy type-keyed loader gate. If its bridge produced a renderable
      // frame (serverData) mid-stream, the REAL component renders it live and
      // fills in; if the bridge declined (value below its first renderable
      // unit, or a wait-for-complete kind), the kind's DECLARED loader shows.
      // The per-kind knob is the bridge itself ({provisional: true} + its
      // own too-thin gate) — never a hardcoded type list here.
      // (A kind block with no renderable frame never reaches here — its
      // loader is `decideBlockRender`'s; a renderable frame renders live.)
      const kindEnvelope = loading ? readEnvelope(block.metadata) : null;
      if (loading && !kindEnvelope?.root.kind) {
        // Legacy blocks (no envelope — old messages, direct typed fences)
        // keep the bespoke type-keyed skeletons unchanged.
        const Loader = ARTIFACT_LOADING_COMPONENTS[_def.canvasType];
        if (Loader) {
          return <Loader key={index} />;
        }
      }
      return withRecordChrome(
        <ArtifactRender
          key={index}
          canvasType={_def.canvasType}
          mode="inline"
          raw={block.content}
          serverData={block.serverData}
          metadata={block.metadata as Record<string, unknown> | undefined}
          taskId={taskId}
          conversationId={conversationId}
          messageId={messageId}
          blockIndex={index}
          isStreamActive={loading}
          // Restore the legacy per-type inline-edit write-back (the old switch
          // cases passed this; the unified path must too) — editable blocks
          // persist to cx_message.content + bust the server cache. Gated on
          // not-streaming, exactly like the old `case "table"`.
          onContentChange={
            !loading && replaceBlockContent
              ? (updated: string) => replaceBlockContent(block.content, updated, { origin: "kind" })
              : undefined
          }
        />,
      );
    }
  }

  // Stage 4 — the declarative dispatch registry (block-dispatch.tsx),
  // organized by crosswalk classification and exhaustive against the
  // generated block-type unions.
  const ctx: BlockDispatchContext = {
    block,
    index,
    isStreamActive,
    conversationId,
    messageId,
    durableMessageId,
    taskId,
    requestId,
    isLastReasoningBlock,
    hideReasoning,
    hideToolResults,
    machineFramesVisible,
    replaceBlockContent,
    renderBasicMarkdown,
    outputSchema,
  };

  const dispatch = resolveBlockDispatch(block.type);
  if (dispatch) {
    return withRecordChrome(dispatch(ctx));
  }

  // No registration — a genuinely unknown type (Python outran the generated
  // unions, or a registration was deleted). SCREAM, then render the content
  // as basic markdown so nothing the model produced is hidden.
  reportUnregisteredBlockType(block.type, {
    conversationId,
    messageId,
    requestId,
  });
  if (block.content) return renderBasicMarkdown(block.content);
  // Nothing to show as markdown: never a silent blank. The honest catch-all
  // names the type and shows the payload (a typed part with no renderer yet).
  return (
    <BlockComponents.UnknownDataEventBlock
      key={index}
      dataType={block.type}
      data={(block.serverData as Record<string, unknown> | undefined) ?? {}}
      conversationId={conversationId}
      messageId={messageId}
    />
  );
};
