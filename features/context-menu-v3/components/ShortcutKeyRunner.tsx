"use client";

// features/context-menu-v3/components/ShortcutKeyRunner.tsx
//
// Runs ONE agent shortcut whose advertised key combo was pressed — through the
// SAME engine and the same launch handler the menu item uses
// (`useContextMenuActions().handleShortcutExecute`), so a combo and a click
// launch identically (scope, selection, widget handle, display mode). Renders
// nothing; the shell mounts it for one press and drops it when done.

import { useEffect, useRef } from "react";
import { toast } from "@/components/ui/use-toast";
import { useContextMenuActions } from "../hooks/useContextMenuActions";
import type { AgentMenuCategoryGroup, AgentMenuEntry } from "../hooks/useUnifiedAgentContextMenu";
import type { MenuContentProps } from "../types";

type ShortcutEntry = Extract<AgentMenuEntry, { entryType: "agent_shortcut" }>;

function findShortcut(groups: AgentMenuCategoryGroup[], id: string): ShortcutEntry | null {
  for (const group of groups) {
    for (const item of group.items) {
      if (item.entryType === "agent_shortcut" && item.id === id) return item;
    }
    const nested = findShortcut(group.children, id);
    if (nested) return nested;
  }
  return null;
}

export interface ShortcutKeyRunnerProps extends Omit<MenuContentProps, "variant"> {
  shortcutId: string;
  shortcutLabel: string;
  onDone(): void;
}

export default function ShortcutKeyRunner(props: ShortcutKeyRunnerProps): null {
  const { shortcutId, shortcutLabel, onDone, ...menuProps } = props;
  const m = useContextMenuActions(menuProps);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current || m.loading) return;
    ran.current = true;
    const entry = findShortcut(m.categoryGroups, shortcutId);
    if (!entry) {
      toast({
        title: m.librariesError
          ? `Couldn't load ${shortcutLabel}`
          : `${shortcutLabel} isn't available here`,
        ...(m.librariesError ? { variant: "destructive" as const } : {}),
      });
      onDone();
      return;
    }
    void m.handleShortcutExecute(entry).finally(onDone);
  });

  return null;
}
