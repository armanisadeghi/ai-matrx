"use client";

/**
 * ConversationContextRail
 *
 * A single, compact, modern strip that sits directly above the composer and
 * surfaces everything "attached to" the current conversation that the user can
 * open — without scrolling up the transcript to hunt for the message that
 * introduced it. One place, always visible when there's something to show,
 * zero pixels when there isn't.
 *
 * Today it gathers (in priority order):
 *   • Working document      → click toggles it in/out of the CANVAS; X turns it
 *                             off for this chat (same as the docs-menu switch).
 *   • Scratchpad            → same canvas toggle + X (per-conversation gate).
 *   • Agent lists           → plan / tasks / todos (the canvas `conversation-lists` tab).
 *   • Any other live context entry the agent or user set (slot / ad-hoc) —
 *     click opens the detail sheet; X removes the entry from context.
 *
 * Working context (scopes + preview) lives in the `+` attach menu
 * (`ContextLensBar` row) — not duplicated on this rail.
 *
 * Pills are TINY on purpose: icon + one word. The full name, status, and click
 * hint live in the tooltip. Keep it that way — the composer is not a dashboard.
 *
 * It is the ONE rail — adding a future source (artifacts, canvas items, …) is a
 * single push into `items`, never a new bespoke strip. It reuses the existing
 * openers (the canvas's `conversation-context` and `conversation-lists` tabs,
 * `ActiveContextLensChip`) — it does not reinvent any detail surface.
 *
 * Mobile-friendly: the most important pills stay inline; the rest collapse into
 * a clean "…" overflow menu so the rail never wraps or crowds the composer.
 *
 * Always mounts nothing when there are no surfaceable attachments — safe
 * in every SmartAgentInput.
 */

import { useEffect } from "react";
import {
  FileText,
  ListChecks,
  Loader2,
  MoreHorizontal,
  NotebookPen,
  Code2,
  Globe,
  X,
  type LucideIcon,
} from "lucide-react";
import { useAppDispatch, useAppSelector } from "../../../../store/hooks";
import { ensureSurfaceFeatureLoaded } from "../../../../surfaces/redux/userStateSlice";
import { CONTEXT_RULES_FEATURE } from "@ai-matrx/agents/context";
import { cn } from "@ai-matrx/design-system";
import { useIsMobile } from "@ai-matrx/kit/media-query";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@ai-matrx/design-system";
import { openAfterCurrentLayerCloses } from "@host/components/dialogs/confirm/after-current-layer-closes";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@ai-matrx/design-system";
import { useChatCanvasOpeners, useChatCanvasView } from "../../../../host/canvas";
import {
  conversationDocumentsTabId,
  scratchpadTabId,
} from "../../../../host/canvas-tabs";
import {
  useOpenScratchpadPanel,
  useOpenWorkingDocumentPanel,
} from "../../../../host/window-openers";
import { reportCanvasOpenDrop } from "@host/features/canvas/openRequest";
import { selectCloudBrowserRunLive } from "@host/features/cloud-browser/redux/cloudBrowserSlice";
import {
  selectInstanceContextEntries,
  selectSurfaceContextKeys,
} from "../../../redux/execution-system/instance-context/instance-context.selectors";
import { useConversationFollowsPage } from "../../../../surfaces/runtime/useConversationFollowsPage";
import {
  ConversationContextChip,
  useConversationContextChipShown,
  useConversationContextTab,
} from "./ConversationContextChip";
import { SmartAgentResourceChips } from "../resources/SmartAgentResourceChips";
import { AttachedDocumentChips } from "../resources/AttachedDocumentChips";
import { removeContextEntry } from "../../../redux/execution-system/instance-context/instance-context.slice";
import { selectAgentIdFromInstance } from "../../../redux/execution-system/conversations/conversations.selectors";
import type { InstanceContextEntry } from "../../../types/instance.types";
import {
  CONTEXT_TYPE_ICON,
  FALLBACK_CONTEXT_ICON,
} from "../../context-policies-display/contextPolicyIcons";
import { CloudBrowserHandoffCanvasOpener } from "@host/features/cloud-browser/components/CloudBrowserHandoffCanvasOpener";
import {
  cloudBrowserCanvasSourceId,
  useOpenCloudBrowserCanvas,
} from "@host/features/cloud-browser/hooks/useOpenCloudBrowserCanvas";
import { docKindForContextKey } from "../../../utils/workingDocumentContext";
import {
  isCanvasItemContextKey,
  isCanvasItemContextValue,
} from "../../../utils/canvasItemContext";
import { useMachineFramesVisible } from "../../shared/transcript-audience";
import { scratchScopeId } from "../../../redux/execution-system/instance-working-document/instance-working-document.slice";
import { setConversationDocumentEnabledThunk } from "../../../redux/execution-system/instance-working-document/instance-working-document.thunks";
import { setScratchpadGateThunk } from "../../../redux/execution-system/instance-working-document/scratchpad.thunks";
import {
  selectActiveScratchpadId,
  selectAttachedScratchpadIds,
  selectWorkingDocEnabled,
  selectWorkingDocSaving,
  selectWorkingDocTitle,
} from "../../../redux/execution-system/instance-working-document/instance-working-document.selectors";
import {
  selectHasAgentListsContent,
  selectAgentTaskCounts,
  selectUserTodoCounts,
} from "../../../ui-first-tools/redux/agent-lists.selectors";
import {
  ensureAgentLists,
  subscribeAgentLists,
  unsubscribeAgentLists,
} from "../../../ui-first-tools/redux/agent-lists.thunks";
import { useConversationListsTab } from "../../../ui-first-tools/ui/lists/TaskPanel";
import { selectAgentContextPolicies } from "../../../redux/agent-definition/selectors";
import { ActiveContextButton } from "@host/features/scopes/components/active-context/ActiveContextButton";
import { selectActiveScopeIdsByType } from "@host/features/scopes/redux/selectors/active-context";
import { contextEntryLabel } from "../../context-policies-display/contextEntryLabel";

