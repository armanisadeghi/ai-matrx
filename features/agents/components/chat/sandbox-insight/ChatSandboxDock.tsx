"use client";

/**
 * ChatSandboxDock — where the sandbox panel lives on each form factor.
 *
 * Desktop: a fixed-width column beside the transcript. Phone: a bottom sheet
 * (Drawer, never Dialog — the repo's mobile doctrine), because a 390px screen
 * has no second column and a side panel there would either crush the
 * transcript or scroll the page sideways.
 *
 * The component renders nothing at all when the conversation has no bound
 * box: an empty panel explaining that there is nothing to show is chrome the
 * reader did not ask for, and the header control is absent in that case too.
 */

import React from "react";

import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { ChatSandboxSidePanel } from "./ChatSandboxSidePanel";
import { useChatSandboxPanel } from "./useChatSandboxPanel";

export function ChatSandboxDock({
  conversationId,
}: {
  conversationId: string | null;
}) {
  const { boundRowId, boundName, open, isMobile, close } =
    useChatSandboxPanel(conversationId);

  if (!conversationId || !boundRowId || !open) return null;

  if (isMobile) {
    return (
      <Drawer open onOpenChange={(next) => (next ? undefined : close())}>
        <DrawerContent className="h-[85dvh]">
          <DrawerHeader className="sr-only">
            <DrawerTitle>Sandbox</DrawerTitle>
            <DrawerDescription>
              The terminal, files and activity of the sandbox bound to this
              conversation.
            </DrawerDescription>
          </DrawerHeader>
          <div className="min-h-0 flex-1 overflow-hidden">
            <ChatSandboxSidePanel
              conversationId={conversationId}
              sandboxRowId={boundRowId}
              fallbackName={boundName}
              onClose={close}
            />
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <aside className="hidden h-full w-[380px] shrink-0 border-l border-border md:block xl:w-[440px]">
      <ChatSandboxSidePanel
        conversationId={conversationId}
        sandboxRowId={boundRowId}
        fallbackName={boundName}
        onClose={close}
      />
    </aside>
  );
}
