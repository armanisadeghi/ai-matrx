"use client";

/**
 * ChatCanvasWorkspace — "chat beside a canvas" (Amendment 1, A5).
 *
 *   left nav · chat panel · canvas · properties panel
 *
 * One component, four switches: nav (collapsed / hover / open), chat (docked /
 * floating, and open / closed — many pages start with it closed), properties
 * (open / closed), and the composer's own input growth. Every side panel is a
 * `DockedSidePanel`: it slides open and closed and the person drags its edge to
 * any width between its min and max (remembered per person). GENERIC: the host
 * passes its canvas (which draws its own toolbar + zoom), a title, and
 * optionally a record (Share + comments), properties tabs, and a
 * `getCanvasContext()` that reaches the agent as ONE named context entry.
 *
 * Every piece is an existing platform piece with a facelift
 * (common-docs/projects/ai-matrx-composer/MAP.md): the chat is
 * `AgentConversationColumn`, history is `ConversationHistorySidebar`, the user
 * row is the shell's `UserMenuPanel`, the floating window is
 * `MatrxFloatingFrame` (container-bounded), Agents / Inbox / Share / comments
 * are the shell's own buttons.
 *
 * The app shell stays mounted underneath, flipped into canvas chrome
 * (<ShellChromeMode/>, styles/shell.css §13c).
 */

import { useEffect, useEffectEvent, useState, type ReactNode } from "react";
import {
  ChevronDown,
  Maximize,
  Maximize2,
  Menu,
  MessageSquare,
  Minimize,
  PanelLeftClose,
  PanelRight,
  PanelRightOpen,
  PictureInPicture2,
  X,
} from "lucide-react";
import type { EntityTypeToken } from "@ai-matrx/associations";
import { cn } from "@/lib/utils";
import { useAppSelector } from "@/lib/redux/hooks";
import { useMediaQueryState } from "@/hooks/use-media-query";
import { MatrxFloatingFrame } from "@/components/matrx/resizable/MatrxFloatingFrame";
import { DockedSidePanel } from "@/components/official/side-panel/DockedSidePanel";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EntityCommentPopover } from "@/components/comments/EntityCommentPopover";
import { ShareButton } from "@/features/sharing/components/ShareButton";
import type { ResourceType } from "@/utils/permissions/types";
import { SurfaceAgentsHeaderButton } from "@/features/surfaces/components/chrome/SurfaceAgentsHeaderButton";
import { InboxHeaderButton } from "@/features/notifications/components/InboxHeaderButton";
import { selectIsAuthenticated } from "@/lib/redux/selectors/userSelectors";
import { ComposerModeSwitch } from "@/features/agents/components/inputs/smart-input/composer/ComposerModeSwitch";
import type { ComposerMode } from "@/features/agents/components/inputs/smart-input/composer/composer-types";
import { COMPOSER_KNOBS } from "@/features/agents/components/inputs/smart-input/composer/composer-mode-cookie";
import type { AttachedContextRailItem } from "@/features/agents/components/inputs/smart-input/ConversationContextRail";
import { useSessionKnob } from "@/lib/scoped-config/sessionKnob";
import { ShellChromeMode } from "@/features/shell/components/ShellChromeMode";
import {
  CanvasNav,
  CanvasNavToggle,
  useCanvasNavState,
} from "@/features/shell/canvas-chrome/CanvasNav";
import { aMenuOrPopoverIsOpen } from "@/features/shell/canvas-chrome/open-layer";
import { CanvasChatColumn, type CanvasContextEntry } from "./CanvasChatColumn";
import {
  CanvasPropertiesPanel,
  type CanvasPropertiesTab,
} from "./CanvasPropertiesPanel";
import { useCanvasWorkspaceConversation } from "./useCanvasWorkspaceConversation";
import { ChatPanelTitleMenu, useChatPanelTitle } from "./ChatPanelTitleMenu";
import { PageContextRow } from "./PageContextRow";
import { useConversationFollowsPage } from "@/features/surfaces/runtime/useConversationFollowsPage";
import {
  CANVAS_CHAT_SIZES,
  CANVAS_NAV_SIZES,
  CANVAS_PANEL_IDS,
  CANVAS_PROPERTIES_SIZES,
  writeCanvasChatCookie,
  writeCanvasFollowsPageCookie,
  writeCanvasPropertiesCookie,
  type CanvasChatPlacement,
  type CanvasChatState,
  type CanvasWorkspaceLayout,
} from "./workspace-cookies";

