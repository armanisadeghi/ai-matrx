"use client";

/**
 * ShellChatDock — chat BESIDE any ordinary page, with the app's own header and
 * sidebar untouched. It is a column of the shell grid (`chatdock`, styles/
 * shell.css §7), so opening it narrows the page and never moves a header
 * button (the header spans above it). Closed by default; the header's Chat
 * control (THE HEADER RIGHT SET) opens it.
 *
 * Every piece is an existing one:
 *   - the panel is `DockedSidePanel` — slides open/closed, drag its left edge
 *     (340–720px, 420 default), width remembered;
 *   - the conversation is `useCanvasWorkspaceConversation` — the
 *     `chat.default_new_chat` job, organization-gated, launched only once the
 *     dock is first opened;
 *   - the chat is `CanvasChatColumn` — the ONE chat column with the compact
 *     composer;
 *   - the page reaches the agent through `useConversationFollowsPage` — the
 *     conversation's surface stamp follows the page the person is on (Quick
 *     Chat's mechanism, now shared), visible and switchable in the dock's
 *     "Sees" row. On by default: a chat docked beside a page is there to help
 *     with that page.
 *
 * Below 1024px the same chat opens as a bottom sheet (never remembered).
 */

import { useEffect, useState } from "react";
import { Eye, EyeOff, PanelRightClose } from "lucide-react";
import { DockedSidePanel } from "@/components/official/side-panel/DockedSidePanel";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { cn } from "@/lib/utils";
import { ComposerModeSwitch } from "@/features/agents/components/inputs/smart-input/composer/ComposerModeSwitch";
import type { ComposerMode } from "@/features/agents/components/inputs/smart-input/composer/composer-types";
import { CanvasChatColumn } from "@/features/canvas/workspace/CanvasChatColumn";
import { ChatPanelTitleMenu, useChatPanelTitle } from "@/features/canvas/workspace/ChatPanelTitleMenu";
import { useCanvasWorkspaceConversation } from "@/features/canvas/workspace/useCanvasWorkspaceConversation";
import { useConversationFollowsPage } from "@/features/surfaces/runtime/useConversationFollowsPage";
import {
  CHAT_DOCK_PANEL_ID,
  CHAT_DOCK_SIZES,
  CHAT_DOCK_WIDTH_VAR,
  writeChatDockFollowsPage,
  type ChatDockInitial,
} from "./chat-dock-cookie";
import { useChatDock } from "./useChatDock";

/** The dock's conversation focus key (one dock per tab). */
const CHAT_DOCK_SURFACE_KEY = "shell-chat-dock";

const ICON_BUTTON =
  "flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground";

