"use client";

/**
 * ShellChatDock — THE CHAT ON EVERY PAGE (owner, 2026-10-01: "the new menu
 * you are building MUST offer the chat on ALL pages").
 *
 *   icon strip · domain menu · CHAT · page
 *
 * The same pieces the Board's ChatCanvasWorkspace docks (CanvasChatColumn,
 * ChatPanelTitleMenu, ComposerModeSwitch, DockedSidePanel), mounted ONCE by
 * the app shell so it survives navigation: one conversation follows the person
 * from page to page. Pages that host their own canvas workspace (the Board,
 * Education) and the full /chat page render it closed-and-absent instead.
 *
 * OPEN OR CLOSED IS REMEMBERED PER PAGE FAMILY (owner, 2026-10-02: "the moment
 * the user does something … give them the same setup … I don't care what their
 * screen size is"). A person's own choice is a cookie per family, read on the
 * server, so the first paint is what they left. With no choice yet: open on a
 * wide screen (≥ 1440px), closed below — the default only, never re-applied.
 *
 * The dock is fixed beside the sidebar; its occupied width is published as
 * --shell-chat-w on .shell-root, which the header and page step right by.
 */

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { PanelLeftClose } from "lucide-react";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@ai-matrx/design-system";
import { useMediaQueryState } from "@ai-matrx/kit/media-query";
import { SHELL_DOMAIN_PANEL_COOKIE } from "@host/features/shell/constants/sidebar-cookie";
import { DockedSidePanel } from "@host/components/official/side-panel/DockedSidePanel";
import { ComposerModeSwitch } from "../../agents/components/inputs/smart-input/composer/ComposerModeSwitch";
import type { ComposerMode } from "../../agents/components/inputs/smart-input/composer/composer-types";
import { registerInPlaceChatHost } from "../../agents/components/chat/in-place-chat-host";
import { CanvasChatColumn } from "./CanvasChatColumn";
import { ChatPanelTitleMenu, useChatPanelTitle } from "./ChatPanelTitleMenu";
import { useCanvasWorkspaceConversation } from "./useCanvasWorkspaceConversation";
import { CANVAS_CHAT_SIZES, CANVAS_PANEL_IDS, canvasChatCookieName, writeCanvasChatCookie } from "./workspace-cookies";
import {
  SHELL_CHAT_FOLD_QUERY,
  SHELL_CHAT_TOGGLE_EVENT,
  SHELL_CHAT_WIDE_QUERY,
  shellChatFamily,
  shellChatHostedElsewhere,
  shellChatWorkspaceId,
} from "./shell-chat-route";

const COMPACT_QUERY = "(max-width: 1023px)";
const SURFACE_KEY = "canvas-workspace:shell";

const ICON_BUTTON =
  "flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground";

/** The person's remembered choice for one family, read from the cookie in the browser. */
function readFamilyChoice(family: string): boolean | null {
  const name = `${canvasChatCookieName(shellChatWorkspaceId(family))}=`;
  const hit = document.cookie.split("; ").find((part) => part.startsWith(name));
  if (!hit) return null;
  return !hit.slice(name.length).endsWith(":closed");
}