interface ConversationContextRailProps {
  conversationId: string;
  className?: string;
  /** Keep all context available behind one right-aligned count menu. */
  presentation?: "default" | "overflow-only";
  /** Display-only mirrors of real agent inputs delivered outside instanceContext. */
  attachedItems?: readonly AttachedContextRailItem[];
  /** Optional Locate anchor supplied by the owning surface. */
  surfaceValueName?: string;
  /**
   * Also render the composer's attachments (resource chips + durable document
   * chips) at the LEFT of this row, so attachments and the value-group chip
   * share ONE row (Arman, 2026-10-01). The composer then mounts neither on its
   * own row.
   */
  withAttachments?: boolean;
  /** Locate anchor for the attachments, when `withAttachments`. */
  attachmentsSurfaceValueName?: string;
  /**
   * Render the value-group chip at the right of this row (default). The
   * composer passes `false` and places `ConversationContextChip` in its meta
   * row beside Output, so the card never spends a row on one chip.
   */
  withValueGroupChip?: boolean;
}

export interface AttachedContextRailItem {
  id: string;
  icon: LucideIcon;
  label: string;
  word: string;
  detail?: string;
  hint?: string;
  onOpen: () => void;
  /**
   * The instanceContext key this pill PRESENTS, when the input does ride
   * instanceContext (a canvas snapshot written by `setContextEntries`). The
   * rail then shows this host pill INSTEAD of the generic one for that key —
   * one input, one pill. Absent = an input delivered outside instanceContext.
   */
  contextKey?: string;
}

type RailTone = "default" | "primary";

interface RailItem {
  id: string;
  icon: LucideIcon;
  /** Full name — shown in the tooltip and the overflow menu, never on the pill. */
  label: string;
  /** ONE word for the pill face (chips stay tiny; the tooltip carries the rest). */
  word: string;
  /** Short trailing meta (e.g. "3/5", a count, a status word) — tooltip only. */
  detail?: string;
  /** One-line description of what clicking does, for the tooltip. */
  hint?: string;
  tone?: RailTone;
  /** Tiny spinner instead of a static state (e.g. saving). */
  busy?: boolean;
  /** Pill's detail surface is currently open. */
  active?: boolean;
  onOpen: () => void;
  /** Floating X — detaches the item from this conversation's context. */
  onRemove?: () => void;
}

function entryHasValue(e: InstanceContextEntry): boolean {
  const v = e.value;
  if (v === undefined || v === null) return false;
  if (typeof v === "string" && v.trim() === "") return false;
  if (typeof v === "object" && Object.keys(v as object).length === 0)
    return false;
  return true;
}

