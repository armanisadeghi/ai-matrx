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
import { FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { resolveActions } from "./actions/registry";
// Side-effect import — registers every built-in action handler at module load.
// Without this, the registry is empty when resolveActions runs. (Also imported
// by useActionSurfaceProvider, which RichDocument consumes; kept here too so
// the dependency is self-documenting.)
import "./actions/handlers";
import { useActionSurfaceProvider } from "./runtime/useActionSurfaceProvider";
import {
  convertOriginForSource,
  useDocumentDialogsHost,
} from "./hosts/DocumentDialogsHost";
import { ActionBar } from "./variants/ActionBar";
import { MiniActionBar } from "./variants/MiniActionBar";
import { MenuVariant } from "./variants/MenuVariant";
import { buildMenuTree } from "./variants/shared/menuStructure";
// The UNIVERSAL context menu (v3) — the light shell; MenuContent stays lazy
// inside it, so this static import costs nothing until the user right-clicks.
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";
import {
  SpecimenProvider,
  SpecimenBanner,
  resolveSpecimenMode,
  type SpecimenMode,
} from "@/components/mardown-display/specimen/SpecimenContext";
import type {
  ContextMenuExtraItem,
  ContextMenuExtraSection,
} from "@/features/context-menu-v3/types";
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
   * DECLARE that this content is a specimen — generated work that is meant to
   * look right and be wrong (the Bad Example probe, a wrong explanation, a
   * decoy option). Suppresses every action surface, the right-click menu, and
   * the actions inside the content itself (table export / workbook / Google
   * Sheet / edit / open-in-window), and prints the specimen banner in their
   * place. Pass `true` for the default wording, or override the two lines.
   * See components/mardown-display/specimen/SpecimenContext.tsx.
   */
  specimen?: boolean | Partial<SpecimenMode>;
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
    specimen,
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

  // A DECLARED SPECIMEN CARRIES NO ACTIONS. Resolved before anything else so
  // the action surface is never built, never registered remotely, and the
  // right-click menu never mounts — the banner stands in its place, and the
  // provider below reaches the actions buried inside the content (tables).
  const specimenMode = resolveSpecimenMode(specimen);
  const effectiveActionsVariant: RichDocumentActionsVariant = specimenMode
    ? "none"
    : actionsVariant;

  // All provider/bridge registration + the live action context live in the
  // shared hook (reused headless by RichDocumentActionProvider). `ctx` is the
  // render-time context (safe during render); `getCtx` is the ref-based
  // factory for click handlers; `resolvedActions` drives the inline variants.
  // Convert-to-study needs a host that outlives the menu that asked. A
  // surface that brings its own (the chat bar) keeps it; every other
  // document gets this one — the action then works wherever content renders.
  // Actions whose dialog must outlive the menu (convert, save table as data,
  // save as flashcard) need a host. A surface that brings its own callback
  // keeps it; every document gets this one for the rest — so the actions
  // work wherever content renders.
  const dialogsHost = useDocumentDialogsHost({
    convertOrigin: convertOriginForSource(
      source,
      source.type === "note" ? "Note" : "Chat response",
    ),
    text: content ?? "",
  });
  const hostedActions: RichDocumentActionsProp = {
    ...actionsProp,
    callbacks: {
      ...dialogsHost.callbacks,
      ...actionsProp?.callbacks,
    },
  };

  const { ctx, getCtx, resolvedActions } = useActionSurfaceProvider({
    content,
    source,
    actions: hostedActions,
    actionsVariant: effectiveActionsVariant,
    actionsSurfaceId,
  });

  // Pick the variant. Returns null for "remote" / "none" — the remote
  // surface renders the actions elsewhere via the bridge; "none" hides
  // them entirely. "icon-only" and "menu" share the MenuVariant renderer.
  let variantNode: React.ReactNode = null;
  switch (effectiveActionsVariant) {
    case "bar":
      variantNode = (
        <ActionBar
          actions={resolvedActions}
          getCtx={getCtx}
          sourceId={ctx.instanceKey("alchemy")}
        />
      );
      break;
    case "mini-bar":
      variantNode = (
        <MiniActionBar
          actions={resolvedActions}
          getCtx={getCtx}
          sourceId={ctx.instanceKey("alchemy")}
        />
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
        actionsPosition === "middle-left" && "left-1 top-1/2 -translate-y-1/2",
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
  if (enableContextMenu && !specimenMode) {
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
        // v3 owns the Listen submenu (Speak · Summarize · Summarize & listen)
        // with the surface's own spoken_summary role — never a second one.
        a.category !== "listen" &&
        a.id !== "save-as-file" &&
        // Context-menu v3 already owns these three Compare verbs. Ferrying
        // their RichDocument twins creates a second Compare submenu.
        ![
          "compare-with-clipboard",
          "set-compare-base",
          "compare-with-base",
        ].includes(a.id),
    );
    const extraActions = [
      ...registryRest,
      ...(actionsProp?.extra ?? []),
      ...(cmOptions.extra ?? []),
    ];
    const toContextMenuItem = (
      action: RichDocumentAction,
    ): ContextMenuExtraItem => {
      const label =
        typeof action.label === "function" ? action.label(ctx) : action.label;
      const disabledResult = action.disabled?.(ctx);
      return {
        kind: "item",
        id: action.id,
        label,
        icon: action.icon,
        disabled:
          typeof disabledResult === "object" ? true : Boolean(disabledResult),
        onSelect: () => void action.run(getCtx()),
      };
    };
    const extraTree = buildMenuTree(extraActions);
    const extraItems: ContextMenuExtraItem[] = [
      ...extraTree.topLevel.map(toContextMenuItem),
      ...extraTree.submenus.map((submenu) => ({
        kind: "submenu" as const,
        id: `rich-doc-${submenu.label.toLowerCase().replaceAll(" ", "-")}`,
        label: submenu.label,
        icon: submenu.icon,
        children: submenu.actions.map(toContextMenuItem),
      })),
      ...extraTree.extras.map(toContextMenuItem),
    ];
    const extraSections: ContextMenuExtraSection[] =
      extraItems.length > 0
        ? [
            {
              id: "rich-doc-extra",
              label: "Document",
              icon: FileText,
              anchor: "after-compare",
              items: extraItems,
            },
          ]
        : [];
    engine = (
      <NonEditableContextMenu
        sourceFeature="documents"
        suppressed={isStreamActive}
        contentSource={source}
        contextData={{ content: ctx.content }}
        excludedRichActions={cmExcludes}
        richDocCtxExtras={{
          callbacks: hostedActions?.callbacks,
          extensions: actionsProp?.extensions,
          metadata: actionsProp?.metadata ?? null,
          isCreator: actionsProp?.isCreator ?? false,
          surfaceKey: actionsProp?.surfaceKey ?? null,
        }}
        extraSections={extraSections}
      >
        {engineInner}
      </NonEditableContextMenu>
    );
  }

  if (specimenMode) {
    return (
      <div className={rootClassName}>
        <SpecimenBanner mode={specimenMode} />
        <SpecimenProvider value={specimenMode}>{engine}</SpecimenProvider>
      </div>
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
      {dialogsHost.dialogs}
    </div>
  );
}

export default RichDocument;
