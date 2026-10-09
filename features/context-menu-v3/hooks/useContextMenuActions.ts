"use client";

// features/context-menu-v3/hooks/useContextMenuActions.ts
//
// THE shared engine behind every menu layout. `components/AlchemyMenuContent`
// runs it and hands its model to the Alchemy package, whose layouts (right-
// click, phone sheet, palette, bar ⋯) are pure PRESENTATION (ALC-15 S3) —
// while every piece of behavior lives here
// exactly once: placement resolution, the single deduped data fetch, scope +
// action-text resolution, the rich-document action lists, and every handler
// (clipboard, history, compare, launch, insert, attach/share, admin).
//
// This extraction pays down the long-flagged "handlers ported 1:1, keep in
// lockstep" debt: a launch-path or handler change now lands in ONE place and
// both renderers inherit it. Do NOT add a handler to a renderer — add it here.
//
// Inline agent editing: both launch handlers pass `runtime.widgetHandleId`
// (registered by the shell for editable surfaces), so any agent/shortcut
// launched from the menu can stream `widget_text_*` edits into the surface.

import { fieldLabelOf } from "../utils/field-menu-header";
import { actionsAlreadyHere } from "../utils/already-here";
import { editorTextAgentCallbacks } from "../utils/editor-text-agent";
import { useEffect, useMemo } from "react";
import { copyText as kitCopyText, readText as kitReadText } from "@ai-matrx/kit/clipboard";
import { showManualCopy } from "@/components/dialogs/clipboard-fallback/manualCopyOpener";
import {
  AppWindow,
  Braces,
  Building,
  ClipboardCopy,
  FileText,
  Info,
  Layers,
  Plus,
  Rocket,
  ShieldCheck,
  User,
} from "lucide-react";
import { CANONICAL_MENU_VERSION_V3 } from "../types";
import type { ContextMenuExtraSection, ContextMenuExtraItem } from "../types";
import { detectActiveSurface } from "@ai-matrx/chat/surfaces/utils/route-to-surface";
import { getSurfaceDisplayLabel } from "@ai-matrx/chat/surfaces/utils/surface-display";
import { getRelatedSurfaces } from "@ai-matrx/chat/surfaces/runtime/fetchRelatedSurfaces";
import { useOpenSurfaceContextWindow } from "@/features/overlays/openers/surfaceContextWindow";
import { useOpenSurfaceAgentBindWindow } from "@/features/overlays/openers/surfaceAgentBindWindow";
import { getIconComponent } from "@ai-matrx/icons";
import { useAppDispatch, useAppSelector, useAppStore } from "@/lib/redux/hooks";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import {
  selectIsDebugMode,
  toggleDebugMode,
} from "@/lib/redux/preferences/adminDebugSlice";
import {
  selectIsSuperAdmin,
  selectIsSuperAdminDebugger,
} from "@/lib/redux/slices/userSlice";
import {
  selectIsOverlayOpen,
  toggleOverlay,
} from "@/lib/redux/slices/overlaySlice";
import {
  setCompareBase,
  openCompareWithBase,
  selectHasCompareBase,
} from "@/lib/redux/slices/diffCompareSlice";
import { useOpenDiffViewerWindow } from "@/features/overlays/openers/diffViewerWindow";
import { useOpenFindReplace } from "@/features/overlays/openers/findReplace";
import { useOpenReferencePicker } from "@/features/overlays/openers/referencePicker";
import type { ReferencePick } from "@/features/matrx-envelope/components/reference-picker/referencePickerTypes";
import { useOpenContextAssignment } from "@/features/overlays/openers/contextAssignment";
import { useOpenLinkRecordSheet } from "@/features/overlays/openers/linkRecordSheet";
import { useOpenShareModalWindow } from "@/features/overlays/openers/shareModalWindow";
import { useOpenStateViewerOverlay } from "@/features/overlays/openers/adminStateAnalyzer";
import { useOpenSurfaceContextInspector } from "@/features/overlays/openers/surfaceContextInspector";
import { toast } from "@/components/ui/use-toast";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { useQuickActions } from "@/features/quick-actions/hooks/useQuickActions";
import { useAgentLauncher } from "@ai-matrx/chat/agents/hooks/useAgentLauncher";
import { useSpeech } from "@ai-matrx/media/react";
import { primeAudioOutput } from "@ai-matrx/media/speech";
import { useSurfaceAgentRoles } from "@ai-matrx/chat/surfaces/hooks/useSurfaceConfig";
import { useOpenListenSummaryWindow } from "@/features/overlays/openers/listenSummaryWindow";
import { LISTENING_HOME_SURFACE } from "@/features/audio/service/listeningConfig";
import { hasEditorInsertTarget, insertIntoEditor, ownParagraph } from "../utils/insert-into-editor";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { resolveActions } from "@ai-matrx/rich-content/rich-document/actions/provider";
import { registryMenuActions } from "@ai-matrx/rich-content/rich-document/variants/shared/menuStructure";
import { getSourceAdapter } from "@ai-matrx/rich-content/rich-document/actions/sources/index";
import { shortHash } from "@ai-matrx/rich-content/rich-document/actions/sources/raw";
// Side-effect import: the copy/save/export/convert handlers self-register into
// the rich-document action registry on load, so resolveActions resolves them.
import "@/features/rich-document/actions/handlers";
import type {
  ContentSource,
  RichDocumentAction,
  RichDocumentActionContext,
} from "@ai-matrx/rich-content/rich-document/types";
import {
  placementGroupKey,
  PLACEMENT_TYPES,
  PLACEMENT_TYPE_META,
} from "@/features/agent-shortcuts/constants";
import type { ResultDisplayMode } from "@ai-matrx/chat/agents/types/instance.types";
import type { ApplicationScope } from "@ai-matrx/chat/agents/types/scope.types";
import {
  useUnifiedAgentContextMenu,
  type AgentMenuEntry,
  type AgentMenuCategoryGroup,
} from "./useUnifiedAgentContextMenu";
import { buildAvailableKeys } from "../model/requirement-gate";
import { getManifest } from "@/features/surfaces/manifests/registry";
import { BASELINE_VALUE_NAMES } from "@ai-matrx/chat/surfaces/manifests/_baseline.manifest";
import { useSurfaceConfig } from "@ai-matrx/chat/surfaces/hooks/useSurfaceConfig";
import type { MenuConfig } from "@ai-matrx/chat/surfaces/config/namespace-registry";
import { useSurfaceBoundAgents } from "@ai-matrx/chat/surfaces/hooks/useSurfaceBoundAgents";
import type {
  SurfaceBoundAgentEntry,
  SurfaceBoundAgentSection,
} from "@ai-matrx/chat/surfaces/services/surface-bound-agents.service";
import { selectActiveScopeIds } from "@/features/scopes/redux/selectors/active-context";
import {
  resolveApplicationScope,
  resolveActionText,
  reportMenuDiagnostics,
  type ResolvedActionText,
} from "../value-resolution";
import { spliceInputValue } from "../utils/selection-tracking";
import { buildSelectionWriteBack } from "../utils/selection-write-back";
import { registerLaunchWidgetHandle } from "@ai-matrx/chat/agents/utils/launch-widget-handles";
import {
  buildJsonMenuSection,
  type JsonMenuSection,
} from "../utils/json-menu-actions";
import type {
  MenuContentProps,
  PlacementKey,
  PlacementVisibility,
} from "../types";
import { MANAGED_CONTEXT_MENU_AGENT_CONFIG } from "../managed-agent-launch";
import { AGENT_ICON } from "@/components/icons/domain-icons";

