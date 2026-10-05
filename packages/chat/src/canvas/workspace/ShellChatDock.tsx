"use client";

/**
 * ShellChatDock — THE CHAT, ON EVERY PAGE (owner, 2026-10-01: "the new menu
 * you are building MUST offer the chat on ALL pages"; 2026-10-05: one copy of
 * everything).
 *
 *   icon strip · domain menu · CHAT · page
 *
 * Mounted ONCE by the app shell so it survives navigation. It is the only chat
 * panel in the app: the Board and Education no longer draw their own — they
 * hand it their context (`useShellChatContext`) and their own conversation
 * lives here (`shellChatHome`: each board keeps its conversation, signed-in
 * Education has one, every other page shares one that follows the person).
 * It stands aside only on /chat (the chat itself) and /code (its own coding
 * agent).
 *
 * OPEN OR CLOSED, DOCKED OR FLOATING, IS REMEMBERED PER HOME (owner,
 * 2026-10-02: "the moment the user does something … give them the same setup
 * … I don't care what their screen size is"). A person's own choice is a
 * cookie per home, read on the server, so the first paint is what they left.
 * With no choice yet: the home's default (a board opens, Education stays
 * closed), else open on a wide screen (≥ 1440px), closed below.
 *
 * Docked, it is fixed beside the sidebar and its occupied width is published
 * as --shell-chat-w on .shell-root, which the header and page step right by.
 * Popped out, it floats over the page (MatrxFloatingFrame). On a phone it is a
 * sheet. Behind a full-screen canvas it steps aside; opening it steps the
 * canvas out of full screen (SHELL_CHAT_REVEAL_EVENT).
 */

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { Maximize2, PictureInPicture2 } from "lucide-react";
import { usePathname } from "../../host/navigation";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@ai-matrx/design-system";
import { Button } from "@ai-matrx/design-system/controls";
import { useMediaQueryState } from "@ai-matrx/kit/media-query";
import { SHELL_DOMAIN_PANEL_COOKIE } from "@ai-matrx/chat/utils/shell/sidebar-cookie";
import { DockedSidePanel, MatrxFloatingFrame } from "@ai-matrx/chat/host/ui-slots";
import { ComposerModeSwitch } from "../../agents/components/inputs/smart-input/composer/ComposerModeSwitch";
import type { ComposerMode } from "../../agents/components/inputs/smart-input/composer/composer-types";
import { COMPOSER_KNOBS } from "../../agents/components/inputs/smart-input/composer/composer-mode-cookie";
import { registerInPlaceChatHost } from "../../agents/components/chat/in-place-chat-host";
import { useSessionKnob } from "../../host/prefs-react";
import { shellChatTakesToggleKey, useShellChatPageEntry, useShellChatRemarkSink } from "./shell-chat-dock-owners";
import { CanvasChatColumn } from "./CanvasChatColumn";
import { ChatPanelTitleMenu, useChatPanelTitle } from "./ChatPanelTitleMenu";
import { useCanvasWorkspaceConversation } from "./useCanvasWorkspaceConversation";
import { useShellChatPageContext } from "./shell-chat-page-context";
import {
  CANVAS_CHAT_SIZES,
  CANVAS_PANEL_IDS,
  canvasChatCookieName,
  parseCanvasChatCookie,
  writeCanvasChatCookie,
  type CanvasChatPlacement,
  type CanvasChatState,
} from "./workspace-cookies";
import {
  SHELL_CHAT_FOLD_QUERY,
  SHELL_CHAT_REVEAL_EVENT,
  SHELL_CHAT_TOGGLE_EVENT,
  SHELL_CHAT_WIDE_QUERY,
  shellChatDomainPanelAction,
  shellChatHome,
  shellChatHostedElsewhere,
} from "./shell-chat-route";

const COMPACT_QUERY = "(max-width: 1023px)";
const FLOATING_FALLBACK = { width: 340, height: 400 };
/** Stamped on .shell-root by a canvas page in full screen (useShellCanvasFullScreen). */
const FULL_SCREEN_ATTRIBUTE = "data-canvas-fullscreen";