export function ConversationContextRail({
  conversationId,
  className,
  presentation = "default",
  attachedItems = [],
  surfaceValueName,
  withAttachments = false,
  attachmentsSurfaceValueName,
  withValueGroupChip = true,
}: ConversationContextRailProps) {
  const dispatch = useAppDispatch();
  const isMobile = useIsMobile();
  // Who is reading this composer — see transcript-audience.tsx. A host that
  // declares nothing is a builder surface and nothing here changes for it.
  const machineFramesVisible = useMachineFramesVisible();

  // ── Live context entries (working doc, scratchpad, slot / ad-hoc context) ──
  const entries = useAppSelector(selectInstanceContextEntries(conversationId));
  const agentId = useAppSelector(selectAgentIdFromInstance(conversationId));
  // Everything the PAGE'S SURFACE contributed rides ONE chip (ConversationContextChip);
  // every other entry keeps its own.
  const surfaceKeys = useAppSelector(selectSurfaceContextKeys(conversationId));
  const surfaceKeySet = new Set(surfaceKeys);
  // THE PAGE-FOLLOW RULE, for every composer (one implementation): this
  // conversation gets the live values of the page it is shown on, unless it
  // is that page's own conversation.
  useConversationFollowsPage(conversationId);
  const contextChipShown =
    useConversationContextChipShown(conversationId) && withValueGroupChip;
  // The person's saved context rules load as the composer mounts — chip shown
  // or not — so a page's first send never waits on them.
  useEffect(() => {
    void dispatch(ensureSurfaceFeatureLoaded(CONTEXT_RULES_FEATURE));
  }, [dispatch]);

  // ── Document pills read the EDITOR slice (the SSOT), never instanceContext
  // (which is the agent-facing publication). Working: shown iff enabled.
  // Scratch: shown iff this conversation OPTED IN (per-conversation gate,
  // default OFF) or extra scratchpads are attached. An opted-in empty
  // scratchpad shows the pill (affordance to type) but publishes nothing. ──
  const workingDocEnabled = useAppSelector(
    selectWorkingDocEnabled(conversationId, "working"),
  );
  const workingDocTitle = useAppSelector(
    selectWorkingDocTitle(conversationId, "working"),
  );
  const workingDocSaving = useAppSelector(
    selectWorkingDocSaving(conversationId, "working"),
  );
  const activeScratchId = useAppSelector(selectActiveScratchpadId);
  const scratchScope = activeScratchId
    ? scratchScopeId(activeScratchId)
    : "sp:none";
  const scratchTitle = useAppSelector(
    selectWorkingDocTitle(scratchScope, "scratch"),
  );
  const scratchSaving = useAppSelector(
    selectWorkingDocSaving(scratchScope, "scratch"),
  );
  const scratchEnabled = useAppSelector(
    selectWorkingDocEnabled(conversationId, "scratch"),
  );
  const attachedScratchIds = useAppSelector(
    selectAttachedScratchpadIds(conversationId),
  );
  const showScratchPill = scratchEnabled || attachedScratchIds.length > 0;

  // ── Canvas state for the doc pills' show/hide toggle ─────────────────────
  const canvas = useChatCanvasOpeners();
  const openDocuments = useOpenWorkingDocumentPanel();
  const openScratchpad = useOpenScratchpadPanel();
  const {
    isOpen: canvasOpen,
    activeSourceId: currentCanvasSourceId,
    activeArtifactId: currentCanvasArtifactId,
  } = useChatCanvasView();

  // ── Agent lists (plan / tasks / todos). Hydrate + live-subscribe here so the
  // rail is the single owner now that the standalone chip is gone. ──────────
  const hasLists = useAppSelector(selectHasAgentListsContent(conversationId));
  const taskCounts = useAppSelector(selectAgentTaskCounts(conversationId));
  const todoCounts = useAppSelector(selectUserTodoCounts(conversationId));

  useEffect(() => {
    if (!conversationId) return undefined;
    // Read once while the live mirror is open — a remount or a wake reads nothing.
    void dispatch(ensureAgentLists(conversationId));
    dispatch(subscribeAgentLists(conversationId));
    return () => {
      dispatch(unsubscribeAgentLists(conversationId));
    };
  }, [conversationId, dispatch]);

  // ── Does this agent declare a context policy sourced from a scope's context
  // item whose scope TYPE isn't currently active? An unrelated org/scope being
  // active (e.g. a law-firm org while this agent needs a "Goal" scope) must
  // still nudge — checking active layers alone would wrongly stay silent just
  // because *something* is active. Missing this means the slot silently
  // resolves to nothing server-side with no visible explanation. ────────────
  const agentContextPolicies = useAppSelector((state) =>
    agentId ? selectAgentContextPolicies(state, agentId) : undefined,
  );
  const activeScopeIdsByType = useAppSelector(selectActiveScopeIdsByType);
  const needsScope = (agentContextPolicies ?? []).some((s) => {
    if (s.source?.kind !== "ctx_item") return false;
    const scopeTypeId = s.source.scope_type_id;
    return !scopeTypeId || !activeScopeIdsByType[scopeTypeId]?.length;
  });
  const showSetScopeCta = needsScope;

  // ── Detail surfaces ────────────────────────────────────────────────────────
  // The full view (every value + full control) is the conversation's context
  // tab in the canvas: same pill again → close; a different pill → switch.
  const contextTab = useConversationContextTab(conversationId, agentId ?? null);
  // The agent lists are the conversation's lists tab in the canvas.
  const listsTab = useConversationListsTab(conversationId);

  const toggleEntry = (key: string) => {
    contextTab.toggle(key);
  };

  /**
   * Doc pill click = CANVAS VISIBILITY TOGGLE: open the canvas on this doc,
   * or close it if it's already showing this doc. Deliberately not the detail
   * sheet — the pill is the "see it / hide it" affordance; management lives in
   * the docs menu. Each pill opens the ONE tab its document has: the Doc pill
   * this conversation's Documents tab, the Scratch pill the scratchpad tab —
   * the same tabs the header Canvas button, a tool's result bar and the
   * editor's "Open in Canvas" open (host/canvas-tabs.ts).
   */
  const toggleDocInCanvas = (kind: "working" | "scratch") => {
    if (kind === "scratch" && !activeScratchId) {
      // The pill is on screen, so the click must produce something. There is
      // no scratchpad bound to this conversation yet — say so with the fix.
      reportCanvasOpenDrop({
        reason: "nothing-to-show",
        requested: scratchTitle?.trim() || "Scratchpad",
        detail: "no scratchpad is attached to this conversation yet",
      });
      return;
    }
    const tabId =
      kind === "scratch"
        ? scratchpadTabId()
        : conversationDocumentsTabId(conversationId);
    if (canvasOpen && currentCanvasSourceId === tabId) {
      canvas.hide();
      return;
    }
    if (kind === "scratch") {
      // gateConversationId: the CHAT this pill lives in — lets the scratchpad
      // tab offer its per-document "Share with this chat" toggle.
      openScratchpad({ gateConversationId: conversationId });
    } else {
      openDocuments({ conversationId, initialKind: "working" });
    }
  };

  /**
   * "Work in a cloud browser" — an ATTACHMENT-style affordance: the user hands
   * the agent a persistent cloud browser to act in, the same way they attach a
   * document. It opens the Cloud Browser as a CANVAS ITEM (the canvas is the
   * host — no bespoke overlay), deduped on a stable per-chat source id so
   * clicking again hides it. The live run/handoff state lives in the body
   * (NON_PERSISTABLE); this pill is the show/hide + "give the agent a browser"
   * control.
   */
  const cloudBrowserSourceId = cloudBrowserCanvasSourceId(conversationId);
  const cloudBrowserRunLive = useAppSelector(selectCloudBrowserRunLive);
  const cloudBrowserActive =
    cloudBrowserRunLive ||
    (canvasOpen && currentCanvasSourceId === cloudBrowserSourceId);
  const openCloudBrowser = useOpenCloudBrowserCanvas();
  const toggleCloudBrowser = () => {
    if (canvasOpen && currentCanvasSourceId === cloudBrowserSourceId) {
      canvas.hide();
      return;
    }
    // The ONE opener — it carries the chat binding the takeover flow needs.
    openCloudBrowser({ conversationId });
  };

  // ── Working context (Scopes) lives in PlusAttachMenu's ContextLensBar row.
  const buildItems = (): RailItem[] => {
    // These items mirror inputs already delivered through another canonical
    // channel (usually required named variables). They make delivery visible;
    // they never add a second copy to the execution payload.
    const out: RailItem[] = attachedItems.map((item) => ({
      ...item,
      id: `attached:${item.id}`,
      tone: "primary",
    }));
    const valued = entries.filter(entryHasValue);

    if (workingDocEnabled) {
      out.push({
        id: "working_document",
        icon: FileText,
        label: workingDocTitle?.trim() || "Working document",
        word: "Doc",
        tone: "primary",
        busy: workingDocSaving,
        detail: workingDocSaving ? "Saving…" : "Live",
        hint: "Click: show / hide in canvas · X: turn off for this chat",
        active:
          canvasOpen &&
          currentCanvasSourceId === conversationDocumentsTabId(conversationId),
        onOpen: () => toggleDocInCanvas("working"),
        onRemove: () =>
          void dispatch(
            setConversationDocumentEnabledThunk({
              conversationId,
              kind: "working",
              enabled: false,
            }),
          ),
      });
    }
    if (showScratchPill) {
      out.push({
        id: "scratchpad",
        icon: NotebookPen,
        label: scratchTitle?.trim() || "Scratchpad",
        word: "Scratch",
        busy: scratchSaving,
        detail:
          attachedScratchIds.length > 0
            ? `+${attachedScratchIds.length} attached`
            : "Read-only to agent",
        hint: "Click: show / hide in canvas · X: turn off for this chat",
        active:
          canvasOpen && currentCanvasSourceId === scratchpadTabId(),
        onOpen: () => toggleDocInCanvas("scratch"),
        onRemove: () =>
          void dispatch(
            setScratchpadGateThunk({ conversationId, enabled: false }),
          ),
      });
    }

    if (hasLists) {
      const open = todoCounts.open;
      out.push({
        id: "lists",
        icon: ListChecks,
        label: "Tasks & todos",
        word: "Tasks",
        detail:
          taskCounts.total > 0
            ? `${taskCounts.done}/${taskCounts.total}${open > 0 ? ` · ${open}` : ""}`
            : open > 0
              ? `${open} todo${open === 1 ? "" : "s"}`
              : undefined,
        hint: "Click: open the task panel",
        active: listsTab.isVisible,
        onOpen: listsTab.toggle,
      });
    }

    // The cloud-browser pill appears only while a browser is actually in use
    // (canvas open here, or a live run) — the ENTRY point is the `+` attach
    // menu, never a standing control (Arman 2026-08-21).
    if (cloudBrowserActive) {
      out.push({
        id: "cloud-browser",
        icon: Globe,
        label: "Cloud browser",
        word: "Browser",
        detail: cloudBrowserRunLive ? "Live" : undefined,
        hint: "Click: show / hide the browser in canvas",
        active: canvasOpen && currentCanvasSourceId === cloudBrowserSourceId,
        onOpen: toggleCloudBrowser,
      });
    }

    const presentedByHost = new Set(
      attachedItems.flatMap((item) =>
        item.contextKey ? [item.contextKey] : [],
      ),
    );
    for (const e of valued) {
      // A host pill already presents this entry (see `contextKey`).
      if (presentedByHost.has(e.key)) continue;
      // The page's surface values live in the one page-context chip.
      if (surfaceKeySet.has(e.key)) continue;
      // Doc-like keys (working doc, scratchpad, attached-scratchpad extras):
      // when their slice-driven pill rendered above, never re-surface the
      // published context value as a generic pill. But a doc-kind entry can
      // be published by a NON-editor-slice source (War Room / Scribe publish
      // the studio session document under `working_document`), in which case
      // there is no slice pill — hiding the entry would make the rail LIE
      // about what the agent receives. The rail is the truth of the wire:
      // anything published must show. Fall through to a generic pill so the
      // user can see and inspect it (X removes it from context like any
      // other entry).
      const docKind = docKindForContextKey(e.key);
      if (docKind !== null) {
        const slicePillShown =
          docKind === "working" ? workingDocEnabled : showScratchPill;
        if (slicePillShown) continue;
      }

      // Pinned canvas artifacts (key = canvas_items UUID) — open in canvas
      // with version history; X unpins from context (row is kept).
      if (isCanvasItemContextKey(e.key) && isCanvasItemContextValue(e.value)) {
        const label = e.label?.trim() || e.value.label || "Artifact";
        out.push({
          id: `artifact:${e.key}`,
          icon: Code2,
          label,
          word: label || "Code",
          detail: `v${e.value.source.base_version}`,
          hint: "Click: open in canvas · X: unpin",
          tone: "primary",
          active:
            canvasOpen &&
            (currentCanvasSourceId === e.key ||
              currentCanvasArtifactId === e.key),
          onOpen: () => {
            canvas.openPointer({
              artifactId: e.key,
              type: "code",
              metadata: {
                title: label,
                canvasItemId: e.key,
                conversationId,
              },
            });
          },
          onRemove: () =>
            dispatch(removeContextEntry({ conversationId, key: e.key })),
        });
        continue;
      }

      // 🚨 THE COMPOSER IS NOT A VARIABLE INSPECTOR. This is the ad-hoc
      // branch: an entry nobody gave a human label, so the chip falls back to
      // the raw key — which is how an Expert being interviewed about her own
      // judgment was shown `content` `surface` `rulebook_id` `lane` and a
      // "···16" overflow badge on every single turn. Those entries are set by
      // code, for the agent; the person never attached them and cannot act on
      // them. Her named attachments (documents, lists, canvas items) are built
      // by the branches ABOVE and are untouched.
      if (!machineFramesVisible) continue;
      const Icon = CONTEXT_TYPE_ICON[e.type] ?? FALLBACK_CONTEXT_ICON;
      const label = contextEntryLabel(e);
      out.push({
        id: `ctx:${e.key}`,
        icon: Icon,
        label,
        // THE WHOLE LABEL, TRUNCATED BY WIDTH (lane HANDOVER, 2026-09-29): its first word made
        // "Table ID", "Table Name" and "Table Columns" three chips that all read "Table".
        word: label,
        hint: "Click: view details · X: remove",
        active: contextTab.isVisible && contextTab.selected === e.key,
        onOpen: () => toggleEntry(e.key),
        onRemove: () =>
          dispatch(removeContextEntry({ conversationId, key: e.key })),
      });
    }

    return out;
  };
  const items = buildItems();

  // ── Inline vs overflow split. Keep the highest-priority pills visible; fold
  // the rest into a clean "…" menu so the rail never wraps. ──────────────────
  const maxInline = isMobile ? 2 : 5;
  const inline: RailItem[] =
    presentation === "overflow-only"
      ? []
      : items.length <= maxInline
        ? items
        : items.slice(0, maxInline - 1);
  const overflow: RailItem[] =
    presentation === "overflow-only"
      ? items
      : items.length <= maxInline
        ? []
        : items.slice(maxInline - 1);

  // The detail surfaces are mounted ONCE, at the same position in the tree,
  // whether or not the rail itself shows — so a value that drops out of the
  // rail (or the rail emptying) never remounts an open panel.
  const detailSurfaces = (
    <DetailSurfaces conversationId={conversationId} />
  );

  // Zero footprint when there's nothing to surface. The attachment chips
  // decide for themselves whether they render, so with attachments the row is
  // always mounted and shows only while it holds an entry ([data-rail-entry]).
  const railShown =
    items.length > 0 || showSetScopeCta || contextChipShown || withAttachments;

  // ONE row (Arman, 2026-10-01): LEFT = what the person attached (attachment
  // chips, rail pills, the "+N" overflow), scrolling sideways when it runs
  // out of room; RIGHT = the value-group chip, pinned, never wraps away.
  return (
    <>
      {railShown ? (
        <div
          className={cn(
            "flex min-w-0 items-center gap-1.5 px-0.5 pb-1",
            withAttachments && "hidden has-[[data-rail-entry]]:flex",
            className,
          )}
          data-surface-value={surfaceValueName}
        >
          <div className="scrollbar-none flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto">
            {showSetScopeCta && (
              <span
                data-rail-entry=""
                className="shrink-0 rounded-md ring-1 ring-inset ring-amber-500/60"
                title="This agent needs a scope you haven't set yet"
              >
                <ActiveContextButton size="xs" iconOnly className="shrink-0" />
              </span>
            )}
            {withAttachments ? (
              <>
                <SmartAgentResourceChips
                  conversationId={conversationId}
                  surfaceValueName={attachmentsSurfaceValueName}
                  inline
                />
                <AttachedDocumentChips conversationId={conversationId} inline />
              </>
            ) : null}
            {inline.map((item) => (
              <RailPill key={item.id} item={item} />
            ))}
            {overflow.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  data-rail-entry=""
                  title={`${overflow.length} more`}
                  aria-label={`${overflow.length} more`}
                  className={cn(
                    "inline-flex h-6 shrink-0 items-center gap-1 rounded-md border border-border px-2",
                    "text-xs font-medium text-muted-foreground transition-colors",
                    "hover:bg-muted/60 hover:text-foreground",
                  )}
                >
                  <MoreHorizontal className="h-3.5 w-3.5" />
                  <span className="tabular-nums">{overflow.length}</span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" side="top" className="w-56">
                {overflow.map((item) => {
                  const Icon = item.icon;
                  return (
                    <DropdownMenuItem
                      key={item.id}
                      onSelect={() => {
                        // Let the overflow menu release its Radix body lock before
                        // the next surface (a canvas tab, a dialog) takes ownership.
                        void openAfterCurrentLayerCloses(item.onOpen);
                      }}
                      className="gap-2"
                    >
                      {item.busy ? (
                        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
                      ) : (
                        <Icon
                          className={cn(
                            "h-4 w-4 shrink-0",
                            item.tone === "primary"
                              ? "text-primary"
                              : "text-muted-foreground",
                          )}
                        />
                      )}
                      <span className="min-w-0 flex-1 truncate">
                        {item.label}
                      </span>
                      {item.detail && (
                        <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                          {item.detail}
                        </span>
                      )}
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
            )}
          </div>
          {contextChipShown ? (
            <div data-rail-entry="" className="ml-auto flex shrink-0 items-center">
              <ConversationContextChip
                conversationId={conversationId}
                agentId={agentId ?? null}
              />
            </div>
          ) : null}
        </div>
      ) : null}
      {detailSurfaces}
    </>
  );
}

// ── Pill ─────────────────────────────────────────────────────────────────────

/**
 * Tiny pill: icon + ONE word. Everything else (full name, status, click hint)
 * lives in the tooltip; a floating X (hover/focus reveal, always visible on
 * touch) detaches the item from this conversation's context.
 */
function RailPill({ item }: { item: RailItem }) {
  const Icon = item.icon;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span data-rail-entry="" className="group relative inline-flex shrink-0">
          <button
            type="button"
            onClick={item.onOpen}
            aria-label={item.label}
            className={cn(
              "inline-flex h-6 min-w-0 items-center gap-1 rounded-md border px-2",
              "text-xs font-medium transition-colors",
              item.active
                ? item.tone === "primary"
                  ? "border-primary bg-primary/15 text-primary ring-1 ring-inset ring-primary/30"
                  : "border-foreground/20 bg-muted text-foreground ring-1 ring-inset ring-foreground/10"
                : item.tone === "primary"
                  ? "border-primary/30 bg-primary/5 text-primary hover:bg-primary/10"
                  : "border-border bg-card text-muted-foreground hover:bg-muted/60 hover:text-foreground",
            )}
          >
            {item.busy ? (
              <Loader2 className="h-3 w-3 shrink-0 animate-spin" />
            ) : (
              <Icon className="h-3 w-3 shrink-0" />
            )}
            <span className="max-w-[4.5rem] truncate">{item.word}</span>
          </button>
          {item.onRemove && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                item.onRemove?.();
              }}
              aria-label={`Remove ${item.label}`}
              className={cn(
                "absolute -right-1 -top-1 z-10 flex h-3.5 w-3.5 items-center justify-center rounded-full",
                "border border-border bg-background text-muted-foreground shadow-sm",
                "transition-opacity hover:bg-destructive hover:text-destructive-foreground",
                "opacity-0 focus-visible:opacity-100 group-hover:opacity-100",
                "pointer-coarse:opacity-100",
              )}
            >
              <X className="h-2.5 w-2.5" />
            </button>
          )}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[16rem]">
        <div className="font-medium text-popover-foreground">{item.label}</div>
        {item.detail && (
          <div className="mt-0.5 text-muted-foreground">{item.detail}</div>
        )}
        {item.hint && (
          <div className="mt-0.5 text-[10px] text-muted-foreground/80">
            {item.hint}
          </div>
        )}
      </TooltipContent>
    </Tooltip>
  );
}

// ── Detail surfaces (kept in one place so they mount once) ────────────────────

function DetailSurfaces({ conversationId }: { conversationId: string }) {
  // Agent-initiated Cloud Browser open: when a run raises a human-handoff,
  // the Cloud Browser opens in the canvas (same surface the pill opens).
  return <CloudBrowserHandoffCanvasOpener conversationId={conversationId} />;
}
