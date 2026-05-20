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
  updateProviderSpecs,
} from "./redux/actionSurfacesSlice";
import { getSourceAdapter } from "./actions/sources";
import { shortHash } from "./actions/sources/raw";
import { resolveActions } from "./actions/registry";
import { resolveActionLabel } from "./actions/utils";
// Side-effect import — registers every built-in action handler at module load.
// Without this, the registry is empty when resolveActions runs.
import "./actions/handlers";
import {
  registerBridge,
  unregisterBridge,
  updateBridge,
} from "./runtime/providerBridge";
import { ActionBar } from "./variants/ActionBar";
import { MiniActionBar } from "./variants/MiniActionBar";
import { MenuVariant } from "./variants/MenuVariant";
import type {
  ContentSource,
  RichDocumentAction,
  RichDocumentActionContext,
  RichDocumentActionSpec,
  RichDocumentActionsProp,
  RichDocumentActionsVariant,
  RichDocumentActionsPosition,
  RichDocumentActionsBehavior,
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
  /** Where the action surface sits. Default "below". */
  actionsPosition?: RichDocumentActionsPosition;
  /** Visibility. Default "always". */
  actionsBehavior?: RichDocumentActionsBehavior;
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
 * Convert a resolved action list into the pure-metadata spec snapshot
 * that's safe to store in Redux. Strips functions, evaluates label/disabled
 * callbacks against the live context, picks an iconName for the renderer
 * to look up.
 */
function actionsToSpecs(
  actions: RichDocumentAction[],
  ctx: RichDocumentActionContext,
): RichDocumentActionSpec[] {
  return actions.map((action) => {
    const disabledResult = action.disabled?.(ctx);
    const isDisabled =
      disabledResult === true ||
      (typeof disabledResult === "object" && disabledResult !== null);
    const disabledReason =
      typeof disabledResult === "object" && disabledResult !== null
        ? disabledResult.reason
        : undefined;
    return {
      id: action.id,
      label: resolveActionLabel(action.label, ctx),
      iconName: action.icon.displayName ?? action.icon.name ?? "Circle",
      category: action.category,
      renderSlot: action.renderSlot ?? "overflow",
      order: action.order ?? 0,
      disabled: isDisabled,
      disabledReason,
    };
  });
}

/**
 * Cheap fingerprint of a spec list so we can detect "the action set
 * actually changed" between renders and skip dispatch-thrash when nothing
 * meaningful moved. Not cryptographic — just identity for diffing.
 */
function specsKey(specs: RichDocumentActionSpec[]): string {
  return specs
    .map(
      (s) =>
        `${s.id}|${s.label}|${s.disabled ? 1 : 0}|${s.disabledReason ?? ""}`,
    )
    .join(";");
}

/**
 * Build the action context from plain values. Pure function — same inputs
 * always produce the same context. Called both during render (with live
 * props) and at handler-fire time (with ref values, from inside a callback
 * closure where reading .current is legal).
 */
function buildContext(args: {
  content: string;
  source: ContentSource;
  callbacks: RichDocumentActionsProp["callbacks"] | undefined;
  extensions: SourceExtensions | undefined;
  dispatch: ReturnType<typeof useAppDispatch>;
  isAuthenticated: boolean;
  isAdmin: boolean;
}): RichDocumentActionContext {
  const adapter = getSourceAdapter(args.source.type);
  const prefix = adapter.instanceKeyPrefix(args.source);
  // For raw sources, fold the content hash into the prefix so two raw
  // RichDocuments on the same page don't share overlay instance IDs.
  const instancePrefix =
    args.source.type === "raw"
      ? `${prefix}-${shortHash(args.content).slice(0, 8)}`
      : prefix;

  return {
    content: args.content,
    source: args.source,
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
    callbacks: args.callbacks,
    extensions: args.extensions,
  };
}

export function RichDocument(props: RichDocumentProps): React.ReactElement {
  const {
    source,
    actions: actionsProp,
    actionsVariant = "none",
    actionsPosition = "below",
    actionsBehavior = "always",
    actionsSurfaceId,
    className,
    contentClassName,
    actionsClassName,
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

  // Live refs — variant click handlers read these inside their closures so
  // a button clicked seconds after a content edit operates on the new
  // content. During render the values are read from props directly (refs
  // are off-limits during render per react-hooks/refs).
  const contentRef = React.useRef(content ?? "");
  const sourceRef = React.useRef<ContentSource>(source);
  const callbacksRef = React.useRef(actionsProp?.callbacks);
  const extensionsRef = React.useRef<SourceExtensions | undefined>(
    actionsProp?.extensions,
  );
  const dispatchRef = React.useRef(dispatch);
  const isAuthRef = React.useRef(isAuthenticated);
  const isAdminRef = React.useRef(isAdmin);
  React.useLayoutEffect(() => {
    contentRef.current = content ?? "";
    sourceRef.current = source;
    callbacksRef.current = actionsProp?.callbacks;
    extensionsRef.current = actionsProp?.extensions;
    dispatchRef.current = dispatch;
    isAuthRef.current = isAuthenticated;
    isAdminRef.current = isAdmin;
  });

  // Factory for the live action context. Defined inline; React Compiler
  // memoizes identity. Reads from refs at invocation time (legal inside
  // event handlers — only render-time reads are banned).
  const getCtx = (): RichDocumentActionContext =>
    buildContext({
      content: contentRef.current,
      source: sourceRef.current,
      callbacks: callbacksRef.current,
      extensions: extensionsRef.current,
      dispatch: dispatchRef.current,
      isAuthenticated: isAuthRef.current,
      isAdmin: isAdminRef.current,
    });

  // Build the live context from props for render-time spec computation.
  const ctx = buildContext({
    content: content ?? "",
    source,
    callbacks: actionsProp?.callbacks,
    extensions: actionsProp?.extensions,
    dispatch,
    isAuthenticated,
    isAdmin,
  });

  // Resolve which actions are visible for this source + this consumer's
  // exclude/extra config. Used both for inline variants (Phase 2) and to
  // compute the spec snapshot stored in the remote-surface slice.
  const resolvedActions = resolveActions(ctx, {
    exclude: actionsProp?.exclude,
    extra: actionsProp?.extra,
  });
  const specs = actionsToSpecs(resolvedActions, ctx);

  // Remote-surface registration — only when actionsVariant === "remote".
  // Initial mount registers the provider; spec changes are pushed via
  // updateProviderSpecs (no re-register, just a metadata refresh).
  const lastSpecsKey = React.useRef<string>("");
  React.useEffect(() => {
    if (actionsVariant !== "remote" || !actionsSurfaceId) return;
    dispatch(
      registerProvider({
        surfaceId: actionsSurfaceId,
        registration: {
          providerId,
          registeredAt: Date.now(),
          computedActionSpecs: specs,
          sourceType: source.type,
        },
      }),
    );
    lastSpecsKey.current = specsKey(specs);
    return () => {
      dispatch(
        unregisterProvider({
          surfaceId: actionsSurfaceId,
          providerId,
        }),
      );
    };
    // Intentionally deps-light: registration is "once per mount". Spec
    // updates happen via the separate effect below so we don't churn
    // through register/unregister on every content change.
     
  }, [actionsVariant, actionsSurfaceId, providerId, dispatch, source.type]);

  // Push spec updates without re-registering when the resolved set changes
  // (e.g. content length flipped a `visible` predicate, or admin status
  // changed). Cheap; only touches the one stack entry.
  React.useEffect(() => {
    if (actionsVariant !== "remote" || !actionsSurfaceId) return;
    const key = specsKey(specs);
    if (key === lastSpecsKey.current) return;
    lastSpecsKey.current = key;
    dispatch(
      updateProviderSpecs({
        surfaceId: actionsSurfaceId,
        providerId,
        computedActionSpecs: specs,
      }),
    );
  }, [actionsVariant, actionsSurfaceId, providerId, dispatch, specs]);

  // Bridge registration — the module-scope side channel that lets a remote
  // RichDocumentActionSurface invoke handlers without functions traversing
  // Redux. Registered for every actionsVariant (not just "remote") so the
  // bridge is always available; harmless when no surface is consuming it.
  React.useEffect(() => {
    registerBridge(providerId, { getCtx, resolvedActions });
    return () => unregisterBridge(providerId);
    // Re-registration on every relevant change happens via updateBridge below.
     
  }, [providerId]);
  React.useEffect(() => {
    updateBridge(providerId, { getCtx, resolvedActions });
  });

  // Pick the variant. Returns null for "remote" / "none" — the remote
  // surface renders the actions elsewhere via the bridge; "none" hides
  // them entirely. "icon-only" and "menu" share the MenuVariant renderer.
  let variantNode: React.ReactNode = null;
  switch (actionsVariant) {
    case "bar":
      variantNode = <ActionBar actions={resolvedActions} getCtx={getCtx} />;
      break;
    case "mini-bar":
      variantNode = (
        <MiniActionBar actions={resolvedActions} getCtx={getCtx} />
      );
      break;
    case "menu":
    case "icon-only":
      variantNode = <MenuVariant actions={resolvedActions} getCtx={getCtx} />;
      break;
    case "remote":
    case "none":
    default:
      variantNode = null;
  }

  const isAbsolute =
    actionsPosition === "top-right" ||
    actionsPosition === "top-left" ||
    actionsPosition === "middle-right" ||
    actionsPosition === "middle-left";

  // Absolute placement classes per position.
  const absolutePositionClass = isAbsolute
    ? cn(
        "absolute z-10",
        actionsPosition === "top-right" && "right-1 top-1",
        actionsPosition === "top-left" && "left-1 top-1",
        actionsPosition === "middle-right" &&
          "right-1 top-1/2 -translate-y-1/2",
        actionsPosition === "middle-left" &&
          "left-1 top-1/2 -translate-y-1/2",
      )
    : null;

  // hover-only fades the surface in on parent hover/focus.
  const hoverClass =
    actionsBehavior === "hover-only"
      ? "opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100"
      : null;

  // In-flow spacing for below/above.
  const inFlowClass = !isAbsolute
    ? actionsPosition === "above"
      ? "mb-1"
      : "mt-1"
    : null;

  const actionsNode = variantNode ? (
    <div
      className={cn(
        absolutePositionClass,
        hoverClass,
        inFlowClass,
        actionsClassName,
      )}
    >
      {variantNode}
    </div>
  ) : null;

  // Root needs `relative` for absolute children and `group` for hover-only.
  const rootClassName = cn(
    "rich-document",
    (isAbsolute || actionsBehavior === "hover-only") && "relative group",
    className,
  );

  const engine = (
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
  );

  return (
    <div className={rootClassName}>
      {/* Absolute surfaces layer over the content; "above" renders before;
          "below" (default) renders after. */}
      {isAbsolute ? actionsNode : null}
      {!isAbsolute && actionsPosition === "above" ? actionsNode : null}
      {engine}
      {!isAbsolute && actionsPosition !== "above" ? actionsNode : null}
    </div>
  );
}

export default RichDocument;
