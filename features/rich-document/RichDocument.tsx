"use client";

// features/rich-document/RichDocument.tsx
//
// Renders the content engine + a configurable action surface. The surface
// has three orthogonal axes: actionsVariant (WHAT: bar / mini-bar / menu /
// icon-only / remote / none), actionsPosition (WHERE: below / above /
// top-right / top-left / middle-right / middle-left), and actionsBehavior
// (VISIBILITY: always / hover-only). Absolute positions layer over the
// content; hover-only fades the surface in on parent hover/focus.
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
import { cn } from "@/lib/utils";
import { resolveActions } from "./actions/registry";
// Side-effect import — registers every built-in action handler at module load.
// Without this, the registry is empty when resolveActions runs. (Also imported
// by useActionSurfaceProvider, which RichDocument consumes; kept here too so
// the dependency is self-documenting.)
import "./actions/handlers";
import { useActionSurfaceProvider } from "./runtime/useActionSurfaceProvider";
import { ActionBar } from "./variants/ActionBar";
import { MiniActionBar } from "./variants/MiniActionBar";
import { MenuVariant } from "./variants/MenuVariant";
// The UNIVERSAL context menu (v3) — the light shell; MenuContent stays lazy
// inside it, so this static import costs nothing until the user right-clicks.
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";
import type { ContextMenuExtraSection } from "@/features/context-menu-v3/types";
import type {
  ContentSource,
  RichDocumentAction,
  RichDocumentActionId,
  RichDocumentActionsProp,
  RichDocumentActionsVariant,
  RichDocumentActionsPosition,
  RichDocumentActionsBehavior,
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
  /**
   * Enable a right-click context menu over the content. Lazy-loaded (the
   * menu chunk only ships after the first right-click) and streaming-safe
   * (yields to the native browser menu while isStreamActive). Pass an object
   * to add context-menu-only `extra` actions or `exclude` specific ones.
   * This is the extension point for future per-surface right-click actions.
   */
  enableContextMenu?:
    | boolean
    | {
        extra?: RichDocumentAction[];
        exclude?: (RichDocumentActionId | string)[];
      };

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

export function RichDocument(props: RichDocumentProps): React.ReactElement {
  const {
    source,
    actions: actionsProp,
    actionsVariant = "none",
    actionsPosition = "below",
    actionsBehavior = "always",
    actionsSurfaceId,
    enableContextMenu,
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

  // All provider/bridge registration + the live action context live in the
  // shared hook (reused headless by RichDocumentActionProvider). `ctx` is the
  // render-time context (safe during render); `getCtx` is the ref-based
  // factory for click handlers; `resolvedActions` drives the inline variants.
  const { ctx, getCtx, resolvedActions } = useActionSurfaceProvider({
    content,
    source,
    actions: actionsProp,
    actionsVariant,
    actionsSurfaceId,
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

  const engineInner = (
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

  // Optionally wrap the content in the UNIVERSAL context menu (v3). The menu
  // resolves the rich-document registry ITSELF from `contentSource` (passing
  // the resolved action list too would double every Copy-as/Export item), so
  // only the surface's exclusions and the context-menu-only EXTRA actions are
  // forwarded. `suppressed` keeps the native browser menu during streaming
  // without unmounting the content.
  let engine: React.ReactNode = engineInner;
  if (enableContextMenu) {
    const cmOptions =
      typeof enableContextMenu === "object" ? enableContextMenu : {};
    // v3's engine renders copy/export/convert(save) from the registry itself;
    // every OTHER registry category (edit, fullscreen editor, app group, …)
    // must ride along as extras or it silently vanishes from right-click.
    const cmExcludes = [
      ...(actionsProp?.exclude ?? []),
      ...(cmOptions.exclude ?? []),
    ];
    const registryRest = resolveActions(ctx, {
      exclude: cmExcludes,
    }).filter(
      (a) =>
        a.category !== "copy" &&
        a.category !== "export" &&
        a.category !== "save" &&
        a.id !== "save-as-file",
    );
    const extraActions = [
      ...registryRest,
      ...(actionsProp?.extra ?? []),
      ...(cmOptions.extra ?? []),
    ];
    const extraSections: ContextMenuExtraSection[] =
      extraActions.length > 0
        ? [
            {
              id: "rich-doc-extra",
              anchor: "after-compare",
              items: extraActions.map((a) => {
                const label =
                  typeof a.label === "function" ? a.label(ctx) : a.label;
                const disabledResult = a.disabled?.(ctx);
                return {
                  kind: "item" as const,
                  id: a.id,
                  label,
                  icon: a.icon,
                  disabled:
                    typeof disabledResult === "object"
                      ? true
                      : Boolean(disabledResult),
                  onSelect: () => void a.run(getCtx()),
                };
              }),
            },
          ]
        : [];
    engine = (
      <NonEditableContextMenu
        sourceFeature="rich-document"
        suppressed={isStreamActive}
        contentSource={source}
        contextData={{ content: ctx.content }}
        excludedRichActions={cmExcludes}
        richDocCtxExtras={{
          callbacks: actionsProp?.callbacks,
          extensions: actionsProp?.extensions,
        }}
        extraSections={extraSections}
      >
        {engineInner}
      </NonEditableContextMenu>
    );
  }

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
