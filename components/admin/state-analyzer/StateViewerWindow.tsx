"use client";

import React, { useState } from "react";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import type { RootState } from "@/lib/redux/store";
import { useAppStore } from "@/lib/redux/hooks";
import {
  getStateViewerTabs,
  STATE_VIEWER_DEFAULT_TAB_ID,
  TAB_INDEX_ID,
  TabNavigationContext,
} from "./stateViewerTabs";
import { Input } from "@/components/ui/input";
import { ChevronLeft, Search } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

interface StateViewerWindowProps {
  isOpen: boolean;
  onClose: () => void;
}

const useCompleteState = (): RootState => {
  const store = useAppStore();
  return store.getState();
};

export default function StateViewerWindow({
  isOpen,
  onClose,
}: StateViewerWindowProps) {
  const completeState = useCompleteState();
  const [activeTabId, setActiveTabId] = useState<string>(
    STATE_VIEWER_DEFAULT_TAB_ID,
  );
  const [searchQuery, setSearchQuery] = useState("");

  if (!isOpen) return null;

  const tabs = getStateViewerTabs(completeState, setActiveTabId);

  const sidebarTabs = tabs.filter((t) => t.id !== TAB_INDEX_ID);
  const sortedTabs = [...sidebarTabs].sort((a, b) =>
    (a.label ?? "").localeCompare(b.label ?? ""),
  );
  const filteredTabs = sortedTabs.filter((t) => {
    const label = t.label?.toLowerCase() ?? "";
    return label.includes(searchQuery.toLowerCase());
  });

  const activeTabContent = tabs.find((t) => t.id === activeTabId)?.content;
  const isOnIndex = activeTabId === TAB_INDEX_ID;
  const activeTabLabel =
    tabs.find((t) => t.id === activeTabId)?.label || "Slice Viewer";

  const sidebarContent = (
    <>
      <div className="p-3 border-b border-border shrink-0">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search slices..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 h-8 text-xs"
          />
        </div>
      </div>
      <ScrollArea className="flex-1 w-full">
        <div className="p-2 space-y-0.5">
          {filteredTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTabId(tab.id)}
              className={cn(
                "w-full text-left px-3 py-1.5 rounded-md text-sm transition-colors truncate",
                activeTabId === tab.id
                  ? "bg-primary text-primary-foreground font-medium"
                  : "hover:bg-muted text-muted-foreground hover:text-foreground",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </ScrollArea>
    </>
  );

  return (
    <TabNavigationContext.Provider value={setActiveTabId}>
      <WindowPanel
        titleNode={
          <span className="flex items-center gap-1.5 min-w-0">
            <span className="shrink-0">State Analyzer</span>
            <span className="text-muted-foreground shrink-0">/</span>
            <span className="font-normal text-muted-foreground truncate">
              {activeTabLabel}
            </span>
          </span>
        }
        minWidth={800}
        minHeight={600}
        width={800}
        height={600}
        urlSyncKey="state_analyzer"
        onClose={onClose}
        sidebar={sidebarContent}
        sidebarDefaultSize={200}
        sidebarMinSize={150}
        sidebarClassName="bg-muted/10"
        bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
        actionsLeft={
          !isOnIndex ? (
            <button
              onClick={() => setActiveTabId(TAB_INDEX_ID)}
              className="shrink-0 h-5 w-5 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              title="Back to Tab Index"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          ) : undefined
        }
      >
        <div className="flex flex-col h-full min-w-0 overflow-hidden">
          <div className="flex-1 min-h-0 overflow-hidden">
            {activeTabContent}
          </div>
        </div>
      </WindowPanel>
    </TabNavigationContext.Provider>
  );
}
