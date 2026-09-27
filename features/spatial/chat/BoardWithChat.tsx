"use client";

/**
 * Chat on the left, the board on the right — one resizable split.
 *
 * Desktop: a `react-resizable-panels` v4 horizontal group. The chat panel is
 * collapsible to a slim rail (button, or Ctrl/Cmd + \); the library remembers
 * its pre-collapse width, and the layout persists in the `panels:<id>` cookie.
 * Mobile: the board takes the screen and the chat is a bottom Drawer.
 *
 * The chat is `BoardChatPanel` (the platform's one chat column); the board is
 * whatever the host passes as `children`.
 */

import { useEffect, useEffectEvent, useState, type ReactNode } from "react";
import { Panel, usePanelRef, type Layout } from "react-resizable-panels";
import { MessageSquare, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { ClientGroup } from "@/features/resizable-panels/ClientGroup";
import { Handle } from "@/features/resizable-panels/Handle";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { BoardChatPanel, useBoardChatConversation } from "./BoardChatPanel";
import { type BoardContext, boardChatCookieName } from "./board-context";

const RAIL_PX = 44;

export interface BoardWithChatProps {
  /** Stable id: names the panel group, its cookie and the chat's surface key. */
  id: string;
  getBoardContext: () => BoardContext;
  /** Server-read `panels:<id>` cookie, for a first paint at the saved widths. */
  defaultLayout?: Layout;
  children: ReactNode;
  className?: string;
}

function isToggleShortcut(e: KeyboardEvent): boolean {
  return (e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key === "\\";
}

export function BoardWithChat({ id, getBoardContext, defaultLayout, children, className }: BoardWithChatProps) {
  const isMobile = useIsMobile();
  const surfaceKey = `spatial-board-chat:${id}`;
  const conversation = useBoardChatConversation(surfaceKey);
  const chatRef = usePanelRef();
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const toggle = () => {
    if (isMobile) {
      setDrawerOpen((open) => !open);
      return;
    }
    const panel = chatRef.current;
    if (!panel) return;
    if (panel.isCollapsed()) panel.expand();
    else panel.collapse();
  };

  const onShortcut = useEffectEvent(() => toggle());
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!isToggleShortcut(e)) return;
      e.preventDefault();
      onShortcut();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const chat = (
    <BoardChatPanel conversation={conversation} surfaceKey={surfaceKey} getBoardContext={getBoardContext} />
  );

  if (isMobile) {
    return (
      <div className={cn("relative h-full min-h-0", className)}>
        {children}
        <Button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className="absolute bottom-4 right-4 z-50 h-11 rounded-full px-4 shadow-lg pb-safe"
          aria-label="Chat about this board"
        >
          <MessageSquare className="mr-2 h-4 w-4" />
          Chat
        </Button>
        <Drawer open={drawerOpen} onOpenChange={setDrawerOpen}>
          <DrawerContent className="flex h-[85dvh] flex-col">
            <DrawerHeader className="py-2">
              <DrawerTitle className="text-sm">Chat about this board</DrawerTitle>
              <DrawerDescription className="sr-only">
                The agent sees every tile on the board with each message.
              </DrawerDescription>
            </DrawerHeader>
            <div className="flex min-h-0 flex-1 flex-col">{chat}</div>
          </DrawerContent>
        </Drawer>
      </div>
    );
  }

  return (
    <ClientGroup
      id={id}
      cookieName={boardChatCookieName(id)}
      defaultLayout={defaultLayout}
      orientation="horizontal"
      className={cn("h-full w-full", className)}
    >
      <Panel
        id="chat"
        panelRef={chatRef}
        collapsible
        collapsedSize={`${RAIL_PX}px`}
        defaultSize="30%"
        minSize="300px"
        maxSize="55%"
        onResize={(next) => setCollapsed(next.inPixels <= RAIL_PX + 1)}
      >
        <div className="flex h-full min-h-0 flex-col bg-background">
          {collapsed ? (
            <div className="flex h-full flex-col items-center gap-1 py-2">
              <button
                type="button"
                onClick={toggle}
                title="Open chat (Ctrl/Cmd + \)"
                aria-label="Open chat"
                className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <PanelLeftOpen className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={toggle}
                title="Chat about this board"
                aria-label="Chat about this board"
                className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <MessageSquare className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <div className="flex h-9 shrink-0 items-center gap-2 px-3">
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
              <p className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">Chat</p>
              <button
                type="button"
                onClick={toggle}
                title="Collapse chat (Ctrl/Cmd + \)"
                aria-label="Collapse chat"
                className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <PanelLeftClose className="h-4 w-4" />
              </button>
            </div>
          )}
          {/* Kept mounted while collapsed so the composer draft and scroll survive. */}
          <div className={cn("min-h-0 flex-1 flex-col", collapsed ? "hidden" : "flex")}>{chat}</div>
        </div>
      </Panel>
      <Handle />
      <Panel id="board" minSize="30%">
        <div className="relative h-full min-h-0">{children}</div>
      </Panel>
    </ClientGroup>
  );
}