export function ShellChatDock({
  initial,
  initialMode,
}: {
  initial: ChatDockInitial;
  initialMode: ComposerMode | null;
}) {
  const dock = useChatDock(initial.open);
  const [followsPage, setFollowsPageState] = useState(initial.followsPage);
  const [width, setWidth] = useState(initial.width);

  // Page elements pinned to the viewport (the ambient assistant bar, …) read
  // `--shell-chat-dock-w` to stay clear of the dock. The server paints the
  // first value (ChatDockSlots); this keeps it current.
  const occupied = dock.dockOpen && !dock.compact ? width : 0;
  useEffect(() => {
    document.querySelector<HTMLElement>(".shell-root")?.style.setProperty(CHAT_DOCK_WIDTH_VAR, `${occupied}px`);
  }, [occupied]);
  // The chat is SHOWN in exactly one place: the column on a wide screen, the
  // sheet below 1024px. Nothing launches until it is first shown.
  const shown = dock.compact ? dock.sheetOpen : dock.dockOpen;
  const chat = useCanvasWorkspaceConversation(CHAT_DOCK_SURFACE_KEY, { enabled: shown });
  const { pageSurfaceLabel } = useConversationFollowsPage(chat.conversationId, followsPage);
  const title = useChatPanelTitle(chat.conversationId);
  const bodyMounted = shown || chat.conversationId !== null;

  const setFollowsPage = (on: boolean) => {
    setFollowsPageState(on);
    writeChatDockFollowsPage(on);
  };

  const seesRow = (
    <PageContextRow label={pageSurfaceLabel} on={followsPage} onToggle={() => setFollowsPage(!followsPage)} />
  );
  const column = bodyMounted ? (
    <CanvasChatColumn
      conversation={chat.conversation}
      surfaceKey={CHAT_DOCK_SURFACE_KEY}
      onSelectAgent={chat.startWith}
      initialMode={initialMode}
    />
  ) : null;

  return (
    <>
      <DockedSidePanel
        panelId={CHAT_DOCK_PANEL_ID}
        edge="right"
        open={dock.dockOpen}
        sizes={CHAT_DOCK_SIZES}
        initialWidth={initial.width}
        onWidthChange={setWidth}
        aria-label="Chat"
        outerClassName="shell-chat-dock max-lg:hidden"
        className="border-l border-border bg-card"
      >
        <div className="flex h-11 shrink-0 items-center gap-1 border-b border-border px-2">
          <div className="min-w-0 flex-1">
            <ChatPanelTitleMenu conversationId={chat.conversationId} onNewChat={chat.startNew} />
          </div>
          <ComposerModeSwitch size="panel" initialMode={initialMode} />
          <button
            type="button"
            aria-label="Hide chat"
            title="Hide chat"
            onClick={dock.closeDock}
            className={cn(ICON_BUTTON, "ml-1")}
          >
            <PanelRightClose className="h-4 w-4" />
          </button>
        </div>
        {seesRow}
        <div className="flex min-h-0 flex-1 flex-col">{dock.compact ? null : column}</div>
      </DockedSidePanel>

      {dock.compact ? (
        <Drawer open={dock.sheetOpen} onOpenChange={(open) => !open && dock.closeSheet()}>
          <DrawerContent className="flex h-[85dvh] flex-col pb-safe">
            <DrawerHeader className="py-2">
              <DrawerTitle className="text-sm">{title}</DrawerTitle>
              <DrawerDescription className="sr-only">
                A chat beside this page{pageSurfaceLabel && followsPage ? ` — it sees ${pageSurfaceLabel}` : ""}.
              </DrawerDescription>
            </DrawerHeader>
            <div className="flex shrink-0 justify-center px-3 pb-2">
              <ComposerModeSwitch size="panel" initialMode={initialMode} />
            </div>
            {seesRow}
            <div className="flex min-h-0 flex-1 flex-col">{column}</div>
          </DrawerContent>
        </Drawer>
      ) : null}
    </>
  );
}

/**
 * What the chat can see of the page, said plainly, with the switch beside it.
 * On an unregistered page it says there is nothing to share — never a toggle
 * that pretends to do something.
 */
function PageContextRow({
  label,
  on,
  onToggle,
}: {
  label: string | null;
  on: boolean;
  onToggle: () => void;
}) {
  if (!label) {
    return (
      <p className="shrink-0 border-b border-border px-3 py-1.5 text-xs text-muted-foreground">
        This page shares nothing with the chat yet.
      </p>
    );
  }
  const Icon = on ? Eye : EyeOff;
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={on}
      title={
        on
          ? `The chat receives the live values from ${label} with every message — click to stop`
          : `Click to let the chat see ${label}`
      }
      className="flex w-full shrink-0 items-center gap-1.5 border-b border-border px-3 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
    >
      <Icon className={cn("h-3.5 w-3.5 shrink-0", on && "text-primary")} aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate">
        {on ? (
          <>
            Sees <span className="font-medium text-foreground">{label}</span>
          </>
        ) : (
          <>Not seeing this page</>
        )}
      </span>
      <span className="shrink-0 text-muted-foreground">{on ? "On" : "Off"}</span>
    </button>
  );
}
