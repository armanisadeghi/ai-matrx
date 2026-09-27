"use client";

/**
 * ChatCanvasWorkspace — "chat beside a canvas" (Amendment 1, A5).
 *
 *   left nav · chat panel · canvas · properties panel
 *
 * One component, three switches: nav (collapsed / hover / open), chat
 * (side / floating), and the composer's own input growth. GENERIC: the host
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
  ExternalLink,
  Maximize,
  Maximize2,
  Menu,
  MessageSquare,
  Minimize,
  PanelRight,
  PanelRightOpen,
  PencilLine,
  PictureInPicture2,
  Plus,
  X,
} from "lucide-react";
import type { EntityTypeToken } from "@ai-matrx/associations";
import { cn } from "@/lib/utils";
import { useAppSelector } from "@/lib/redux/hooks";
import { useMediaQuery } from "@/hooks/use-media-query";
import AppLink from "@/components/navigation/AppLink";
import { MatrxFloatingFrame } from "@/components/matrx/resizable/MatrxFloatingFrame";
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
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EntityCommentPopover } from "@/components/comments/EntityCommentPopover";
import { ShareButton } from "@/features/sharing/components/ShareButton";
import type { ResourceType } from "@/utils/permissions/types";
import { SurfaceAgentsHeaderButton } from "@/features/surfaces/components/chrome/SurfaceAgentsHeaderButton";
import { InboxHeaderButton } from "@/features/notifications/components/InboxHeaderButton";
import { selectIsAuthenticated } from "@/lib/redux/selectors/userSelectors";
import { selectConversationTitle } from "@/features/agents/redux/execution-system/conversations/conversations.selectors";
import { selectConversationListItemById } from "@/features/agents/redux/conversation-list/conversation-list.selectors";
import { conversationRenameOpener } from "@/features/agents/components/conversation-actions/rename/conversationRenameOpener";
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
import type { CanvasNavPersisted } from "@/features/shell/canvas-chrome/canvas-nav-cookie";
import { aMenuOrPopoverIsOpen } from "@/features/shell/canvas-chrome/open-layer";
import { CanvasChatColumn, type CanvasContextEntry } from "./CanvasChatColumn";
import {
  CanvasPropertiesPanel,
  type CanvasPropertiesTab,
} from "./CanvasPropertiesPanel";
import { useCanvasWorkspaceConversation } from "./useCanvasWorkspaceConversation";
import {
  writeCanvasChatCookie,
  type CanvasChatPlacement,
} from "./workspace-cookies";

export const CANVAS_CHAT_PANEL_WIDTH_PX = 440;
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
  title: string;
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
  /** Server-read cookie. */
  initialNav?: CanvasNavPersisted;
  /** Server-read cookie. */
  initialChat?: CanvasChatPlacement;
  /** Server-read cookie (`readComposerModeCookie`). */
  initialMode?: ComposerMode | null;
  /** Absent = no close button. */
  onClose?: () => void;
}