function isToggleShortcut(e: KeyboardEvent): boolean {
  return (e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key === "\\";
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

export interface ShellChatDockProps {
  /** The SSR pathname's remembered choice: true / false, or null when the person has not chosen. */
  initialOpen: boolean | null;
  /** Server-read remembered dock width. */
  initialWidth?: number;
  initialMode?: ComposerMode | null;
  signedIn: boolean;
  /** The SSR pathname, so the first paint knows whether this page hosts its own chat. */
  initialPathname: string;
}

export function ShellChatDock({ initialOpen, initialWidth, initialMode = null, signedIn, initialPathname }: ShellChatDockProps) {
  const pathname = usePathname() ?? initialPathname;
  const family = shellChatFamily(pathname);
  const hostedElsewhere = shellChatHostedElsewhere(pathname, signedIn);
  const viewportCompact = useMediaQueryState(COMPACT_QUERY);
  const compact = viewportCompact === true;

  // `null` = no choice yet for this family → the wide-screen default after mount.
  const [choice, setChoice] = useState<{ family: string; open: boolean | null }>({ family, open: initialOpen });
  const [defaultOpen, setDefaultOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  // A new family: its own remembered choice (client navigation never re-reads the server).
  if (choice.family !== family) {
    setChoice({ family, open: typeof document === "undefined" ? null : readFamilyChoice(family) });
  }
  useEffect(() => {
    setDefaultOpen(window.matchMedia(SHELL_CHAT_WIDE_QUERY).matches);
  }, []);

  const open = !hostedElsewhere && (choice.open ?? defaultOpen);
  const chatOnScreen = !hostedElsewhere && (compact ? sheetOpen : viewportCompact === false && open);

  // `pageChat`, not `chat`: pages keep their own `?chat=` (the Board, /code).
  const chat = useCanvasWorkspaceConversation(SURFACE_KEY, {
    enabled: signedIn && chatOnScreen,
    addressParam: "pageChat",
  });
  const conversationId = chat.conversationId;
  const chatTitle = useChatPanelTitle(conversationId);

  const setOpen = (next: boolean) => {
    setChoice({ family, open: next });
    writeCanvasChatCookie(shellChatWorkspaceId(family), { placement: "side", open: next });
  };
  const show = () => (compact ? setSheetOpen(true) : setOpen(true));
  const toggle = () => (compact ? setSheetOpen((s) => !s) : setOpen(!open));

  // The root carries the state: CSS folds a domain menu to its strip beside an
  // open chat on a narrow desktop, and the header toggle shows pressed.
  const wideKnown = viewportCompact === false;
  useEffect(() => {
    const root = document.querySelector<HTMLElement>(".shell-root");
    if (!root || !signedIn) return undefined;
    root.toggleAttribute("data-shell-chat-open", open && wideKnown);
    root.toggleAttribute("data-shell-chat-available", !hostedElsewhere);
    return () => {
      root.removeAttribute("data-shell-chat-open");
      root.removeAttribute("data-shell-chat-available");
    };
  }, [open, wideKnown, hostedElsewhere, signedIn]);

  // Beside an open chat on a narrower desktop a domain panel steps back to its
  // strip so the page keeps its room (the person can still open it: the toggle
  // works and its choice is remembered); closing the chat brings it back.
  useEffect(() => {
    if (!signedIn || !wideKnown || hostedElsewhere) return;
    const root = document.querySelector<HTMLElement>(".shell-root");
    const toggle = document.getElementById("shell-sidebar-toggle") as HTMLInputElement | null;
    if (!root?.hasAttribute("data-domain-panel") || !toggle) return;
    if (open && window.matchMedia(SHELL_CHAT_FOLD_QUERY).matches) {
      if (toggle.checked) toggle.checked = false;
    } else if (!open) {
      const saved = document.cookie.split("; ").find((p) => p.startsWith(`${SHELL_DOMAIN_PANEL_COOKIE}=`));
      const want = saved?.split("=")[1] !== "0";
      if (toggle.checked !== want) toggle.checked = want;
    }
  }, [open, wideKnown, hostedElsewhere, signedIn, family]);

  const onToggle = useEffectEvent(() => {
    if (!hostedElsewhere) toggle();
  });
  useEffect(() => {
    const onEvent = () => onToggle();
    const onKey = (e: KeyboardEvent) => {
      if (!signedIn || !isToggleShortcut(e)) return;
      // Typing elsewhere keeps the key; inside the chat's own composer it closes the chat.
      const inDock = e.target instanceof Element && e.target.closest(".shell-chat-dock");
      if (isTypingTarget(e.target) && !inDock) return;
      // A page with its own canvas workspace handles ⌘\ itself.
      if (shellChatHostedElsewhere(window.location.pathname, signedIn)) return;
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

  // The sidebar's Chats history and "New chat" open HERE while no page hosts its own chat.
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

  if (!signedIn) return null;

  const column = (
    <CanvasChatColumn
      conversation={chat.conversation}
      surfaceKey={SURFACE_KEY}
      onSelectAgent={chat.startWith}
      initialMode={initialMode}
    />
  );

  return (
    <>
      {viewportCompact === null && !open ? null : !compact ? (
        <DockedSidePanel
          panelId={CANVAS_PANEL_IDS.chat}
          edge="left"
          open={open}
          sizes={CANVAS_CHAT_SIZES}
          initialWidth={initialWidth}
          publishWidthAs="--shell-chat-w"
          onCollapse={() => setOpen(false)}
          aria-label="Chat"
          outerClassName="shell-chat-dock max-lg:hidden"
          className="bg-card"
        >
          <div className="flex h-11 shrink-0 items-center gap-1 px-2">
            <div className="min-w-0 flex-1">
              <ChatPanelTitleMenu conversationId={conversationId} onNewChat={chat.startNew} />
            </div>
            <ComposerModeSwitch size="panel" initialMode={initialMode} />
            <button
              type="button"
              aria-label="Hide chat"
              title="Hide chat (Ctrl/Cmd + \)"
              onClick={() => setOpen(false)}
              className={`${ICON_BUTTON} ml-1`}
            >
              <PanelLeftClose className="h-4 w-4" />
            </button>
          </div>
          <div className="flex min-h-0 flex-1 flex-col">
            {chatOnScreen || conversationId ? column : null}
          </div>
        </DockedSidePanel>
      ) : (
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
      )}
    </>
  );
}