// ─────────────────────────────────────────────────────────────────────────────
// Shared menu-model constants + pure helpers (used by both renderers).
// ─────────────────────────────────────────────────────────────────────────────

export const DEFAULT_PLACEMENT_MODE: Record<PlacementKey, PlacementVisibility> =
  {
    "ai-action": "show",
    "bound-agent": "show",
    "content-block": "show",
    "organization-tool": "show",
    "user-tool": "show",
    "quick-action": "show",
  };

export const ALL_DB_PLACEMENTS: PlacementKey[] = [
  "ai-action",
  "content-block",
  "organization-tool",
  "user-tool",
];

/** User-facing relabels matching the v3 taxonomy (My Items / Org Items). */
export const PLACEMENT_LABEL_OVERRIDE: Partial<Record<string, string>> = {
  [PLACEMENT_TYPES.USER_TOOL]: "My Items",
  [PLACEMENT_TYPES.ORGANIZATION_TOOL]: "Org Items",
};

export const PLACEMENT_COLOR: Record<string, string> = {
  [PLACEMENT_TYPES.AI_ACTION]: "#0ea5e9",
  [PLACEMENT_TYPES.CONTENT_BLOCK]: "#8b5cf6",
  [PLACEMENT_TYPES.ORGANIZATION_TOOL]: "#f59e0b",
  [PLACEMENT_TYPES.USER_TOOL]: "#10b981",
};

export function getPlacementIcon(placementType: string) {
  switch (placementType) {
    case PLACEMENT_TYPES.AI_ACTION:
      return Rocket;
    case PLACEMENT_TYPES.CONTENT_BLOCK:
      return FileText;
    case PLACEMENT_TYPES.ORGANIZATION_TOOL:
      return Building;
    case PLACEMENT_TYPES.USER_TOOL:
      return User;
    default:
      return FileText;
  }
}

export function getPlacementLabel(placementType: string): string {
  return (
    PLACEMENT_LABEL_OVERRIDE[placementType] ??
    PLACEMENT_TYPE_META[placementType as keyof typeof PLACEMENT_TYPE_META]
      ?.label ??
    placementType
  );
}

export function resolveIcon(
  iconName: string | null | undefined,
  fallback = "FileText",
) {
  return getIconComponent(iconName ?? fallback, fallback);
}

export function groupsByPlacement(
  groups: AgentMenuCategoryGroup[],
): Record<string, AgentMenuCategoryGroup[]> {
  const map: Record<string, AgentMenuCategoryGroup[]> = {};
  for (const g of groups) {
    // Nullable in storage — key by the shared group key so an unplaced
    // category groups instead of throwing (agent-shortcuts/constants.ts).
    (map[placementGroupKey(g.category.placementType)] ??= []).push(g);
  }
  return map;
}

export function hasItemsRecursive(group: AgentMenuCategoryGroup): boolean {
  if (group.items.length > 0) return true;
  return group.children.some(hasItemsRecursive);
}

/** Resolve a rich-document action's label + disabled state for rendering. */
export function resolveRichActionView(
  action: RichDocumentAction,
  ctx: RichDocumentActionContext,
): { label: string; disabled: boolean } {
  const label =
    typeof action.label === "function" ? action.label(ctx) : action.label;
  const disabledResult = action.disabled?.(ctx);
  const disabled =
    typeof disabledResult === "object" ? true : Boolean(disabledResult);
  return { label, disabled };
}

// ─────────────────────────────────────────────────────────────────────────────
// The engine hook.
// ─────────────────────────────────────────────────────────────────────────────

