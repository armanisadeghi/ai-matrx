"use client";

/**
 * ChatCanvasWorkspace — "chat beside a canvas" (Amendment 1, A5).
 *
 *   shell chat · canvas · properties panel   (navigation = the app shell's sidebar)
 *
 * THE CHAT IS THE SHELL'S (owner, 2026-10-05: one copy of everything; the chat
 * on ALL pages): `ShellChatDock` docks beside the sidebar on this page as on
 * every other, its sidebar Chats side opens conversations in it, and ⌘\ shows
 * and hides it. This page hands it the canvas as ONE named context entry
 * (`useShellChatContext` — never user input); its own conversation and its
 * remembered layout live in the shell chat's home for this page
 * (`shellChatHome`: each board, Education).
 *
 * What the page itself draws: the canvas, its header (title ▾, byline,
 * comments, Share, properties, full screen, the shared header control set — a
 * hosted module's own <PageHeader> portals here), and the properties panel (a
 * `DockedSidePanel`: slides, drags to any width, remembered per person).
 *
 * The app shell stays mounted around it, flipped into canvas chrome
 * (<ShellChromeMode/>, styles/shell.css §13c): the shell header steps aside
 * for this page's header; the sidebar, account rail and shell chat stay.
 */

import { useEffect, useState, type ReactNode } from "react";
import {
  ChevronDown,
  Maximize,
  Menu,
  MessageSquare,
  Minimize,
  PanelRight,
  PanelRightOpen,
  X,
} from "lucide-react";
import type { EntityTypeToken } from "@ai-matrx/associations";
import { cn } from "@ai-matrx/design-system";
import { useAppSelector } from "../../store/hooks";
import { useMediaQueryState } from "@ai-matrx/kit/media-query";
import { DockedSidePanel } from "@ai-matrx/chat/host/ui-slots";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@ai-matrx/design-system";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@ai-matrx/design-system";
import { EntityCommentPopover } from "@ai-matrx/chat/host/ui-slots";
import { ShareButton } from "../../host/ui-slots";
/** The shareable-resource entity token (the host owns the registry of tokens). */
type ResourceType = string;
import {
  HeaderControlSet,
  openShellMobileMenu,
  pushFullScreenLayer,
  ShellChromeMode,
  useShellCanvasFullScreen,
} from "../../host/chrome";
import type { AttachedContextRailItem } from "../../agents/components/inputs/smart-input/ConversationContextRail";
import type { CanvasContextEntry } from "./CanvasChatColumn";
import {
  CanvasPropertiesPanel,
  type CanvasPropertiesTab,
} from "./CanvasPropertiesPanel";
import {
  CANVAS_PANEL_IDS,
  CANVAS_PROPERTIES_SIZES,
  writeCanvasPropertiesCookie,
  type CanvasWorkspaceLayout,
} from "./workspace-cookies";
import { useShellChatContext } from "./shell-chat-page-context";
import { SHELL_CHAT_REVEAL_EVENT, SHELL_CHAT_TOGGLE_EVENT } from "./shell-chat-route";
import { selectIsAuthenticated } from "../../host/identity";
import { Button } from "@ai-matrx/design-system/controls";

/** Below this the workspace is one pane: the canvas, with properties in a sheet (navigation is the shell drawer). */
const COMPACT_QUERY = "(max-width: 1023px)";

export interface ChatCanvasWorkspaceRecord {
  /** The record's share type. Absent = no Share control (comments may still show). */
  resourceType?: ResourceType;
  resourceId: string;
  resourceName: string;
  /** The record's comment token. Absent = no comments control. */
  commentToken?: EntityTypeToken;
}