const FLOATING_FALLBACK = { width: 340, height: 400 };
/** Below this the workspace is one pane: the canvas, with chat / nav / properties in sheets. */
const COMPACT_QUERY = "(max-width: 1023px)";
/** Conversation-history scope for the canvas nav (shared across canvas pages). */
const CANVAS_HISTORY_SCOPE = "canvas-nav";

export interface ChatCanvasWorkspaceRecord {
  resourceType: ResourceType;
  resourceId: string;
  resourceName: string;
  /** The record's comment token. Absent = no comments control. */
  commentToken?: EntityTypeToken;
}

export interface ChatCanvasWorkspaceProps {
  /** Stable id: cookies + the chat's surface key. */
  id: string;
  /** The host's canvas — it draws its own toolbar and zoom. */
  canvas: ReactNode;
  /**
   * The canvas header's title. Absent on a host whose pages bring their own
   * header content: every `<PageHeader>` / `<RouteHeader>` inside the
   * workspace portals into the canvas header (a module's own menu), not the
   * hidden shell header.
   */
  title?: string;
  /** Items for the title ▾ (DropdownMenuItem elements). Absent = no ▾. */
  titleMenu?: ReactNode;
  /** "By you". */
  byline?: string;
  /** Share + comments. Absent = those controls are absent. */
  record?: ChatCanvasWorkspaceRecord;
  /** Absent = no properties panel. */
  properties?: { tabs: CanvasPropertiesTab[] };
  /** The canvas as ONE context entry — never user input. Called at send time; keep it cheap. */
  getCanvasContext?: () => CanvasContextEntry;
  /** Shown in the composer's context rail. */
  contextChip?: AttachedContextRailItem;
  /** Server-read (`readCanvasWorkspaceLayout`), so the first paint is the layout the person left. */
  initialLayout?: CanvasWorkspaceLayout;
  /** Whether the chat starts open for someone who has not chosen yet (default true). */
  defaultChatOpen?: boolean;
  /**
   * The chat sees the PAGE the person is on and follows them from page to page
   * (a module hosted in the workspace, e.g. education). Off for a canvas that
   * publishes its own surface (the spatial board).
   */
  followPageSurface?: boolean;
  /** Server-read cookie (`readComposerModeCookie`). */
  initialMode?: ComposerMode | null;
  /** Absent = no close button. */
  onClose?: () => void;
}

function isToggleShortcut(e: KeyboardEvent): boolean {
  return (e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key === "\\";
}

/** Like the global canvas sheet: a shortcut never fires while the person is typing. */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT"
  );
}

function readFloatingSize(value: unknown): { width: number; height: number } {
  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    const width = record.width ?? record.w;
    const height = record.height ?? record.h;
    if (
      typeof width === "number" &&
      typeof height === "number" &&
      width >= 240 &&
      height >= 200
    ) {
      return { width, height };
    }
  }
  return FLOATING_FALLBACK;
}

const ICON_BUTTON =
  "flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground";