export interface ContextMenuActions {
  // Resolved model
  scope: ApplicationScope;
  actionText: ResolvedActionText;
  /** The name of the field the menu opened in (its label), or null. */
  fieldLabel: string | null;
  /** JSON verbs for a JSON-shaped selection/content. `null` = not JSON. */
  jsonSection: JsonMenuSection | null;
  resolvedPlacementMode: Record<PlacementKey, PlacementVisibility>;
  categoryGroups: AgentMenuCategoryGroup[];
  grouped: Record<string, AgentMenuCategoryGroup[]>;
  loading: boolean;
  /** Why the agent libraries (AI Actions, My Items, …) did not load — e.g. past the menu's deadline. */
  librariesError: string | null;
  boundAgentSections: SurfaceBoundAgentSection[];
  boundAgentsLoading: boolean;
  boundAgentsError: string | null;
  /** Re-run the library fetches after a failure or a missed deadline. */
  retryLibraries: () => void;
  /** Rich-document action ids this menu must not draw (surface exclusions + already-here). */
  excludedRichActionIds: string[];
  richDocCtx: RichDocumentActionContext;
  /** The registry actions this menu shows — rendered as the ONE tree. */
  registryActions: RichDocumentAction[];
  copyVariantActions: RichDocumentAction[];
  exportActions: RichDocumentAction[];
  convertActions: RichDocumentAction[];
  // Flags
  hasCompareBase: boolean;
  isAdmin: boolean;
  isDebugMode: boolean;
  isAdminIndicatorOpen: boolean;
  canNativeUndo: boolean;
  // Handlers
  handleCopy: () => Promise<void>;
  handleSpeak: () => void;
  handleSpokenSummary: () => void;
  handleSpokenSummaryLive: () => void;
  spokenSummaryAvailable: boolean;
  handleCut: () => Promise<void>;
  handlePaste: () => Promise<void>;
  handleSelectAll: () => void;
  handleUndo: () => void;
  handleRedo: () => void;
  handleCompareClipboard: () => Promise<void>;
  handleSetCompareBase: () => void;
  handleCompareWithBase: () => Promise<void>;
  handleShortcutExecute: (
    entry: Extract<AgentMenuEntry, { entryType: "agent_shortcut" }>,
  ) => Promise<void>;
  handleBoundAgentExecute: (entry: SurfaceBoundAgentEntry) => Promise<void>;
  handleContentBlockInsert: (
    entry: Extract<AgentMenuEntry, { entryType: "content_block" }>,
  ) => void;
  handleEntrySelect: (entry: AgentMenuEntry) => void;
  handleDelete: () => Promise<void>;
  handleFind: () => void;
  /** "Insert reference…" (editable) / "Copy reference…" (read-only). */
  handleInsertReference: () => void;
  handleAttach: () => void;
  /** "Link a record…" — the ONE record picker pointed at this menu's entity. */
  handleLinkRecord: () => void;
  handleShare: () => void;
  handleInspectValues: () => void;
  handleInspectState: () => void;
  handleToggleDebugMode: () => void;
  handleToggleAdminIndicator: () => void;
  // Quick actions (pass-through so renderers need no extra hook)
  quickActions: ReturnType<typeof useQuickActions>;
  /**
   * The page's surface, as ONE nested menu entry titled with the surface's
   * display label (e.g. "Notes", "Marketing Site Workspace") — the same data
   * and actions the shell-header Agents button offers: location, Surface
   * Context, Surface Context Admin, the bound agents + bind action, related
   * surfaces, and (admins) the menu revision. Shaped as an extra section so
   * BOTH renderers draw it with their existing extra-item code.
   */
  surfaceSection: ContextMenuExtraSection;
}

