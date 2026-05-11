"use client";

// Static shell: ContextMenu + Trigger always wrap `children` (small bundle).
// Heavy logic (AI, Redux, Flame, modals) loads on demand via next/dynamic.

import dynamic from "next/dynamic";
import { useRef, type ReactNode } from "react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
} from "@/components/ui/context-menu/context-menu";
import {
  NoteContextMenuBridgeContext,
  type NoteContextMenuBridgeHandlers,
} from "./noteContextMenuBridge";
import type { NoteContextMenuContentProps } from "./NoteContextMenuContent";

export type NoteContextMenuProps = NoteContextMenuContentProps & {
  children: ReactNode;
};

const NoteContextMenuHeavy = dynamic(
  () =>
    import("./NoteContextMenuContent").then((m) => ({
      default: m.NoteContextMenuHeavy,
    })),
  {
    ssr: false,
    loading: () => (
      <ContextMenuContent className="w-0 h-0 p-0 overflow-hidden border-0 shadow-none pointer-events-none" />
    ),
  },
);

export default function NoteContextMenu({
  children,
  ...props
}: NoteContextMenuProps) {
  const bridgeRef = useRef<NoteContextMenuBridgeHandlers | null>(null);

  return (
    <NoteContextMenuBridgeContext.Provider value={bridgeRef}>
      <ContextMenu
        onOpenChange={(open) => {
          bridgeRef.current?.onContextMenuOpenChange(open);
        }}
      >
        <ContextMenuTrigger
          asChild
          onMouseDown={(e) => bridgeRef.current?.onMouseDown(e)}
          onContextMenu={(e) => bridgeRef.current?.onContextMenu(e)}
        >
          {children}
        </ContextMenuTrigger>
        <NoteContextMenuHeavy {...props} />
      </ContextMenu>
    </NoteContextMenuBridgeContext.Provider>
  );
}
