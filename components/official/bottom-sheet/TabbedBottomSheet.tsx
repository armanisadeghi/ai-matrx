"use client";

/**
 * TabbedBottomSheet — iOS Settings–style two-level navigation for tabbed menus.
 *
 * Level 1: a scrollable list of tabs (icon + label + chevron).
 * Level 2: drill into one tab's content with a back button in the header.
 *
 * Used by Smart Input run controls (`RunControlsMenu`) and any other tabbed
 * popover that must become a bottom sheet on mobile per ios-mobile-first.
 *
 * Two invariants make this ONE surface instead of a different panel per tab:
 *
 *   1. **Fixed height** (`size="full"`) — the sheet is the same near-full
 *      height on the index and inside every tab, and it never resizes as
 *      content loads, filters, or expands. An adaptive height here meant the
 *      panel grew and shrank under the user's thumb on every keystroke.
 *   2. **One typography scale** (`matrx-mobile-sheet`, app/globals.css) —
 *      the tab bodies are the same components the desktop window renders at
 *      desktop density (11–12px). That is unreadable and untappable on a
 *      phone, so the sheet promotes small text to mobile sizes and every
 *      field to the 16px that stops iOS focus-zoom. Panels stay density-free;
 *      the host decides the density.
 */

import { useState, type ComponentType, type ReactNode } from "react";
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

  // Every open starts on the index. Adjusted during render (the React-docs
  // pattern for state derived from a prop change) rather than in an effect,
  // which would render the previous tab's body for one frame first.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setSelectedTabId(null);
  }

  const selectedTab = selectedTabId
    ? tabs.find((tab) => tab.id === selectedTabId)
    : null;

  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      size="full"
    >
      <div className="matrx-mobile-sheet flex min-h-0 flex-1 flex-col">
        <BottomSheetHeader
          title={selectedTab ? selectedTab.label : title}
          showBack={!!selectedTab}
          onBack={() => setSelectedTabId(null)}
        />
        {selectedTab ? (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden pb-safe">
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
