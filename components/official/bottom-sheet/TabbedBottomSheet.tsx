"use client";

/**
 * TabbedBottomSheet — iOS Settings–style two-level navigation for tabbed menus.
 *
 * Level 1: a scrollable list of tabs (icon + label + chevron).
 * Level 2: drill into one tab's content with a back button in the header.
 *
 * Used by Smart Input run controls (`RunControlsMenu`) and any other tabbed
 * popover that must become a bottom sheet on mobile per ios-mobile-first.
 */

import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import {
  BottomSheet,
  BottomSheetHeader,
  BottomSheetBody,
} from "@/components/official/bottom-sheet/BottomSheet";

export interface TabbedBottomSheetTab {
  id: string;
  label: string;
  icon?: ComponentType<{ className?: string }>;
  /** Optional trailing badge / dot shown on the index row. */
  trailing?: ReactNode;
  content: ReactNode;
}

export interface TabbedBottomSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  tabs: TabbedBottomSheetTab[];
}

export function TabbedBottomSheet({
  open,
  onOpenChange,
  title,
  tabs,
}: TabbedBottomSheetProps) {
  const [selectedTabId, setSelectedTabId] = useState<string | null>(null);

  useEffect(() => {
    if (open) setSelectedTabId(null);
  }, [open]);

  const selectedTab = selectedTabId
    ? tabs.find((tab) => tab.id === selectedTabId)
    : null;

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title={title}>
      <div className="flex min-h-0 flex-1 flex-col">
        <BottomSheetHeader
          title={selectedTab ? selectedTab.label : title}
          showBack={!!selectedTab}
          onBack={() => setSelectedTabId(null)}
        />
        {selectedTab ? (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {selectedTab.content}
          </div>
        ) : (
          <BottomSheetBody>
            <ul className="divide-y divide-border">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <li key={tab.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedTabId(tab.id)}
                      className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-muted/60 active:bg-muted"
                    >
                      {Icon ? (
                        <Icon className="h-5 w-5 shrink-0 text-muted-foreground" />
                      ) : null}
                      <span className="min-w-0 flex-1 text-base text-foreground">
                        {tab.label}
                      </span>
                      {tab.trailing}
                      <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
                    </button>
                  </li>
                );
              })}
            </ul>
          </BottomSheetBody>
        )}
      </div>
    </BottomSheet>
  );
}
