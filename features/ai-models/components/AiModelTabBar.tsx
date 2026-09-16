"use client";

import { TableViewTabs } from "@ai-matrx/design-system/data-table";
import type { TabState } from "../hooks/useTabUrlState";

interface AiModelTabBarProps {
  tabs: TabState[];
  activeTabId: string;
  counts: Record<string, number>;
  onSelectTab: (id: string) => void;
  onCloseTab: (id: string) => void;
  onRenameTab: (id: string, label: string) => void;
  onAddTab: () => void;
}

/** Models owns its URL-backed query state; the package owns the tab UI. */
export default function AiModelTabBar(props: AiModelTabBarProps) {
  return <TableViewTabs
    tabs={props.tabs.map(tab => ({ id: tab.id, label: tab.label, count: props.counts[tab.id] ?? 0 }))}
    activeId={props.activeTabId}
    onSelect={props.onSelectTab}
    onClose={props.onCloseTab}
    onRename={props.onRenameTab}
    onAdd={props.onAddTab}
  />;
}