function isToggleShortcut(e: KeyboardEvent): boolean {
  return (e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key === "\\";
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
  initialNav = "collapsed",
  initialChat = "side",
  initialMode = null,
  onClose,
}: ChatCanvasWorkspaceProps) {
  const compact = useMediaQuery(COMPACT_QUERY);
  const isAuthenticated = useAppSelector(selectIsAuthenticated);
  const surfaceKey = `canvas-workspace:${id}`;
  const chat = useCanvasWorkspaceConversation(surfaceKey);
  const nav = useCanvasNavState(initialNav);

  const [placement, setPlacementState] =
    useState<CanvasChatPlacement>(initialChat);
  const [floatOpen, setFloatOpen] = useState(true);
  const [fullScreen, setFullScreen] = useState(false);
  const [canvasEl, setCanvasEl] = useState<HTMLDivElement | null>(null);
  const [mobileSheet, setMobileSheet] = useState<
    "chat" | "nav" | "properties" | null
  >(null);
  const floatingSize = readFloatingSize(
    useSessionKnob(COMPOSER_KNOBS.floatingPanelSize),
  );

  const setPlacement = (next: CanvasChatPlacement) => {
    setPlacementState(next);
    setFloatOpen(true);
    writeCanvasChatCookie(id, next);
  };
  const togglePlacement = () =>
    setPlacement(placement === "side" ? "floating" : "side");

  // ⌘\ docks / undocks the chat (the global canvas sheet stands down here).
  const onShortcut = useEffectEvent(() => {
    if (compact) setMobileSheet((open) => (open === "chat" ? null : "chat"));
    else togglePlacement();
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!isToggleShortcut(e)) return;
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
  const conversationTitle = useAppSelector((state) =>
    conversationId ? selectConversationTitle(conversationId)(state) : null,
  );
  // The server names a chat after its first turn; that name lands on the
  // conversation LIST row before the open conversation record hears of it.
  const listTitle = useAppSelector((state) =>
    conversationId
      ? (selectConversationListItemById(conversationId)(state)?.title ?? null)
      : null,
  );
  const chatTitle =
    conversationTitle?.trim() || listTitle?.trim() || "New chat";

  const chatColumn = (
    <CanvasChatColumn
      conversation={chat.conversation}
      surfaceKey={surfaceKey}
      getCanvasContext={getCanvasContext}
      contextChip={contextChip}
    />
  );

  const openFromHistory = (conversation: { conversationId: string }) => {
    chat.openExisting(conversation.conversationId);
    if (compact) setMobileSheet("chat");
    else if (placement === "floating") setFloatOpen(true);
  };

  const navCollapsed = nav.state !== "open";
  const showNav = !compact && !fullScreen && nav.state !== "collapsed";
  const showDockedChat = !compact && !fullScreen && placement === "side";
  const showFloatingChat =
    !compact && !fullScreen && placement === "floating" && floatOpen;
  const showProperties =
    !compact &&
    !fullScreen &&
    properties !== undefined &&
    properties.tabs.length > 0;
  const navToggleInCanvasHeader = !compact && navCollapsed && !showDockedChat;

  const chatTitleMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex h-7 min-w-0 items-center gap-1 rounded-md px-1.5 text-sm font-medium text-foreground hover:bg-accent"
        >
          <span className="min-w-0 truncate">{chatTitle}</span>
          <ChevronDown
            className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuItem onSelect={chat.startNew}>
          <Plus className="mr-2 h-4 w-4" />
          New chat
        </DropdownMenuItem>
        {conversationId ? (
          <>
            <DropdownMenuItem
              onSelect={() =>
                void conversationRenameOpener.open({
                  conversationId,
                  title: conversationTitle ?? listTitle,
                })
              }
            >
              <PencilLine className="mr-2 h-4 w-4" />
              Rename
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <AppLink href={`/chat/${conversationId}`}>
                <ExternalLink className="mr-2 h-4 w-4" />
                Open in full chat
              </AppLink>
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const canvasTitle = titleMenu ? (
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

      {/* ── Left nav: in the layout when open, a full-height overlay on hover ── */}
      {showNav ? (
        <CanvasNav
          nav={nav}
          historyScopeId={CANVAS_HISTORY_SCOPE}
          activeConversationId={conversationId}
          onOpenConversation={openFromHistory}
          onNewChat={chat.startNew}
          className="max-lg:hidden"
        />
      ) : null}

      {/* ── Chat panel (docked) ── */}
      {showDockedChat ? (
        <section
          aria-label="Chat"
          style={{ width: CANVAS_CHAT_PANEL_WIDTH_PX }}
          className="flex h-full min-h-0 shrink-0 flex-col border-r border-border bg-card max-lg:hidden"
        >
          <div className="flex h-11 shrink-0 items-center gap-1 border-b border-border px-2">
            {navCollapsed ? <CanvasNavToggle nav={nav} /> : null}
            <div className="min-w-0 flex-1">{chatTitleMenu}</div>
            <ComposerModeSwitch size="panel" initialMode={initialMode} />
            <button
              type="button"
              aria-label="Pop out chat"
              title="Pop out chat (Ctrl/Cmd + \)"
              onClick={() => setPlacement("floating")}
              className={cn(ICON_BUTTON, "ml-1")}
            >
              <PictureInPicture2 className="h-4 w-4" />
            </button>
          </div>
          <div className="flex min-h-0 flex-1 flex-col">{chatColumn}</div>
        </section>
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
          {navToggleInCanvasHeader ? (
            <CanvasNavToggle nav={nav} className="max-lg:hidden" />
          ) : null}
          <div className="flex min-w-0 flex-1 items-center">{canvasTitle}</div>
          {byline ? (
            <span className="shrink-0 text-xs text-muted-foreground max-lg:hidden">
              {byline}
            </span>
          ) : null}

          <div className="flex shrink-0 items-center lg:hidden">
            <button
              type="button"
              aria-label="Chat"
              onClick={() => setMobileSheet("chat")}
              className={cn(ICON_BUTTON, "h-11 w-11")}
            >
              <MessageSquare className="h-5 w-5" />
            </button>
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
            {placement === "floating" && !fullScreen ? (
              <button
                type="button"
                onClick={() => setPlacement("side")}
                title="Dock the chat (Ctrl/Cmd + \)"
                className="flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-border bg-background px-2 text-sm font-medium text-foreground hover:bg-accent"
              >
                <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
                Chat
              </button>
            ) : null}
            <button
              type="button"
              aria-label={
                placement === "side" ? "Float the chat" : "Dock the chat"
              }
              aria-pressed={placement === "side"}
              title={`${placement === "side" ? "Float" : "Dock"} the chat (Ctrl/Cmd + \\)`}
              onClick={togglePlacement}
              className={cn(
                ICON_BUTTON,
                placement === "side" &&
                  !fullScreen &&
                  "bg-primary/10 text-primary",
              )}
            >
              <PanelRight className="h-4 w-4" />
            </button>
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
                onClose={() => setFloatOpen(false)}
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

          {showProperties && properties ? (
            <CanvasPropertiesPanel
              tabs={properties.tabs}
              className="max-lg:hidden"
            />
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
                  ? `The agent sees ${title} with each message.`
                  : mobileSheet === "nav"
                    ? "Navigation, chat history and your account."
                    : `Properties of ${title}.`}
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
                  {chatColumn}
                </>
              ) : mobileSheet === "nav" ? (
                <CanvasNav
                  nav={nav}
                  variant="sheet"
                  historyScopeId={CANVAS_HISTORY_SCOPE}
                  activeConversationId={conversationId}
                  onOpenConversation={openFromHistory}
                  onNewChat={() => {
                    chat.startNew();
                    setMobileSheet("chat");
                  }}
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
