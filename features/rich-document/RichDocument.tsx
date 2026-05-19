"use client";

// features/rich-document/RichDocument.tsx
//
// PHASE 0 — skeleton. Renders the underlying content engine and registers
// against the remote-surface slice when actionsVariant === "remote". The
// action REGISTRY is empty in Phase 0, so the inline variants ("bar",
// "mini-bar", "menu", "hover-menu") have nothing to render; they're left as
// no-ops until Phase 2 plugs in the variant renderers.
//
// CLIENT-ONLY. MarkdownStream is `dynamic({ ssr: false })`. RichDocument
// inherits the same boundary — server components cannot render this
// directly. Either pre-fetch content in a server component and pass to a
// client child, or render a placeholder that hydrates into RichDocument
// client-side.
//
// React Compiler note: this codebase has the compiler on, so we DO NOT use
// useMemo / useCallback / React.memo (per CLAUDE.md). The compiler handles
// memoization based on input dependencies.
//
// See features/rich-document/FEATURE.md for the architecture, the lifecycle
// invariants of the remote-surface registry, and the per-source action
// compatibility matrix.

import * as React from "react";
import dynamic from "next/dynamic";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { cn } from "@/lib/utils";
import {
  registerProvider,
  unregisterProvider,
} from "./redux/actionSurfacesSlice";
import { getSourceAdapter } from "./actions/sources";
import { shortHash } from "./actions/sources/raw";
import type {
  ContentSource,
  RichDocumentActionContext,
  RichDocumentActionsProp,
  RichDocumentActionsVariant,
  SourceExtensions,
} from "./types";
import type { ServerProcessedBlock } from "@/components/mardown-display/chat-markdown/EnhancedChatMarkdown";
import type { TypedStreamEvent } from "@/components/mardown-display/chat-markdown/types";

// Lazy import the engine — same shell pattern as MarkdownStream itself so
// the heavy block registry / code highlighter / jspdf / html2canvas chunks
// only land when RichDocument actually mounts.
const MarkdownStream = dynamic(() => import("@/components/MarkdownStream"), {
  ssr: false,
});

export interface RichDocumentProps {
  // ---- Content (pass one of `content`, `events`, `serverProcessedBlocks`) ----
  content?: string;
  events?: TypedStreamEvent[];
  serverProcessedBlocks?: ServerProcessedBlock[];
  taskId?: string;
  requestId?: string;
  turnId?: string;
  conversationId?: string;
  isStreamActive?: boolean;

  // ---- Source identification ----
  /** Required. Use { type: "raw" } when the source is genuinely unknown. */
  source: ContentSource;

  // ---- Rendering engine selection ----
  // No "auto" magic. The two engines have subtly different preprocessing
  // rules (e.g. backtick-protected angle-bracket escapes) — silent swaps
  // would diverge rendering. Caller picks explicitly; default is "basic".
  // Phase 0 only forwards through MarkdownStream — the basic/configurable
  // selection becomes meaningful once we expose those engines directly.
  renderer?: "basic" | "configurable" | "stream";

  // ---- Actions ----
  actions?: RichDocumentActionsProp;
  actionsVariant?: RichDocumentActionsVariant;
  /** Required when actionsVariant === "remote". */
  actionsSurfaceId?: string;

  // ---- Layout ----
  className?: string;
  contentClassName?: string;
  actionsClassName?: string;

  // ---- Pass-through callbacks from current MarkdownStream surface ----
  onContentChange?: (newContent: string) => void;
  applyLocalEdits?: boolean;
  analysisData?: unknown;
  messageId?: string;
  allowFullScreenEditor?: boolean;
  hideCopyButton?: boolean;
  onError?: (error: string) => void;
  onPhaseUpdate?: (phase: string) => void;
  strictServerData?: boolean;
}

/**
 * Build the live action context. Reads from refs so handlers always see
 * the freshest content / source / callbacks at invocation time, even though
 * the function itself is a pure factory.
 *
 * Exported (not just inlined) so Phase 2's variant renderers can call it
 * inside their own click handlers without duplicating the assembly logic.
 */
