"use client";

// Static shell: ContextMenu + Trigger always wrap `children` (small bundle).
// Heavy logic (AI, Redux, Flame, modals) loads on demand via next/dynamic.

import dynamic from "next/dynamic";
import { useRef, type ReactNode } from "react";
import * as ContextMenuPrimitive from "@radix-ui/react-context-menu";
import { ContextMenuContent } from "@/components/ui/context-menu/context-menu";
import { useIsMounted } from "@/hooks/use-is-mounted";
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
  const isMounted = useIsMounted();

  // Before hydration is complete, render children directly so the flex-1
  // editor container is always present in the DOM. Without this guard the
  // nested ContextMenu (which also uses useIsMounted) would return null on
  // its first render, collapsing the editor column and pushing NoteMetadataBar
  // to the top of the layout.
  if (!isMounted) {
    return (
      <NoteContextMenuBridgeContext.Provider value={bridgeRef}>
        {children}
      </NoteContextMenuBridgeContext.Provider>
    );
  }

  // Use the Radix primitive directly here so we bypass the wrapped ContextMenu's
  // own useIsMounted check (which would cause a second null-render flash).
  return (
    <NoteContextMenuBridgeContext.Provider value={bridgeRef}>
      <ContextMenuPrimitive.Root
        onOpenChange={(open) => {
          bridgeRef.current?.onContextMenuOpenChange(open);
        }}
      >
        <ContextMenuPrimitive.Trigger
          asChild
          onMouseDown={(e) => bridgeRef.current?.onMouseDown(e)}
          onContextMenu={(e) => bridgeRef.current?.onContextMenu(e)}
        >
          {children}
        </ContextMenuPrimitive.Trigger>
        <NoteContextMenuHeavy {...props} />
      </ContextMenuPrimitive.Root>
    </NoteContextMenuBridgeContext.Provider>
  );
}