export function ChatCanvasWorkspace({
  id,
  canvas,
  title,
  titleMenu,
  byline,
  record,
  properties,
  getCanvasContext,
  contextChip,
  initialLayout,
  defaultChatOpen = true,
  followPageSurface = false,
  initialMode = null,
  onClose,
}: ChatCanvasWorkspaceProps) {
  // `null` until the viewport is known (server, hydration): layout treats it as
  // wide (CSS hides the wide panels on a phone), but nothing LAUNCHES on a guess.
  const viewportCompact = useMediaQueryState(COMPACT_QUERY);
  const compact = viewportCompact === true;
  const isAuthenticated = useAppSelector(selectIsAuthenticated);
  const surfaceKey = `canvas-workspace:${id}`;
  const nav = useCanvasNavState(initialLayout?.nav ?? "collapsed");

  const [chatState, setChatStateRaw] = useState<CanvasChatState>(
    initialLayout?.chat ?? { placement: "side", open: defaultChatOpen },
  );
  const [mobileSheet, setMobileSheet] = useState<
    "chat" | "nav" | "properties" | null
  >(null);
  const [fullScreen, setFullScreen] = useState(false);
  // The chat is on screen right now — docked or floating on a wide screen, the
  // sheet on a phone. Nothing launches until it is: a chat that starts closed
  // costs nothing, and a phone's first render never launches on a guess.
  const chatOnScreen =
    viewportCompact === null
      ? false
      : viewportCompact
        ? mobileSheet === "chat"
        : chatState.open && !fullScreen;
  const chat = useCanvasWorkspaceConversation(surfaceKey, { enabled: chatOnScreen });
  const [propertiesOpen, setPropertiesOpenRaw] = useState(initialLayout?.propertiesOpen ?? true);
  const [canvasEl, setCanvasEl] = useState<HTMLDivElement | null>(null);
  const floatingSize = readFloatingSize(
    useSessionKnob(COMPOSER_KNOBS.floatingPanelSize),
  );

  const placement = chatState.placement;
  const setChatState = (next: CanvasChatState) => {
    setChatStateRaw(next);
    writeCanvasChatCookie(id, next);
  };
  /** Dock or float the chat — always open. */
  const setPlacement = (next: CanvasChatPlacement) => setChatState({ placement: next, open: true });
  const openChat = () => {
    setFullScreen(false);
    setChatState({ placement, open: true });
  };
  const closeChat = () => setChatState({ placement, open: false });
  const openMobileChat = () => setMobileSheet("chat");
  /** Nav "+" / history: the conversation shows wherever the chat is — opening it if hidden. */
  const newChatInPanel = () => {
    chat.startNew();
    if (compact) openMobileChat();
    else if (!chatState.open || fullScreen) openChat();
  };
  const setPropertiesOpen = (open: boolean) => {
    setPropertiesOpenRaw(open);
    writeCanvasPropertiesCookie(id, open);
  };

  // ⌘\ shows / hides the chat (the global canvas sheet stands down here).
  const onShortcut = useEffectEvent(() => {
    if (compact) setMobileSheet((open) => (open === "chat" ? null : "chat"));
    else if (chatState.open && !fullScreen) closeChat();
    else openChat();
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!isToggleShortcut(e) || isTypingTarget(e.target)) return;
      e.preventDefault();
      onShortcut();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Esc leaves full screen (unless a menu / popover is holding the key).
  // Capture phase: a canvas that uses Escape itself (the spatial board clears
  // its selection and prevents the default) must not swallow the way out.
  useEffect(() => {
    if (!fullScreen) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (aMenuOrPopoverIsOpen()) return;
      setFullScreen(false);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [fullScreen]);

  const conversationId = chat.conversationId;
  const [followsPage, setFollowsPageState] = useState(initialLayout?.followsPage ?? true);
  const setFollowsPage = (on: boolean) => {
    setFollowsPageState(on);
    writeCanvasFollowsPageCookie(id, on);
  };
  // Passing no conversation keeps the hook inert for a host that does not follow the page.
  const { pageSurfaceLabel } = useConversationFollowsPage(
    followPageSurface ? conversationId : null,
    followsPage,
  );
  const chatTitle = useChatPanelTitle(conversationId);

  const chatColumn = (
    <CanvasChatColumn
      conversation={chat.conversation}
      surfaceKey={surfaceKey}
      getCanvasContext={getCanvasContext}
      contextChip={contextChip}
      onSelectAgent={chat.startWith}
      initialMode={initialMode}
    />
  );

  const openFromHistory = (conversation: { conversationId: string }) => {
    chat.openExisting(conversation.conversationId);
    if (compact) setMobileSheet("chat");
    else if (!chatState.open || fullScreen) openChat();
  };

  const hasProperties = properties !== undefined && properties.tabs.length > 0;
  const navCollapsed = nav.state !== "open";
  const navShown = !fullScreen && nav.state !== "collapsed";
  const chatShown = !fullScreen && chatState.open;
  const showDockedChat = chatShown && placement === "side";
  const showFloatingChat = !compact && chatShown && placement === "floating";
  const showProperties = !fullScreen && hasProperties && propertiesOpen;
  const navToggleInCanvasHeader = !compact && navCollapsed && !showDockedChat;

  const chatTitleMenu = (
    <ChatPanelTitleMenu conversationId={conversationId} onNewChat={chat.startNew} />
  );

  const canvasTitle = !title ? null : titleMenu ? (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex h-7 min-w-0 items-center gap-1 rounded-md px-1.5 text-sm font-medium text-foreground hover:bg-accent"
        >
          <span className="min-w-0 truncate">{title}</span>
          <ChevronDown
            className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        {titleMenu}
      </DropdownMenuContent>
    </DropdownMenu>
  ) : (
    <h1 className="min-w-0 truncate px-1.5 text-sm font-medium text-foreground">
      {title}
    </h1>
  );

  return (
    <div className="relative flex h-full min-h-0 w-full overflow-hidden bg-background text-foreground">
      <ShellChromeMode mode="canvas" />

      {/* ── Left nav: in the layout when open, sliding over the page on hover ── */}
      {!compact ? (
        <DockedSidePanel
          panelId={CANVAS_PANEL_IDS.nav}
          edge="left"
          open={navShown}
          overlay={nav.overlay}
          // Hover is tracked on the whole panel — its resize handle included —
          // so reaching for the handle never closes a hover preview.
          onPointerEnter={(e) => {
            if (nav.state === "hover" && e.pointerType === "mouse") nav.hoverEnter();
          }}
          onPointerLeave={(e) => {
            if (nav.state === "hover" && e.pointerType === "mouse") nav.hoverLeave();
          }}
          sizes={CANVAS_NAV_SIZES}
          initialWidth={initialLayout?.widths.nav}
          onCollapse={() => nav.collapse()}
          aria-label="Navigation"
          outerClassName="max-lg:hidden"
          className={nav.overlay ? undefined : "border-r border-border"}
        >
          <CanvasNav
            nav={nav}
            historyScopeId={CANVAS_HISTORY_SCOPE}
            activeConversationId={conversationId}
            onOpenConversation={openFromHistory}
            onNewChat={newChatInPanel}
          />
        </DockedSidePanel>
      ) : null}

      {/* ── Chat panel (docked). Stays mounted while closed (the conversation
          keeps its place); the column itself lives in exactly ONE place —
          here while docked, the floating window while floating. ── */}
      {!compact ? (
        <DockedSidePanel
          panelId={CANVAS_PANEL_IDS.chat}
          edge="left"
          open={showDockedChat}
          sizes={CANVAS_CHAT_SIZES}
          initialWidth={initialLayout?.widths.chat}
          onCollapse={closeChat}
          aria-label="Chat"
          outerClassName="max-lg:hidden"
          className="border-r border-border bg-card"
        >
          <div className="flex h-11 shrink-0 items-center gap-1 border-b border-border px-2">
            {navCollapsed ? <CanvasNavToggle nav={nav} /> : null}
            <div className="min-w-0 flex-1">{chatTitleMenu}</div>
            <ComposerModeSwitch size="panel" initialMode={initialMode} />
            <button
              type="button"
              aria-label="Pop out chat"
              title="Pop out chat"
              onClick={() => setPlacement("floating")}
              className={cn(ICON_BUTTON, "ml-1")}
            >
              <PictureInPicture2 className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label="Hide chat"
              title="Hide chat (Ctrl/Cmd + \)"
              onClick={closeChat}
              className={ICON_BUTTON}
            >
              <PanelLeftClose className="h-4 w-4" />
            </button>
          </div>
          {followPageSurface ? (
            <PageContextRow label={pageSurfaceLabel} on={followsPage} onToggle={() => setFollowsPage(!followsPage)} />
          ) : null}
          <div className="flex min-h-0 flex-1 flex-col">
            {placement === "side" && (chatOnScreen || conversationId) ? chatColumn : null}
          </div>
        </DockedSidePanel>
      ) : null}

      {/* ── Canvas area ── */}
      <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex h-11 shrink-0 items-center gap-1.5 border-b border-border px-3">
          {/* Compact (< 1024px) and wide controls are BOTH rendered and chosen by
              CSS, so a phone's first paint is right before JavaScript measures. */}
          <button
            type="button"
            aria-label="Open navigation"
            onClick={() => setMobileSheet("nav")}
            className={cn(ICON_BUTTON, "h-11 w-11 lg:hidden")}
          >
            <Menu className="h-5 w-5" />
          </button>
          <button
            type="button"
            aria-label="Chat"
            onClick={openMobileChat}
            className={cn(ICON_BUTTON, "h-11 w-11 lg:hidden")}
          >
            <MessageSquare className="h-5 w-5" />
          </button>
          {navToggleInCanvasHeader ? (
            <CanvasNavToggle nav={nav} className="max-lg:hidden" />
          ) : null}
          {/* The way back to a hidden chat sits where the chat opens — on the left. */}
          {!chatShown ? (
            <button
              type="button"
              onClick={openChat}
              aria-label="Show chat"
              title="Show chat (Ctrl/Cmd + \)"
              className="flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2 text-sm font-medium text-foreground hover:bg-accent max-lg:hidden"
            >
              <MessageSquare className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              Chat
            </button>
          ) : null}
          {canvasTitle ? <div className="flex min-w-0 max-w-[40%] shrink items-center">{canvasTitle}</div> : null}
          {/* A hosted module's own header (<PageHeader>/<RouteHeader>) portals here. */}
          <div data-page-header-target="workspace" className="shell-header-center" />
          <div data-page-header-right-target="workspace" className="flex shrink-0 items-center gap-1 empty:hidden" />
          {byline ? (
            <span className="shrink-0 text-xs text-muted-foreground max-lg:hidden">
              {byline}
            </span>
          ) : null}

          <div className="flex shrink-0 items-center lg:hidden">
            {properties && properties.tabs.length > 0 ? (
              <button
                type="button"
                aria-label="Properties"
                onClick={() => setMobileSheet("properties")}
                className={cn(ICON_BUTTON, "h-11 w-11")}
              >
                <PanelRightOpen className="h-5 w-5" />
              </button>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-1.5 max-lg:hidden">
            {hasProperties ? (
              <button
                type="button"
                aria-label={propertiesOpen ? "Hide properties" : "Show properties"}
                aria-pressed={propertiesOpen}
                title={propertiesOpen ? "Hide properties" : "Show properties"}
                onClick={() => setPropertiesOpen(!propertiesOpen)}
                className={cn(ICON_BUTTON, showProperties && "bg-primary/10 text-primary")}
              >
                <PanelRight className="h-4 w-4" />
              </button>
            ) : null}
          </div>

          <SurfaceAgentsHeaderButton isAuthenticated={isAuthenticated} />
          <InboxHeaderButton isAuthenticated={isAuthenticated} />
          {record?.commentToken ? (
            <EntityCommentPopover
              token={record.commentToken}
              id={record.resourceId}
              className="h-7"
            />
          ) : null}
          {record ? (
            <ShareButton
              resourceType={record.resourceType}
              resourceId={record.resourceId}
              resourceName={record.resourceName}
              size="sm"
              className="h-7 bg-foreground px-2.5 text-background hover:bg-foreground/90"
            />
          ) : null}
          <button
            type="button"
            aria-label={fullScreen ? "Exit full screen" : "Full screen"}
            title={fullScreen ? "Exit full screen (Esc)" : "Full screen"}
            onClick={() => setFullScreen((on) => !on)}
            className={cn(ICON_BUTTON, "max-lg:hidden")}
          >
            {fullScreen ? (
              <Minimize className="h-4 w-4" />
            ) : (
              <Maximize className="h-4 w-4" />
            )}
          </button>
          {onClose ? (
            <button
              type="button"
              aria-label="Close"
              onClick={onClose}
              className={cn(ICON_BUTTON, "max-lg:h-11 max-lg:w-11")}
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </header>

        <div className="flex min-h-0 flex-1">
          {/* The canvas slot — `isolate` keeps the floating chat's z-order inside it. */}
          <div
            ref={setCanvasEl}
            className="relative isolate min-h-0 min-w-0 flex-1 overflow-hidden"
          >
            {canvas}
            {showFloatingChat ? (
              <MatrxFloatingFrame
                // Re-seat at the knob's size once it answers.
                key={`${floatingSize.width}x${floatingSize.height}`}
                id={`canvas-chat:${id}`}
                title={chatTitle}
                container={canvasEl}
                width={floatingSize.width}
                height={floatingSize.height}
                minWidth={300}
                minHeight={260}
                initialFocus={false}
                onClose={closeChat}
                contentClassName="flex flex-col overflow-hidden p-0"
                className="max-lg:hidden"
                headerActions={
                  <button
                    type="button"
                    aria-label="Dock the chat"
                    title="Dock the chat"
                    onClick={() => setPlacement("side")}
                    className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                  >
                    <Maximize2 className="h-4 w-4" />
                  </button>
                }
              >
                {chatColumn}
              </MatrxFloatingFrame>
            ) : null}
          </div>

          {!compact && hasProperties && properties ? (
            <DockedSidePanel
              panelId={CANVAS_PANEL_IDS.properties}
              edge="right"
              open={showProperties}
              sizes={CANVAS_PROPERTIES_SIZES}
              initialWidth={initialLayout?.widths.properties}
              onCollapse={() => setPropertiesOpen(false)}
              aria-label="Properties"
              outerClassName="max-lg:hidden"
              className="border-l border-border"
            >
              <CanvasPropertiesPanel tabs={properties.tabs} />
            </DockedSidePanel>
          ) : null}
        </div>
      </div>

      {/* ── Compact (< 1024px): one pane; chat, nav and properties in bottom sheets ── */}
      {compact ? (
        <Drawer
          open={mobileSheet !== null}
          onOpenChange={(open) => !open && setMobileSheet(null)}
        >
          <DrawerContent className="flex h-[85dvh] flex-col pb-safe">
            <DrawerHeader className="py-2">
              <DrawerTitle className={cn("text-sm", mobileSheet === "nav" && "sr-only")}>
                {mobileSheet === "nav"
                  ? "AI Matrx"
                  : mobileSheet === "properties"
                    ? "Properties"
                    : chatTitle}
              </DrawerTitle>
              <DrawerDescription className="sr-only">
                {mobileSheet === "chat"
                  ? `The agent sees ${title ?? "this page"} with each message.`
                  : mobileSheet === "nav"
                    ? "Navigation, chat history and your account."
                    : `Properties of ${title ?? "this page"}.`}
              </DrawerDescription>
            </DrawerHeader>
            <div className="flex min-h-0 flex-1 flex-col">
              {mobileSheet === "chat" ? (
                <>
                  <div className="flex shrink-0 justify-center px-3 pb-2">
                    <ComposerModeSwitch
                      size="panel"
                      initialMode={initialMode}
                    />
                  </div>
                  {followPageSurface ? (
                    <PageContextRow label={pageSurfaceLabel} on={followsPage} onToggle={() => setFollowsPage(!followsPage)} />
                  ) : null}
                  {chatColumn}
                </>
              ) : mobileSheet === "nav" ? (
                <CanvasNav
                  nav={nav}
                  variant="sheet"
                  historyScopeId={CANVAS_HISTORY_SCOPE}
                  activeConversationId={conversationId}
                  onOpenConversation={openFromHistory}
                  onNewChat={newChatInPanel}
                />
              ) : mobileSheet === "properties" && properties ? (
                <CanvasPropertiesPanel tabs={properties.tabs} variant="sheet" />
              ) : null}
            </div>
          </DrawerContent>
        </Drawer>
      ) : null}
    </div>
  );
}