export interface ChatCanvasWorkspaceProps {
  /** Stable id: the properties panel's remembered open / closed. */
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
  /**
   * The canvas as ONE context entry for the shell chat — never user input.
   * Called at send time; keep it cheap. A canvas that publishes its own
   * surface (the Board) passes none.
   */
  getCanvasContext?: () => CanvasContextEntry;
  /** Shown in the shell chat composer's context rail. */
  contextChip?: AttachedContextRailItem;
  /** Server-read (`readCanvasWorkspaceLayout`), so the first paint is the layout the person left. */
  initialLayout?: CanvasWorkspaceLayout;
  /** Absent = no close button. */
  onClose?: () => void;
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
  onClose,
}: ChatCanvasWorkspaceProps) {
  // `null` until the viewport is known (server, hydration): layout treats it as
  // wide (CSS hides the wide panels on a phone).
  const viewportCompact = useMediaQueryState(COMPACT_QUERY);
  const compact = viewportCompact === true;
  const isAuthenticated = useAppSelector(selectIsAuthenticated);

  // THE CHAT is the shell's (ShellChatDock): this page hands it the canvas as
  // ONE context entry, and its own conversation lives there (shellChatHome).
  useShellChatContext(
    getCanvasContext || contextChip ? { getCanvasContext, contextChip } : null,
  );
  const toggleChat = () => window.dispatchEvent(new Event(SHELL_CHAT_TOGGLE_EVENT));

  const [propertiesSheetOpen, setPropertiesSheetOpen] = useState(false);
  const [fullScreen, setFullScreen] = useState(false);
  useShellCanvasFullScreen(fullScreen);
  const [propertiesOpen, setPropertiesOpenRaw] = useState(initialLayout?.propertiesOpen ?? true);

  const setPropertiesOpen = (open: boolean) => {
    setPropertiesOpenRaw(open);
    writeCanvasPropertiesCookie(id, open);
  };

  // Esc leaves full screen through the shared full-screen layer stack: capture
  // phase (a canvas that uses Escape itself must not swallow the way out), a
  // menu / popover keeps the key, and one Escape leaves only the top layer —
  // a board tile's full screen opened over this one closes first.
  useEffect(() => {
    if (!fullScreen) return undefined;
    return pushFullScreenLayer(() => setFullScreen(false));
  }, [fullScreen]);

  // Opening the chat (its button, ⌘\, a history row, a comment riding along)
  // steps out of full screen: the chat is never opened behind the canvas.
  useEffect(() => {
    if (!fullScreen) return undefined;
    const leave = () => setFullScreen(false);
    window.addEventListener(SHELL_CHAT_REVEAL_EVENT, leave);
    return () => window.removeEventListener(SHELL_CHAT_REVEAL_EVENT, leave);
  }, [fullScreen]);

  const hasProperties = properties !== undefined && properties.tabs.length > 0;
  const showProperties = !fullScreen && hasProperties && propertiesOpen;

  const canvasTitle = !title ? null : titleMenu ? (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="quiet" iconEnd={<ChevronDown />} className="min-w-0">{title}</Button>
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

      {/* ── Canvas area (the shell chat docks to its left) ── */}
      <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
        <header className="canvas-workspace-header flex h-11 shrink-0 items-center gap-1.5 px-3">
          {/* Compact (< 1024px) and wide controls are BOTH rendered and chosen by
              CSS, so a phone's first paint is right before JavaScript measures.
              On a wide screen the way to the chat is the shell's own chat
              button, fixed over this header's left edge (shell.css). */}
          <Button variant="quiet" icon={<Menu />} aria-label="Open navigation" onClick={openShellMobileMenu} className="lg:hidden" />
          <Button variant="quiet" icon={<MessageSquare />} aria-label="Chat" onClick={toggleChat} className="lg:hidden" />
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
            {hasProperties ? (
              <Button variant="quiet" icon={<PanelRightOpen />} aria-label="Properties" onClick={() => setPropertiesSheetOpen(true)} />
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
                className={cn(ICON_BUTTON, showProperties && "bg-primary/10 text-primary-ink")}
              >
                <PanelRight className="h-4 w-4" />
              </button>
            ) : null}
          </div>

          {record?.commentToken ? (
            <EntityCommentPopover
              token={record.commentToken}
              id={record.resourceId}
              title={record.resourceName}
              className="h-7"
            />
          ) : null}
          {record?.resourceType ? (
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
            <Button variant="quiet" icon={<X />} aria-label="Close" onClick={onClose} />
          ) : null}
          {/* THE HEADER CONTROL SET sits at the right edge, the page's own
              controls to its left — the same order as the shell header. On a
              phone it (and the hosted page's own actions and section nav)
              folds into ONE ⋮ so the page title gets the row (page-pass,
              2026-09-27). */}
          <HeaderControlSet isAuthenticated={isAuthenticated} />
        </header>

        <div className="flex min-h-0 flex-1">
          <div className="relative isolate min-h-0 min-w-0 flex-1 overflow-hidden">{canvas}</div>

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
            >
              <CanvasPropertiesPanel tabs={properties.tabs} />
            </DockedSidePanel>
          ) : null}
        </div>
      </div>

      {/* ── Compact (< 1024px): one pane; properties in a bottom sheet (the chat is the shell's sheet) ── */}
      {compact && hasProperties && properties ? (
        <Drawer open={propertiesSheetOpen} onOpenChange={setPropertiesSheetOpen}>
          <DrawerContent className="flex h-[85dvh] flex-col pb-safe">
            <DrawerHeader className="py-2">
              <DrawerTitle className="text-sm">Properties</DrawerTitle>
              <DrawerDescription className="sr-only">
                {`Properties of ${title ?? "this page"}.`}
              </DrawerDescription>
            </DrawerHeader>
            <div className="flex min-h-0 flex-1 flex-col">
              <CanvasPropertiesPanel tabs={properties.tabs} variant="sheet" />
            </div>
          </DrawerContent>
        </Drawer>
      ) : null}
    </div>
  );
}