function buildContext(args: {
  contentRef: React.RefObject<string>;
  sourceRef: React.RefObject<ContentSource>;
  callbacksRef: React.RefObject<RichDocumentActionsProp["callbacks"] | undefined>;
  extensionsRef: React.RefObject<SourceExtensions | undefined>;
  dispatch: ReturnType<typeof useAppDispatch>;
  isAuthenticated: boolean;
  isAdmin: boolean;
}): RichDocumentActionContext {
  const currentSource = args.sourceRef.current ?? { type: "raw" as const };
  const currentContent = args.contentRef.current ?? "";
  const adapter = getSourceAdapter(currentSource.type);
  const prefix = adapter.instanceKeyPrefix(currentSource);
  // For raw sources, fold the content hash into the prefix so two raw
  // RichDocuments on the same page don't share overlay instance IDs.
  const instancePrefix =
    currentSource.type === "raw"
      ? `${prefix}-${shortHash(currentContent).slice(0, 8)}`
      : prefix;

  return {
    content: currentContent,
    source: currentSource,
    metadata: null, // Phase 1 populates from source-specific selectors
    dispatch: args.dispatch,
    isAuthenticated: args.isAuthenticated,
    isAdmin: args.isAdmin,
    isCreator: false, // Phase 1 wires from source-specific selector
    surfaceKey: null, // Phase 1 — surface routing wires through props
    onClose: () => {
      /* no-op; variants override when they own a menu */
    },
    instanceKey: (suffix: string) => `${instancePrefix}-${suffix}`,
    sourceAdapter: adapter,
    callbacks: args.callbacksRef.current,
    extensions: args.extensionsRef.current,
  };
}

export function RichDocument(props: RichDocumentProps): React.ReactElement {
  const {
    source,
    actions: actionsProp,
    actionsVariant = "none",
    actionsSurfaceId,
    className,
    contentClassName,
    content,
    events,
    serverProcessedBlocks,
    taskId,
    requestId,
    turnId,
    conversationId,
    isStreamActive,
    onContentChange,
    applyLocalEdits,
    analysisData,
    messageId,
    allowFullScreenEditor,
    hideCopyButton,
    onError,
    onPhaseUpdate,
    strictServerData,
  } = props;

  const dispatch = useAppDispatch();
  const isAuthenticated = useAppSelector((state) =>
    Boolean(state.userAuth?.id),
  );
  const isAdmin = useAppSelector((state) => Boolean(state.userAuth?.isAdmin));

  // Per-instance provider ID — stable across renders.
  const providerId = React.useId();

  // Live refs — handlers always read latest values, never a frozen snapshot.
  const contentRef = React.useRef(content ?? "");
  const sourceRef = React.useRef<ContentSource>(source);
  const callbacksRef = React.useRef(actionsProp?.callbacks);
  const extensionsRef = React.useRef<SourceExtensions | undefined>(
    actionsProp?.extensions,
  );
  React.useLayoutEffect(() => {
    contentRef.current = content ?? "";
    sourceRef.current = source;
    callbacksRef.current = actionsProp?.callbacks;
    extensionsRef.current = actionsProp?.extensions;
  });

  // Mark refs as referenced so Phase 0 lint doesn't complain about unused
  // factory utility. Phase 1 wires buildContext into the variant renderers.
  void buildContext;

  // Remote-surface registration — only when actionsVariant === "remote".
  // Phase 0 registers an empty action-spec set just to prove the wiring
  // round-trips. Phase 1 will compute real specs from the registry.
  React.useEffect(() => {
    if (actionsVariant !== "remote" || !actionsSurfaceId) return;
    dispatch(
      registerProvider({
        surfaceId: actionsSurfaceId,
        registration: {
          providerId,
          registeredAt: Date.now(),
          computedActionSpecs: [], // Phase 1 populates from resolveActions()
          sourceType: source.type,
        },
      }),
    );
    return () => {
      dispatch(
        unregisterProvider({
          surfaceId: actionsSurfaceId,
          providerId,
        }),
      );
    };
  }, [
    actionsVariant,
    actionsSurfaceId,
    providerId,
    dispatch,
    source.type,
  ]);

  // PHASE 0: no inline variants yet — render only the engine. Phase 2
  // mounts <ActionBar/>, <MiniActionBar/>, <OverflowMenu/>, <HoverMenu/>.
  return (
    <div className={cn("rich-document", className)}>
      <div className={cn("rich-document__content", contentClassName)}>
        <MarkdownStream
          content={content}
          events={events}
          serverProcessedBlocks={serverProcessedBlocks}
          taskId={taskId}
          requestId={requestId}
          turnId={turnId}
          conversationId={conversationId}
          isStreamActive={isStreamActive}
          onContentChange={onContentChange}
          applyLocalEdits={applyLocalEdits}
          analysisData={analysisData}
          messageId={messageId}
          allowFullScreenEditor={allowFullScreenEditor}
          hideCopyButton={hideCopyButton}
          onError={onError}
          onPhaseUpdate={onPhaseUpdate}
          strictServerData={strictServerData}
        />
      </div>
      {/* Phase 0: inline action variants intentionally not rendered. */}
    </div>
  );
}

export default RichDocument;