export function useContextMenuActions(
  props: Omit<MenuContentProps, "variant">,
): ContextMenuActions {
  const {
    sourceFeature,
    surfaceName,
    menuVersion,
    getApplicationScope,
    contextData,
    selectedText,
    selectionRange,
    fallbackContent,
    placementMode,
    scope: shortcutScope,
    scopeId,
    extraSections,
    isEditable,
    editorId,
    getTextarea,
    insertAtCaret,
    onContentInserted,
    onTextReplace,
    onTextInsertAfter,
    onDelete,
    onUndo,
    onRedo,
    widgetHandleId,
  } = props;

  const dispatch = useAppDispatch();
  const store = useAppStore();
  const entity = props.entity;

  const resolvedPlacementMode: Record<PlacementKey, PlacementVisibility> = {
    ...DEFAULT_PLACEMENT_MODE,
    ...(placementMode ?? {}),
  };
  const dbPlacementTypes = ALL_DB_PLACEMENTS.filter(
    (p) => resolvedPlacementMode[p] !== "hide",
  );

  /**
   * THE AMBIENT READS (Phase 1, 2026-08-25). The menu launches agent runs but
   * never asked what was already true around the user: which organization is
   * active and which scopes/context they have selected. Collected here — the
   * engine is the one place with Redux — and landed on a single `ambient`
   * scope key by `resolveApplicationScope`, so an agent launched from a
   * right-click stops asking what the app already knows. ONE key, weakest
   * layer, never overrides a surface (see the baseline manifest's
   * `AMBIENT_VALUES`).
   *
   * NOT here: "is a run currently streaming". Every streaming selector in the
   * execution system is conversation-scoped (`selectIsStreaming(conversationId)`)
   * and the menu has no conversation. A global one is worth adding, but it is a
   * new memoized selector over `activeRequests` that runs on every menu open —
   * a deliberate change, not a thing to invent in passing.
   */
  const activeOrganizationId = useAppSelector(selectOrganizationId);
  const activeScopeIds = useAppSelector(selectActiveScopeIds);

  // Assemble the scope the menu acts on. Stable for this open (the shell
  // captured selection before mount), so computing it in render is cheap.
  //
  // 🚨 ORDER MATTERS (Phase 6.7). This runs BEFORE the menu hook because
  // availability is now DERIVED from it: the scope's KEYS are half of what
  // this surface can read, and an item is offered iff every key it consumes
  // is readable here.
  const scope = resolveApplicationScope({
    getApplicationScope,
    contextData,
    selectedText,
    selectionRange,
    fallbackContent,
    surfaceName,
    ambient: {
      active_organization_id: activeOrganizationId ?? null,
      active_scope_ids: activeScopeIds ?? [],
      surface_name: surfaceName ?? null,
    },
  });

  /**
   * WHAT THIS SURFACE CAN READ — the derived gate's input (THE-MODEL law 3).
   *
   * Three sources, unioned, all of them KEY-existence and never
   * value-population:
   *   1. the baseline floor — the 5 generic values every menu resolves;
   *   2. the manifest's DECLARED values (inheritance already merged by the
   *      registry) — a surface that declares `raw_transcript_text` offers the
   *      transcript items before a single word has been recorded;
   *   3. the keys that actually landed in the resolved scope — the honest
   *      catch for surfaces emitting values they never declared ("Undeclared
   *      (runtime only)" in the Surface Context window). A read path is a read
   *      path whether or not anyone wrote it down.
   */
  const scopeKeySignature = Object.keys(scope).sort().join("|");
  const availableKeys = useMemo(
    () =>
      buildAvailableKeys({
        baselineValueNames: BASELINE_VALUE_NAMES,
        declaredValueNames: surfaceName
          ? getManifest(surfaceName)?.values.map((v) => v.name)
          : undefined,
        // `scope` is rebuilt every render but its KEY SET is stable for an
        // open, so the signature — not the object — is the dependency.
        runtimeScopeKeys: scopeKeySignature.split("|").filter(Boolean),
      }),
    [surfaceName, scopeKeySignature],
  );

  /**
   * THE EXCLUSION VALVE (#43) — the surface's `menu` config namespace, the
   * one sanctioned override of derived availability. Resolved through the
   * existing layered surface-config cache (global → org → scope → user), so
   * it costs no extra fetch: the menu already loads this bundle for agent
   * roles.
   */
  const { getNamespace: getSurfaceNamespace } = useSurfaceConfig(
    surfaceName ?? "matrx-unregistered/context-menu",
  );
  const menuSurfaceConfig = getSurfaceNamespace<MenuConfig>("menu");
  const excludedItemIds = useMemo(
    () => new Set(menuSurfaceConfig?.excludedItemIds ?? []),
    [menuSurfaceConfig],
  );

  const {
    categoryGroups,
    loading,
    error: librariesError,
    refresh,
  } = useUnifiedAgentContextMenu({
    placementTypes: dbPlacementTypes,
    surfaceName,
    availableKeys,
    hasSelection: String(scope.selection ?? "").trim().length > 0,
    excludedItemIds,
    enabled: dbPlacementTypes.length > 0,
    scope: shortcutScope,
    scopeId,
  });

  const {
    sections: boundAgentSections,
    loading: boundAgentsFetching,
    settled: boundAgentsSettled,
    error: boundAgentsError,
    refresh: refreshBoundAgents,
  } = useSurfaceBoundAgents(surfaceName, { isEditable });
  // Loading until the rows are in hand — an unsettled empty list is never
  // "no agents" (round 6: the first open dropped the library).
  const boundAgentsLoading = boundAgentsFetching || !boundAgentsSettled;

  const { launchShortcut, launchAgent } = useAgentLauncher();
  const { speak } = useSpeech({ processMarkdown: true, label: "Selected text" });
  const { roles: surfaceAgentRoles } = useSurfaceAgentRoles(
    surfaceName ?? "matrx-unregistered/context-menu",
  );
  const openListenSummaryWindow = useOpenListenSummaryWindow();
  const quickActions = useQuickActions();
  const openDiffWindow = useOpenDiffViewerWindow();
  const openFindReplace = useOpenFindReplace();
  const openReferencePicker = useOpenReferencePicker();
  const openContextAssignment = useOpenContextAssignment();
  const openLinkRecordSheet = useOpenLinkRecordSheet();
  const openShareModalWindow = useOpenShareModalWindow();
  const openStateViewer = useOpenStateViewerOverlay();
  const openSurfaceInspector = useOpenSurfaceContextInspector();

  const hasCompareBase = useAppSelector(selectHasCompareBase);
  const currentUserId = useAppSelector(selectUserId);
  // Admin DEBUGGING (every page): the surface key, the menu version and the
  // Admin Tools submenu (debug mode, context values, Redux state, admin
  // indicator) — this browser's own diagnostics, no data. Admin POWER (the
  // Surface Context Admin editor, admin rich-document actions) stays on the
  // lane-gated selector, false outside /administration.
  const isAdmin = useAppSelector(selectIsSuperAdminDebugger);
  const hasAdminPower = useAppSelector(selectIsSuperAdmin);
  const organizationId = useAppSelector(selectOrganizationId);
  const isDebugMode = useAppSelector(selectIsDebugMode);
  const isAdminIndicatorOpen = useAppSelector((state) =>
    selectIsOverlayOpen(state, "adminIndicator"),
  );

  // The single, deduped fetch — fires on the renderer's mount (= on open).
  // Both the unified-menu thunk and the bound-agents service dedupe, so reopen
  // never refetches. A double fetch is structurally impossible.
  useEffect(() => {
    void refresh();
    // Default-contract agents (matrx-default/*) apply even with no surfaceName,
    // so always fetch — a bare/undeclared surface still gets its default agents.
    void refreshBoundAgents();
  }, []);

  const actionText = resolveActionText(scope);

  // Rich-document action context — reuses the canonical copy / export / convert
  // handlers (NOT a fork). Only populated when there is content to act on, so
  // the submenus self-hide on an inert menu.
  const richDocSource: ContentSource = props.contentSource ?? { type: "raw" };
  const richDocAdapter = getSourceAdapter(richDocSource.type);
  // Raw sources fold a content hash into the instance prefix so two raw
  // documents on one page never share overlay instance IDs (parity with
  // useActionSurfaceProvider's ctx builder).
  const richPrefix =
    richDocSource.type === "raw"
      ? `${richDocAdapter.instanceKeyPrefix(richDocSource)}-${shortHash(actionText.text).slice(0, 8)}`
      : richDocAdapter.instanceKeyPrefix(richDocSource);
  const richDocCtx: RichDocumentActionContext = {
    content: actionText.text,
    source: richDocSource,
    metadata: null,
    dispatch,
    getState: store.getState,
    organizationId,
    isAuthenticated: Boolean(currentUserId),
    isAdmin: hasAdminPower,
    isCreator: false,
    surfaceKey: surfaceName ?? null,
    onClose: () => {},
    instanceKey: (prefix) => `${richPrefix}-${prefix}`,
    sourceAdapter: richDocAdapter,
    applicationScope: scope,
    ...(props.richDocCtxExtras ?? {}),
  };
  // ONE AI SET FOR A RECORD IN EVERY VIEW (page-pass /notes, 2026-09-28): Read
  // (RichDocument) supplied Clean up / Help with this…, the editor views did
  // not. An editor menu over a source that can be saved gets the shell's
  // review-and-apply dialog unless its host already supplied one.
  richDocCtx.callbacks = editorTextAgentCallbacks(richDocCtx.callbacks, richDocSource, richDocAdapter, props.requestTextAgentReview);
  // Never an action that targets the place this menu already is (Save to
  // Notes inside a note, Edit inside the editor). The SAME list goes to the
  // click target (AlchemyMenuContent), because the rich-document provider
  // draws its rows from the target, not from this resolve — live on
  // /notes/<id> the preview still showed them while only this list had them.
  const excludedRichActionIds = [
    ...(props.excludedRichActions ?? []),
    ...actionsAlreadyHere({
      sourceType: richDocSource.type,
      surfaceName,
      isEditable: Boolean(isEditable),
    }),
  ];
  const richActions =
    actionText.source !== "none"
      ? resolveActions(richDocCtx, {
          exclude: excludedRichActionIds,
          extra: props.extraRichActions,
        })
      : [];
  // The ONE registry tree's actions (the same selector every menu host uses).
  const registryActions = registryMenuActions(richActions);
  const copyVariantActions = richActions.filter((a) => a.category === "copy");
  const exportActions = richActions.filter(
    (a) => a.category === "export" || a.id === "save-as-file",
  );
  const convertActions = richActions.filter(
    (a) => a.category === "save" && a.id !== "save-as-file",
  );

  // Loud guards — dev-only scream for inert menus + value-mapping gaps.
  useEffect(() => {
    reportMenuDiagnostics({
      surfaceName,
      scope,
      isEditable,
      hasExtraSections: Boolean(extraSections && extraSections.length > 0),
    });
  }, []);

  // ── Clipboard ─────────────────────────────────────────────────────────────
  const handleCopy = async () => {
    if (!actionText.text) return;
    // Blocked clipboard (embedded browser, permission policy): never a
    // silent swallow — hand the text over for a manual Cmd/Ctrl+C.
    if (!(await kitCopyText(actionText.text))) {
      showManualCopy({ text: actionText.text });
    }
  };

  const handleSpeak = () => {
    if (actionText.text.trim()) speak(actionText.text);
  };

  // Listening is universal: every menu has content or a selection. A surface
  // that declares its own `spoken_summary` role wins; every other surface
  // falls back to the platform home role (mandate-backed, so it resolves for
  // every user). The home fetch is cached once per session by
  // `ensureSurfaceConfig`'s single-flight.
  const { roles: listenHomeRoles } = useSurfaceAgentRoles(
    LISTENING_HOME_SURFACE,
  );
  const spokenSummaryRole = surfaceAgentRoles.spoken_summary?.effectiveAgentId
    ? surfaceAgentRoles.spoken_summary
    : listenHomeRoles.spoken_summary;
  const spokenSummaryAgentId = spokenSummaryRole?.effectiveAgentId ?? null;
  // Both listening actions open the Listen panel (summary text + audio
  // transport in one place). The only difference is stream-to-stream autoplay.
  const openSpokenSummary = (autoPlay: boolean) => {
    if (!spokenSummaryAgentId || !actionText.text.trim()) return;
    // This click is the ONLY user gesture before speech starts (the audio
    // itself begins from a websocket callback) — unlock iOS/WebKit output now.
    primeAudioOutput();
    openListenSummaryWindow({
      agentId: spokenSummaryAgentId,
      agentName: spokenSummaryRole?.role.label ?? null,
      sourceText: actionText.text,
      style: "Extremely Concise Summary",
      autoPlay,
    });
  };
  const handleSpokenSummary = () => openSpokenSummary(false);
  const handleSpokenSummaryLive = () => openSpokenSummary(true);

  const handleCut = async () => {
    if (!selectionRange || selectionRange.type !== "editable") return;
    const element = selectionRange.element;
    if (
      !(element instanceof HTMLTextAreaElement) &&
      !(element instanceof HTMLInputElement)
    )
      return;
    const { start, end } = selectionRange;
    const cutText = element.value.substring(start, end);
    if (!(await kitCopyText(cutText))) {
      // The text was NOT cut (the splice below never runs) — offer it for a
      // manual copy instead of losing the gesture.
      showManualCopy({ text: cutText, title: "Copy manually (cut was blocked)" });
      return;
    }
    if (onTextReplace) {
      onTextReplace(
        element.value.substring(0, start) + element.value.substring(end),
      );
    } else {
      spliceInputValue(element, start, end, "");
    }
  };

  const handlePaste = async () => {
    if (!isEditable || !selectionRange || selectionRange.type !== "editable")
      return;
    const element = selectionRange.element;
    if (
      !(element instanceof HTMLTextAreaElement) &&
      !(element instanceof HTMLInputElement)
    )
      return;
    const text = await kitReadText();
    if (text === null) {
      toast({ title: "Couldn't read the clipboard", variant: "destructive" });
      return;
    }
    const { start, end } = selectionRange;
    if (onTextReplace) {
      onTextReplace(
        element.value.substring(0, start) + text + element.value.substring(end),
      );
    } else {
      spliceInputValue(element, start, end, text);
    }
  };

  // ── JSON ──────────────────────────────────────────────────────────────────
  // Selection-aware: when the text the menu is acting on parses as JSON (with
  // or without a code fence), offer the JSON verbs. Detection + formatting are
  // the shared `lib/json-format` primitive, so this menu and the notes cleanup
  // pass produce byte-identical output. Read-only surfaces get the same verbs
  // as copies.
  const editableTarget =
    isEditable && selectionRange?.type === "editable"
      ? selectionRange.element
      : null;
  const canWriteJson =
    editableTarget instanceof HTMLTextAreaElement ||
    editableTarget instanceof HTMLInputElement;

  const jsonSection: JsonMenuSection | null = buildJsonMenuSection({
    text: actionText.text,
    canWrite: canWriteJson,
    onReplace: (next) => {
      if (!canWriteJson || !selectionRange || selectionRange.type !== "editable")
        return;
      const element = selectionRange.element;
      if (
        !(element instanceof HTMLTextAreaElement) &&
        !(element instanceof HTMLInputElement)
      )
        return;
      // A real selection is rewritten in place; with no selection the menu is
      // acting on the whole field, so the whole value is replaced.
      const { start, end } =
        actionText.source === "selection"
          ? selectionRange
          : { start: 0, end: element.value.length };
      if (onTextReplace) {
        onTextReplace(
          element.value.substring(0, start) + next + element.value.substring(end),
        );
      } else {
        spliceInputValue(element, start, end, next);
      }
    },
    onCopy: async (next) => {
      if (await kitCopyText(next)) {
        toast({ title: "Copied", description: "JSON copied to clipboard." });
      } else {
        showManualCopy({ text: next });
      }
    },
  });

  const handleSelectAll = () => {
    // No captured selection (the common right-click-without-selecting case):
    // an editable surface still knows its field — select all of it. A no-op
    // here is the "fake menu" class this feature exists to kill.
    if (!selectionRange) {
      const field = getTextarea?.();
      if (field) {
        requestAnimationFrame(() => {
          field.focus();
          field.select();
        });
      }
      return;
    }
    if (selectionRange.type === "editable") {
      const element = selectionRange.element;
      if (
        element instanceof HTMLTextAreaElement ||
        element instanceof HTMLInputElement
      ) {
        requestAnimationFrame(() => {
          element.focus();
          element.select();
        });
      }
    } else {
      const container = selectionRange.containerElement;
      if (!container) return;
      requestAnimationFrame(() => {
        try {
          const range = document.createRange();
          range.selectNodeContents(container);
          const selection = window.getSelection();
          if (selection) {
            selection.removeAllRanges();
            selection.addRange(range);
          }
        } catch {
          // best-effort
        }
      });
    }
  };

  // ── History ───────────────────────────────────────────────────────────────
  // Native per-field Undo/Redo. When the surface provides no richer history
  // (`onUndo`/`onRedo`), an editable field still gets the browser's built-in
  // undo stack — "offer undo" without standing up a history system. There is no
  // non-deprecated API to trigger a textarea's native undo, so `execCommand` is
  // the intentional (and only) mechanism here.
  const editableElement: HTMLTextAreaElement | HTMLInputElement | null =
    (() => {
      const fromRange =
        selectionRange?.type === "editable" ? selectionRange.element : null;
      const el = fromRange ?? getTextarea?.() ?? null;
      return el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement
        ? el
        : null;
    })();
  const canNativeUndo = Boolean(isEditable && editableElement);
  const runNativeEdit = (command: "undo" | "redo") => {
    if (!editableElement) return;
    editableElement.focus();
    try {
      document.execCommand(command);
    } catch (err) {
      console.error(`[ContextMenuV3] native ${command} failed`, err);
    }
  };
  const handleUndo = () => (onUndo ? onUndo() : runNativeEdit("undo"));
  const handleRedo = () => (onRedo ? onRedo() : runNativeEdit("redo"));

  // ── Compare — reuses the existing diff-viewer window + compare-base slice ──
  const compareContent = (): { content: string; label: string } =>
    actionText.source === "selection"
      ? { content: actionText.text, label: "Selection" }
      : { content: actionText.text, label: "Current" };

  const handleCompareClipboard = async () => {
    const { content, label } = compareContent();
    const clip = await kitReadText();
    if (clip === null) {
      toast({ title: "Couldn't read the clipboard", variant: "destructive" });
      return;
    }
    if (!clip) {
      toast({ title: "Clipboard is empty" });
      return;
    }
    // Current content is the baseline (old); the clipboard is the incoming
    // version the user is about to paste (new). Clipboard-only text => addition.
    openDiffWindow({
      original: content,
      modified: clip,
      originalLabel: label,
      modifiedLabel: "Clipboard",
      title: "Compare with clipboard",
      engine: "light",
    });
  };

  const handleSetCompareBase = () => {
    const { content, label } = compareContent();
    dispatch(setCompareBase({ content, label, language: null }));
    toast({
      title: "Set as compare base",
      description: "Open another item and choose “Compare with base”.",
    });
  };

  const handleCompareWithBase = async () => {
    const { content, label } = compareContent();
    const opened = await dispatch(
      openCompareWithBase({ current: content, currentLabel: label }),
    ).unwrap();
    if (!opened) {
      toast({
        title: "No compare base set",
        description: "Choose “Set as compare base” on another item first.",
      });
    }
  };

  // ── Launch (AI actions / bound agents / content blocks) ──────────────────
  // Per-launch widget handle: the surface's widget_* methods plus a selection
  // write-back, so the result's action bar offers Replace / Insert below in
  // place of the text this run was launched on (any display mode).
  const launchWidgetHandleId = (): string | undefined =>
    registerLaunchWidgetHandle(
      widgetHandleId,
      isEditable
        ? buildSelectionWriteBack({
            originalText: actionText.text,
            textSource: actionText.source,
            selectionRange,
            onTextReplace,
            onTextInsertAfter,
            insertAtCaret,
          })
        : null,
    );

  const handleShortcutExecute = async (
    entry: Extract<AgentMenuEntry, { entryType: "agent_shortcut" }>,
  ) => {
    if (!entry.agentId) {
      toast({
        title: "Agent Not Connected",
        description: `"${entry.label}" has no connected agent. Configure it in the admin panel.`,
        variant: "destructive",
      });
      return;
    }
    const resultDisplay = (entry.displayMode ??
      "modal-full") as ResultDisplayMode;
    try {
      await launchShortcut(entry.id, scope, {
        surfaceKey: `${sourceFeature}:${entry.id}`,
        sourceFeature,
        config: { displayMode: resultDisplay },
        runtime: {
          originalText: actionText.text,
          surfaceName,
          // Editable surfaces: let the agent stream widget_text_* edits
          // straight into the surface, and give the person Replace / Insert
          // below on the result (undefined on read-only — no tools).
          widgetHandleId: launchWidgetHandleId(),
        },
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "An unknown error occurred";
      toast({
        title: "Execution Failed",
        description: `${entry.label}: ${message}`,
        variant: "destructive",
      });
    }
  };

  const handleBoundAgentExecute = async (entry: SurfaceBoundAgentEntry) => {
    try {
      await launchAgent(entry.agentId, {
        surfaceKey: `${sourceFeature}:bound-agent:${entry.agentId}`,
        sourceFeature,
        // Managed entries share the WindowPanel default. autoRun is deliberately
        // absent so the safe open-and-wait default remains authoritative.
        config: MANAGED_CONTEXT_MENU_AGENT_CONFIG,
        runtime: {
          applicationScope: scope,
          originalText: actionText.text,
          surfaceName,
          widgetHandleId: launchWidgetHandleId(),
        },
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "An unknown error occurred";
      toast({
        title: "Execution Failed",
        description: `${entry.name}: ${message}`,
        variant: "destructive",
      });
    }
  };

  // Every insert the menu makes goes through ONE function; which target is
  // live (editor id, textarea, rich caret) is decided when the insert runs.
  const insertTargets = { editorId, getTextarea, insertAtCaret, onTextReplace };

  const handleContentBlockInsert = (
    entry: Extract<AgentMenuEntry, { entryType: "content_block" }>,
  ) => {
    // The template passes through VERBATIM — placeholders like {{variable}}
    // must reach the editor/clipboard unmangled.
    const template = entry.template;
    if (insertIntoEditor(insertTargets, template)) {
      onContentInserted?.();
      return;
    }
    // Read-only surface (or the insert target vanished): never a silent no-op —
    // copy the block so the gesture still yields the text.
    void kitCopyText(template).then((copied) => {
      if (copied) {
        toast({
          title: "Copied to clipboard",
          description: `"${entry.label}" can't be inserted here — this surface isn't editable.`,
        });
      } else {
        showManualCopy({ text: template });
      }
    });
  };

  const handleEntrySelect = (entry: AgentMenuEntry) => {
    if (entry.entryType === "agent_shortcut") void handleShortcutExecute(entry);
    else handleContentBlockInsert(entry);
  };

  // ── Editable Save / Delete — Delete always via ConfirmDialog ─────────────
  const handleDelete = async () => {
    if (!onDelete) return;
    const ok = await confirm({
      title: "Delete this item?",
      description: "This action cannot be undone.",
      confirmLabel: "Delete",
      variant: "destructive",
    });
    if (ok) onDelete();
  };

  // ── Overlay-opening actions ───────────────────────────────────────────────
  // Find & Replace carries the live target element + onReplace through the
  // callback registry (never Redux). Suppress the shell's selection-restore so
  // the modal keeps focus after the menu closes (applies on BOTH renderers —
  // the mobile sheet closes into the same overlay).
  const handleFind = () => {
    props.suppressSelectionRestore();
    openFindReplace({
      getTargetElement: () =>
        selectionRange?.type === "editable" ? selectionRange.element : null,
      onReplace: onTextReplace,
    });
  };

  // Add a reference: the picker returns the canonical minified fence; an
  // editable surface gets it inserted at the caret on its own paragraph, any
  // other surface (or a "Copy" choice inside the picker) gets it on the
  // clipboard — never a silent no-op.
  const canInsertReference = isEditable && hasEditorInsertTarget(insertTargets);
  const copyReference = (pick: ReferencePick) => {
    void kitCopyText(pick.fence).then((copied) => {
      if (copied) {
        toast({
          title: "Reference copied",
          description: pick.title
            ? `Paste it anywhere to link "${pick.title}".`
            : "Paste it anywhere to render the link.",
        });
      } else {
        showManualCopy({ text: pick.fence, title: "Copy the reference" });
      }
    });
  };
  const insertReference = (pick: ReferencePick) => {
    // Own paragraph everywhere: a fence must start and end on its own line.
    // A block: it lands at the end of the caret's line, never inside a word.
    const inserted = insertIntoEditor(insertTargets, {
      editor: `\n${pick.fence}\n`,
      textarea: (field) => ownParagraph(pick.fence, field),
      caret: pick.fence,
      placement: "block",
    });
    if (inserted) {
      onContentInserted?.();
      return;
    }
    toast({
      title: "Copied instead",
      description: "Couldn't insert here. Paste it where you want it.",
    });
    copyReference(pick);
  };
  const handleInsertReference = () => {
    props.suppressSelectionRestore();
    openReferencePicker({
      mode: canInsertReference ? "insert" : "copy",
      onPicked: (pick) => {
        if (pick.delivery === "insert" && canInsertReference) insertReference(pick);
        else copyReference(pick);
      },
    });
  };

  const handleAttach = () => {
    if (!entity) return;
    openContextAssignment({
      subject: {
        entityType: entity.type,
        entityId: entity.id,
        title: entity.title,
      },
    });
  };

  const handleLinkRecord = () => {
    if (!entity) return;
    openLinkRecordSheet({ target: { token: entity.type, id: entity.id, title: entity.title } });
  };

  const handleShare = () => {
    if (!entity?.resourceType) return;
    openShareModalWindow({
      resourceType: entity.resourceType,
      resourceId: entity.id,
      resourceName: entity.title,
    });
  };

  // ── Admin ─────────────────────────────────────────────────────────────────
  // ── Surface submenu (mirrors the shell-header Agents panel) ────────────────
  const openSurfaceContextWindow = useOpenSurfaceContextWindow();
  const openBindAgent = useOpenSurfaceAgentBindWindow();
  const resolvedSurfaceName = surfaceName ?? detectActiveSurface();
  const surfaceLabel = resolvedSurfaceName
    ? getSurfaceDisplayLabel(resolvedSurfaceName)
    : "This page";
  const related = getRelatedSurfaces(resolvedSurfaceName);
  const copyText = (text: string) => {
    void kitCopyText(text).then((copied) => {
      if (copied) toast({ title: "Copied", description: text });
      else showManualCopy({ text });
    });
  };
  const surfaceAgentItems: ContextMenuExtraItem[] = [];
  boundAgentSections
    .filter((section) => section.agents.length > 0)
    .forEach((section, idx) => {
      if (idx > 0)
        surfaceAgentItems.push({ kind: "separator", id: `sa:${section.key}:sep` });
      for (const agent of section.agents) {
        surfaceAgentItems.push({
          kind: "item",
          id: `sa:${section.key}:${agent.agentId}`,
          label: agent.name,
          description: agent.organizationName ? `${section.label} · ${agent.organizationName}` : section.label,
          icon: AGENT_ICON,
          onSelect: () => void handleBoundAgentExecute(agent),
        });
      }
    });
  if (surfaceAgentItems.length > 0)
    surfaceAgentItems.push({ kind: "separator", id: "sa:bind-sep" });
  surfaceAgentItems.push({
    kind: "item",
    id: "sa:bind",
    label: "Bind an agent to this page…",
    icon: Plus,
    disabled: !resolvedSurfaceName,
    onSelect: () => {
      if (resolvedSurfaceName) openBindAgent({ surfaceName: resolvedSurfaceName });
    },
  });
  const relatedItems: ContextMenuExtraItem[] = [
    ...related.ancestry,
    ...related.children,
  ].map((ref) => ({
    kind: "item",
    id: `sr:${ref.name}`,
    label: ref.label,
    description: `${ref.kind === "ancestor" ? "Parent" : "Child"} · ${ref.name}`,
    icon: AppWindow,
    onSelect: () =>
      openSurfaceContextWindow({ surfaceName: ref.name, isEditable: false }),
  }));
  const surfaceChildren: ContextMenuExtraItem[] = [
    // The surface key is an engineer's handle — admin-only (cold walk 20),
    // like the Agents panel's sub-line. Everyone else sees the label only.
    ...(isAdmin
      ? ([
          {
            kind: "item",
            id: "surface:location",
            label: resolvedSurfaceName ?? "No surface registered for this page",
            description: resolvedSurfaceName ? "Surface location · click to copy" : undefined,
            icon: ClipboardCopy,
            disabled: !resolvedSurfaceName,
            onSelect: () => resolvedSurfaceName && copyText(resolvedSurfaceName),
          },
          { kind: "separator", id: "surface:sep1" },
        ] satisfies ContextMenuExtraItem[])
      : []),
    {
      kind: "item",
      id: "surface:context",
      label: "Surface Context",
      description: "Live page values",
      icon: Braces,
      disabled: !resolvedSurfaceName,
      onSelect: () => {
        if (!resolvedSurfaceName) return;
        openSurfaceContextWindow({
          surfaceName: resolvedSurfaceName,
          isEditable: Boolean(isEditable),
        });
      },
    },
    ...(hasAdminPower
      ? ([
          {
            kind: "item",
            id: "surface:context-admin",
            label: "Surface Context Admin",
            description: "Contract, provenance & settings",
            icon: ShieldCheck,
            onSelect: () =>
              openSurfaceInspector({
                surfaceName: resolvedSurfaceName ?? null,
                scope,
                isEditable: Boolean(isEditable),
                preferRuntime: true,
              }),
          },
        ] satisfies ContextMenuExtraItem[])
      : []),
    { kind: "separator", id: "surface:sep2" },
    {
      kind: "submenu",
      id: "surface:agents",
      label: "Agents on this page",
      icon: AGENT_ICON,
      children: surfaceAgentItems,
    },
    ...(relatedItems.length > 0
      ? ([
          {
            kind: "submenu",
            id: "surface:related",
            label: "Related surfaces",
            icon: Layers,
            children: relatedItems,
          },
        ] satisfies ContextMenuExtraItem[])
      : []),
    ...(isAdmin
      ? ([
          { kind: "separator", id: "surface:sep3" },
          {
            kind: "item",
            id: "surface:version",
            label: `Menu v3.${CANONICAL_MENU_VERSION_V3} · V${menuVersion}`,
            description: "Menu revision · surface wiring version",
            icon: Info,
            onSelect: () =>
              copyText(
                `${resolvedSurfaceName ?? "(no surface)"} · v3.${CANONICAL_MENU_VERSION_V3} · V${menuVersion}`,
              ),
          },
        ] satisfies ContextMenuExtraItem[])
      : []),
  ];
  const surfaceSection: ContextMenuExtraSection = {
    id: "surface-info",
    items: [
      {
        kind: "submenu",
        id: "surface",
        label: surfaceLabel,
        icon: AppWindow,
        children: surfaceChildren,
      },
    ],
  };

  const handleInspectValues = () => {
    openSurfaceInspector({
      surfaceName: surfaceName ?? null,
      scope,
      isEditable: Boolean(isEditable),
    });
  };
  const handleInspectState = () => {
    openStateViewer();
  };
  const handleToggleDebugMode = () => {
    dispatch(toggleDebugMode());
  };
  const handleToggleAdminIndicator = () => {
    dispatch(toggleOverlay({ overlayId: "adminIndicator" }));
  };

  return {
    scope,
    actionText,
    // A textarea/input, or a contenteditable field (chip / rich editor), names
    // itself in the header — never "Content: {{reply.body}}".
    fieldLabel: isEditable && selectionRange ? fieldLabelOf(selectionRange.element) : null,
    jsonSection,
    resolvedPlacementMode,
    categoryGroups,
    grouped: groupsByPlacement(categoryGroups),
    loading,
    librariesError,
    boundAgentSections,
    boundAgentsLoading,
    boundAgentsError,
    excludedRichActionIds,
    retryLibraries: () => {
      void refresh();
      void refreshBoundAgents();
    },
    richDocCtx,
    registryActions,
    copyVariantActions,
    exportActions,
    convertActions,
    hasCompareBase,
    isAdmin,
    isDebugMode,
    isAdminIndicatorOpen,
    canNativeUndo,
    handleCopy,
    handleSpeak,
    handleSpokenSummary,
    handleSpokenSummaryLive,
    spokenSummaryAvailable: Boolean(spokenSummaryAgentId),
    handleCut,
    handlePaste,
    handleSelectAll,
    handleUndo,
    handleRedo,
    handleCompareClipboard,
    handleSetCompareBase,
    handleCompareWithBase,
    handleShortcutExecute,
    handleBoundAgentExecute,
    handleContentBlockInsert,
    handleEntrySelect,
    handleDelete,
    handleFind,
    handleInsertReference,
    handleAttach,
    handleLinkRecord,
    handleShare,
    handleInspectValues,
    handleInspectState,
    handleToggleDebugMode,
    handleToggleAdminIndicator,
    quickActions,
    surfaceSection,
  };
}