/** The person's remembered choice for one home, read from the cookie in the browser. */
function readHomeChoice(layoutId: string): CanvasChatState | null {
  const name = `${canvasChatCookieName(layoutId)}=`;
  const hit = document.cookie.split("; ").find((part) => part.startsWith(name));
  return hit ? parseCanvasChatCookie(hit.slice(name.length), true) : null;
}

function readFloatingSize(value: unknown): { width: number; height: number } {
  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    const width = record.width ?? record.w;
    const height = record.height ?? record.h;
    if (typeof width === "number" && typeof height === "number" && width >= 240 && height >= 200) {
      return { width, height };
    }
  }
  return FLOATING_FALLBACK;
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

/** Whether a canvas page has the window in full screen right now. */
function useCanvasFullScreenActive(): boolean {
  const [active, setActive] = useState(false);
  useEffect(() => {
    const root = document.querySelector<HTMLElement>(".shell-root");
    if (!root) return undefined;
    const read = () => setActive(root.hasAttribute(FULL_SCREEN_ATTRIBUTE));
    read();
    const observer = new MutationObserver(read);
    observer.observe(root, { attributes: true, attributeFilter: [FULL_SCREEN_ATTRIBUTE] });
    return () => observer.disconnect();
  }, []);
  return active;
}

export interface ShellChatDockProps {
  /**
   * The SSR pathname's remembered choice (`parseCanvasChatCookie`), or null
   * when the person has not chosen on this home yet.
   */
  initialChat: CanvasChatState | null;
  /** Server-read remembered dock width. */
  initialWidth?: number;
  initialMode?: ComposerMode | null;
  signedIn: boolean;
  /** The SSR pathname, so the first paint knows this page's home. */
  initialPathname: string;
}

export function ShellChatDock({ initialChat, initialWidth, initialMode = null, signedIn, initialPathname }: ShellChatDockProps) {
  const pathname = usePathname() ?? initialPathname;
  const home = shellChatHome(pathname, signedIn);
  const hostedElsewhere = shellChatHostedElsewhere(pathname);
  const viewportCompact = useMediaQueryState(COMPACT_QUERY);
  const compact = viewportCompact === true;
  const fullScreen = useCanvasFullScreenActive();

  // `state: null` = no choice yet on this home → its default.
  const [choice, setChoice] = useState<{ layoutId: string; state: CanvasChatState | null }>({
    layoutId: home.layoutId,
    state: initialChat,
  });
  const [wideDefault, setWideDefault] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  // A new home: its own remembered choice (client navigation never re-reads the server).
  if (choice.layoutId !== home.layoutId) {
    setChoice({
      layoutId: home.layoutId,
      state: typeof document === "undefined" ? null : readHomeChoice(home.layoutId),
    });
  }
  useEffect(() => {
    setWideDefault(window.matchMedia(SHELL_CHAT_WIDE_QUERY).matches);
  }, []);

  const placement: CanvasChatPlacement = choice.state?.placement ?? "side";
  const open = !hostedElsewhere && (choice.state?.open ?? home.defaultOpen ?? wideDefault);
  const shown = open && !fullScreen;
  const docked = shown && placement === "side";
  const floating = !compact && shown && placement === "floating";
  const chatOnScreen = !hostedElsewhere && (compact ? sheetOpen : viewportCompact === false && shown);

  const chat = useCanvasWorkspaceConversation(home.surfaceKey, {
    enabled: signedIn && chatOnScreen,
    addressParam: home.addressParam,
  });
  const conversationId = chat.conversationId;
  const chatTitle = useChatPanelTitle(conversationId);
  const pageContext = useShellChatPageContext();
  const floatingSize = readFloatingSize(useSessionKnob(COMPOSER_KNOBS.floatingPanelSize));

  const setChat = (next: CanvasChatState) => {
    setChoice({ layoutId: home.layoutId, state: next });
    writeCanvasChatCookie(home.layoutId, next);
  };
  /** Bring the chat into view wherever it is — and out from behind a full-screen canvas. */
  const show = () => {
    window.dispatchEvent(new Event(SHELL_CHAT_REVEAL_EVENT));
    if (compact) setSheetOpen(true);
    else if (!open) setChat({ placement, open: true });
  };
  const hide = () => setChat({ placement, open: false });
  const toggle = () => {
    if (compact) setSheetOpen((s) => !s);
    else if (shown) hide();
    else show();
  };
  /** Dock or float — always open. */
  const setPlacement = (next: CanvasChatPlacement) => setChat({ placement: next, open: true });

  // The root carries the state: CSS folds a domain menu to its strip beside a
  // docked chat on a narrow desktop, and the header toggle shows pressed.
  const wideKnown = viewportCompact === false;
  useEffect(() => {
    const root = document.querySelector<HTMLElement>(".shell-root");
    if (!root || !signedIn) return undefined;
    root.toggleAttribute("data-shell-chat-open", docked && wideKnown);
    root.toggleAttribute("data-shell-chat-available", !hostedElsewhere);
    return () => {
      root.removeAttribute("data-shell-chat-open");
      root.removeAttribute("data-shell-chat-available");
    };
  }, [docked, wideKnown, hostedElsewhere, signedIn]);

  // Beside a chat the PERSON docked open, on a narrower desktop, a domain panel
  // steps back to its strip so the page keeps its room (a default-open chat
  // never folds it) (the person can still open it: the toggle works and its
  // choice is remembered); closing the chat brings it back.
  useEffect(() => {
    if (!signedIn || !wideKnown || hostedElsewhere) return;
    const root = document.querySelector<HTMLElement>(".shell-root");
    const sidebarToggle = document.getElementById("shell-sidebar-toggle") as HTMLInputElement | null;
    if (!root?.hasAttribute("data-domain-panel") || !sidebarToggle) return;
    const action = shellChatDomainPanelAction({
      open: docked,
      choice: choice.state?.open ?? null,
      narrow: window.matchMedia(SHELL_CHAT_FOLD_QUERY).matches,
    });
    if (action === "fold") {
      if (sidebarToggle.checked) sidebarToggle.checked = false;
    } else if (action === "restore") {
      const saved = document.cookie.split("; ").find((p) => p.startsWith(`${SHELL_DOMAIN_PANEL_COOKIE}=`));
      const want = saved?.split("=")[1] !== "0";
      if (sidebarToggle.checked !== want) sidebarToggle.checked = want;
    }
  }, [docked, choice.state, wideKnown, hostedElsewhere, signedIn, home.layoutId]);

  const onToggle = useEffectEvent(() => {
    if (!hostedElsewhere) toggle();
  });
  useEffect(() => {
    const onEvent = () => onToggle();
    const onKey = (e: KeyboardEvent) => {
      // A key the page already used (/spaces: its sidebar) is not the chat's.
      if (!signedIn || !shellChatTakesToggleKey(e)) return;
      // Typing elsewhere keeps the key; inside the chat's own composer it closes the chat.
      const inChat = e.target instanceof Element && e.target.closest(".shell-chat-dock, .shell-chat-floating");
      if (isTypingTarget(e.target) && !inChat) return;
      if (shellChatHostedElsewhere(window.location.pathname)) return;
      e.preventDefault();
      onToggle();
    };
    window.addEventListener(SHELL_CHAT_TOGGLE_EVENT, onEvent);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener(SHELL_CHAT_TOGGLE_EVENT, onEvent);
      window.removeEventListener("keydown", onKey);
    };
  }, [signedIn]);

  // THE SIDEBAR'S CHATS HOST HERE: its history rows and "New chat" open in
  // this chat (in-place-chat-host), on every page but /chat and /code. The
  // latest handlers ride a ref so the registration changes only when the shown
  // conversation does.
  const hostHandlers = useRef({
    openConversation: (c: { conversationId: string; agentId?: string | null }) => {
      chat.openExisting(c.conversationId, c.agentId);
      show();
    },
    startNewChat: () => {
      chat.startNew();
      show();
    },
    startWithAgent: (agentId: string) => {
      chat.startWith(agentId);
      show();
    },
  });
  useEffect(() => {
    hostHandlers.current = {
      openConversation: (c) => {
        chat.openExisting(c.conversationId, c.agentId);
        show();
      },
      startNewChat: () => {
        chat.startNew();
        show();
      },
      startWithAgent: (agentId) => {
        chat.startWith(agentId);
        show();
      },
    };
  });
  useEffect(() => {
    if (hostedElsewhere || !signedIn) return undefined;
    return registerInPlaceChatHost({
      activeConversationId: conversationId,
      openConversation: (c) => hostHandlers.current.openConversation(c),
      startNewChat: () => hostHandlers.current.startNewChat(),
      startWithAgent: (agentId) => hostHandlers.current.startWithAgent(agentId),
    });
  }, [conversationId, hostedElsewhere, signedIn]);

  // The page's context entry and the remark queue are the DOCK's: the column
  // unmounts with its sheet or floating window (shell-chat-dock-owners).
  useShellChatPageEntry(conversationId, pageContext?.getCanvasContext);
  useShellChatRemarkSink({
    enabled: !hostedElsewhere && signedIn,
    homeKey: home.surfaceKey,
    conversationId,
    reveal: show,
  });

  if (!signedIn) return null;

  const column = (
    <CanvasChatColumn
      conversation={chat.conversation}
      surfaceKey={home.surfaceKey}
      getCanvasContext={pageContext?.getCanvasContext}
      contextChip={pageContext?.contextChip}
      onSelectAgent={chat.startWith}
      initialMode={initialMode}
    />
  );

  if (compact) {
    return (
      <Drawer open={sheetOpen} onOpenChange={setSheetOpen}>
        <DrawerContent className="flex h-[92dvh] flex-col pb-safe">
          <DrawerHeader className="flex-row items-center gap-2 py-2">
            <DrawerTitle className="min-w-0 flex-1 truncate text-left text-sm">{chatTitle}</DrawerTitle>
            <ComposerModeSwitch size="panel" initialMode={initialMode} />
            <DrawerDescription className="sr-only">The chat for the page you are on.</DrawerDescription>
          </DrawerHeader>
          <div className="flex min-h-0 flex-1 flex-col">{sheetOpen ? column : null}</div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <>
      {viewportCompact === null && !open ? null : (
        <DockedSidePanel
          panelId={CANVAS_PANEL_IDS.chat}
          edge="left"
          open={docked}
          sizes={CANVAS_CHAT_SIZES}
          initialWidth={initialWidth}
          publishWidthAs="--shell-chat-w"
          onCollapse={hide}
          aria-label="Chat"
          outerClassName="shell-chat-dock max-lg:hidden"
          className="bg-card"
        >
          {/* The header's chat button sits fixed over this row's left edge
              (ShellChatToggle) — it opens AND closes the chat from one place. */}
          <div className="shell-chat-dock-header flex h-11 shrink-0 items-center gap-1 pr-2">
            <div className="min-w-0 flex-1">
              <ChatPanelTitleMenu conversationId={conversationId} onNewChat={chat.startNew} />
            </div>
            <ComposerModeSwitch size="panel" initialMode={initialMode} />
            <Button
              variant="quiet"
              icon={<PictureInPicture2 />}
              aria-label="Pop out chat"
              title="Pop out chat"
              onClick={() => setPlacement("floating")}
              className="shrink-0"
            />
          </div>
          <div className="flex min-h-0 flex-1 flex-col">
            {placement === "side" && (chatOnScreen || conversationId) ? column : null}
          </div>
        </DockedSidePanel>
      )}
      {floating ? (
        <MatrxFloatingFrame
          // Re-seat at the knob's size once it answers.
          key={`${home.layoutId}:${floatingSize.width}x${floatingSize.height}`}
          id={`canvas-chat:${home.layoutId}`}
          title={chatTitle}
          width={floatingSize.width}
          height={floatingSize.height}
          minWidth={300}
          minHeight={260}
          initialFocus={false}
          onClose={hide}
          contentClassName="flex flex-col overflow-hidden p-0"
          className="shell-chat-floating max-lg:hidden"
          headerActions={
            <Button
              variant="quiet"
              icon={<Maximize2 />}
              aria-label="Dock the chat"
              title="Dock the chat"
              onClick={() => setPlacement("side")}
              className="shrink-0"
            />
          }
        >
          {column}
        </MatrxFloatingFrame>
      ) : null}
    </>
  );
}
