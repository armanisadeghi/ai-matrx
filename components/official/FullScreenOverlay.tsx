"use client";
import React, { ReactNode, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerTitle,
  DrawerDescription,
} from "@/components/ui/drawer";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChevronLeft, ChevronRight, Save, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface TabDefinition {
  id: string;
  label: string;
  content: ReactNode;
  className?: string;
}

export interface FullScreenOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  tabs: TabDefinition[];
  initialTab?: string;
  onTabChange?: (newTab: string) => void;
  footerContent?: ReactNode;
  showSaveButton?: boolean;
  onSave?: () => void;
  saveButtonLabel?: string;
  saveButtonDisabled?: boolean;
  showCancelButton?: boolean;
  onCancel?: () => void;
  cancelButtonLabel?: string;
  additionalButtons?: ReactNode;
  width?: string;
  height?: string;
  // New optional props for split view
  sidePanel?: ReactNode;
  sidePanelRatio?: number; // value between 0-1, defaults to 0.5 (50/50 split)
  sidePanelClassName?: string;
  // New optional props for left side panel
  leftSidePanel?: ReactNode;
  leftSidePanelRatio?: number; // value between 0-1, defaults to 0.15 (15% width)
  leftSidePanelClassName?: string;
  // New optional prop for shared header above all tabs content
  sharedHeader?: ReactNode;
  sharedHeaderClassName?: string;
  // Hide the title visually (keeps it for screen readers)
  hideTitle?: boolean;
  // Render tabs as a compact rectangular button-group instead of the default pill style
  compactTabs?: boolean;
  // When set, the tab bar hides this tab from the button row and shows a left
  // chevron that navigates back to it (used for a "Tab Index" landing tab).
  homeTabId?: string;
}

const ScrollableTabBar = ({
  tabs,
  activeTab,
  onTabChange,
  compact,
  homeTabId,
}: {
  tabs: TabDefinition[];
  activeTab: string;
  onTabChange: (id: string) => void;
  compact: boolean;
  homeTabId?: string;
}) => {
  const showChevron = homeTabId && activeTab !== homeTabId;
  const visibleTabs = homeTabId ? tabs.filter((t) => t.id !== homeTabId) : tabs;

  return (
    <div className="inline-flex flex-row items-center gap-0">
      {showChevron && (
        <button
          type="button"
          onClick={() => onTabChange(homeTabId)}
          className="shrink-0 h-6 w-6 flex items-center justify-center rounded-md mr-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          title="Back to Tab Index"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
      )}
      <div className="inline-flex flex-row overflow-x-auto scrollbar-none gap-0 rounded-md bg-transparent border-2 border-border">
        {visibleTabs.map((tab, index) => {
          const isActive = tab.id === activeTab;
          const isNotLast = index < visibleTabs.length - 1;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onTabChange(tab.id)}
              className={cn(
                "shrink-0 whitespace-nowrap text-xs px-2 py-0.5 h-6 cursor-pointer transition-colors",
                isNotLast && "border-r border-border",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "bg-gray-50 dark:bg-gray-800 text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
    </div>
  );
};

const FullScreenOverlay: React.FC<FullScreenOverlayProps> = ({
  isOpen,
  onClose,
  title,
  description,
  tabs,
  initialTab,
  onTabChange,
  footerContent,
  showSaveButton = false,
  onSave,
  saveButtonLabel = "Save",
  saveButtonDisabled = false,
  showCancelButton = false,
  onCancel,
  cancelButtonLabel = "Cancel",
  additionalButtons,
  width = "90vw",
  height = "95dvh",
  sidePanel,
  sidePanelRatio = 0.5,
  sidePanelClassName,
  leftSidePanel,
  leftSidePanelRatio = 0.1,
  leftSidePanelClassName,
  sharedHeader,
  sharedHeaderClassName,
  hideTitle = false,
  compactTabs = true,
  homeTabId,
}) => {
  const [activeTab, setActiveTab] = React.useState<string>(
    initialTab || (tabs.length > 0 ? tabs[0].id : ""),
  );
  // Mobile two-level navigation: null = show the tab index (iOS Settings style),
  // non-null = show that tab's content with a back chevron. Reset to null on
  // each open so the user always lands on the index.
  const [mobileSelectedTab, setMobileSelectedTab] = useState<string | null>(
    null,
  );
  const [isMobile, setIsMobile] = useState(false);
  const [viewportHeight, setViewportHeight] = useState<number | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  // Sync activeTab when initialTab changes (e.g., reopening overlay with a different tab)
  useEffect(() => {
    if (isOpen && initialTab) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

  // Reset mobile drill-in state whenever the drawer opens.
  useEffect(() => {
    if (isOpen) setMobileSelectedTab(null);
  }, [isOpen]);

  // Detect mobile screen size
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };

    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Track visual viewport height for keyboard handling on mobile
  // On real devices, the visual viewport shrinks when the keyboard opens.
  // Using visualViewport.height instead of dvh/vh ensures the overlay
  // never extends behind the keyboard or beyond reachable screen area.
  useEffect(() => {
    if (!isMobile || typeof window === "undefined") return undefined;

    const updateHeight = () => {
      if (window.visualViewport) {
        setViewportHeight(window.visualViewport.height);
      }
    };

    // Initial measurement
    updateHeight();

    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", updateHeight);
      window.visualViewport.addEventListener("scroll", updateHeight);
    }
    // Fallback for browsers without visualViewport
    window.addEventListener("resize", updateHeight);

    return () => {
      if (window.visualViewport) {
        window.visualViewport.removeEventListener("resize", updateHeight);
        window.visualViewport.removeEventListener("scroll", updateHeight);
      }
      window.removeEventListener("resize", updateHeight);
    };
  }, [isMobile]);

  // When keyboard opens, scroll the focused input into view within the overlay
  useEffect(() => {
    if (!isMobile || !isOpen) return undefined;

    const handleFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target.isContentEditable
      ) {
        // Allow the keyboard to fully appear before scrolling
        setTimeout(() => {
          target.scrollIntoView({ behavior: "smooth", block: "center" });
        }, 300);
      }
    };

    document.addEventListener("focusin", handleFocusIn);
    return () => document.removeEventListener("focusin", handleFocusIn);
  }, [isMobile, isOpen]);

  const handleTabChange = (newTab: string) => {
    setActiveTab(newTab);
    if (onTabChange) {
      onTabChange(newTab);
    }
  };

  const handleSave = () => {
    if (onSave) {
      onSave();
    }
  };

  const handleCancel = () => {
    if (onCancel) {
      onCancel();
    } else {
      onClose();
    }
  };

  // Calculate the width percentages based on ratio (desktop only)
  const rightSidePanelWidth = sidePanel && !isMobile ? sidePanelRatio * 100 : 0;
  const leftSidePanelWidth =
    leftSidePanel && !isMobile ? leftSidePanelRatio * 100 : 0;
  const contentWidth = 100 - rightSidePanelWidth - leftSidePanelWidth;

  // ── Shared header (title + tab bar) ─────────────────────────────────────
  const headerInner = (
    <>
      <div
        className={cn(
          "flex flex-row items-center pr-10",
          isMobile ? "px-3 pt-1 pb-1" : "px-4 pt-2.5 pb-0",
        )}
      >
        {isMobile ? (
          <DrawerTitle
            className={cn(
              "shrink-0 text-base font-semibold",
              hideTitle && "sr-only",
            )}
          >
            {title}
          </DrawerTitle>
        ) : (
          <DialogTitle
            className={cn("shrink-0 text-sm", hideTitle && "sr-only")}
          >
            {title}
          </DialogTitle>
        )}
      </div>

      <div
        className={cn(
          "max-w-full overflow-y-hidden pb-2",
          isMobile ? "px-2" : "",
        )}
      >
        <div className="inline-flex items-center">
          <ScrollableTabBar
            tabs={tabs}
            activeTab={activeTab}
            onTabChange={handleTabChange}
            compact={compactTabs}
            homeTabId={homeTabId}
          />
        </div>
      </div>
    </>
  );

  // ── Shared body (side panels + tab content) ─────────────────────────────
  const bodyInner = (
    <div
      ref={contentRef}
      className={cn(
        "flex flex-1 overflow-hidden min-h-0",
        isMobile ? "flex-col" : "flex-row",
      )}
    >
      {leftSidePanel && !isMobile && (
        <div
          className={cn("border-r overflow-auto", leftSidePanelClassName)}
          style={{ width: `${leftSidePanelWidth}%` }}
        >
          {leftSidePanel}
        </div>
      )}

      <div
        className="flex flex-col overflow-hidden min-h-0"
        style={!isMobile ? { width: `${contentWidth}%` } : { width: "100%" }}
      >
        <Tabs
          value={activeTab}
          className="flex-grow flex flex-col overflow-hidden min-h-0 border border-border"
        >
          {tabs.map((tab) => (
            <TabsContent
              key={`content-${tab.id}`}
              value={tab.id}
              className={cn(
                "flex-grow mt-0 border-none overflow-auto outline-none ring-0 min-h-0 data-[state=active]:flex data-[state=active]:flex-col",
                isMobile ? "px-0" : "",
                tab.className,
              )}
            >
              {tab.content}
            </TabsContent>
          ))}
        </Tabs>
      </div>

      {sidePanel && !isMobile && (
        <div
          className={cn("border-l overflow-auto", sidePanelClassName)}
          style={{ width: `${rightSidePanelWidth}%` }}
        >
          {sidePanel}
        </div>
      )}
    </div>
  );

  // ── Shared footer ──────────────────────────────────────────────────────
  const hasFooter =
    showSaveButton || showCancelButton || additionalButtons || footerContent;

  const footerInner = hasFooter ? (
    <div
      className={cn(
        "border-t flex-shrink-0 bg-background",
        isMobile
          ? "flex flex-row items-center justify-between gap-1 p-1.5 pb-safe"
          : "flex items-center justify-end p-1 pr-3",
      )}
    >
      {additionalButtons && (
        <div
          className={cn(
            "flex items-center gap-1",
            isMobile ? "shrink-0" : "mr-1 gap-2",
          )}
        >
          {additionalButtons}
        </div>
      )}
      {footerContent}
      <div
        className={cn(
          "flex items-center",
          isMobile ? "gap-1 shrink-0" : "gap-2",
        )}
      >
        {showCancelButton &&
          (isMobile ? (
            <Button
              variant="outline"
              size="icon"
              onClick={handleCancel}
              aria-label={cancelButtonLabel}
              title={cancelButtonLabel}
              className="h-9 w-9"
            >
              <X className="h-4 w-4" />
            </Button>
          ) : (
            <Button variant="outline" onClick={handleCancel}>
              {cancelButtonLabel}
            </Button>
          ))}
        {showSaveButton &&
          (isMobile ? (
            <Button
              size="icon"
              onClick={handleSave}
              disabled={saveButtonDisabled}
              aria-label={saveButtonLabel}
              title={saveButtonLabel}
              className="h-9 w-9"
            >
              <Save className="h-4 w-4" />
            </Button>
          ) : (
            <Button onClick={handleSave} disabled={saveButtonDisabled}>
              <Save className="h-4 w-4 mr-2" />
              {saveButtonLabel}
            </Button>
          ))}
      </div>
    </div>
  ) : null;

  // ── Mobile: Drawer with iOS Settings–style two-level navigation ────────
  if (isMobile) {
    // On mobile we ignore the desktop `homeTabId` concept — every tab is shown
    // in the index list. The drill-in view shows exactly one tab's content.
    const selectedTab = mobileSelectedTab
      ? tabs.find((t) => t.id === mobileSelectedTab)
      : null;

    return (
      <Drawer open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DrawerContent
          className={cn(
            "flex flex-col p-0 gap-0 bg-background border-t-2 border-border rounded-t-2xl",
            "h-[95dvh] max-h-[95dvh]",
          )}
        >
          <DrawerDescription className="sr-only">
            {description ?? title}
          </DrawerDescription>

          {/* Header: index shows title, detail shows back chevron + tab label */}
          <div className="w-full flex-shrink-0 border-b">
            {selectedTab ? (
              <div className="flex flex-row items-center px-2 pt-1 pb-2 pr-10">
                <button
                  type="button"
                  onClick={() => setMobileSelectedTab(null)}
                  className="shrink-0 h-8 w-8 -ml-1 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  aria-label="Back"
                  title="Back"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <DrawerTitle className="text-base font-semibold truncate">
                  {selectedTab.label}
                </DrawerTitle>
              </div>
            ) : (
              <div className="flex flex-row items-center px-3 pt-1 pb-2 pr-10">
                <DrawerTitle
                  className={cn(
                    "text-base font-semibold",
                    hideTitle && "sr-only",
                  )}
                >
                  {title}
                </DrawerTitle>
              </div>
            )}
          </div>

          {/* Body: either the iOS-style list of tabs, or a single tab's content */}
          {selectedTab ? (
            <>
              {sharedHeader && (
                <div
                  className={cn(
                    "border-b py-2 flex-shrink-0 px-2",
                    sharedHeaderClassName,
                  )}
                >
                  {sharedHeader}
                </div>
              )}
              <div
                ref={contentRef}
                className="flex flex-1 flex-col overflow-hidden min-h-0"
              >
                <div
                  className={cn(
                    "flex flex-1 flex-col overflow-auto min-h-0 outline-none",
                    selectedTab.className,
                  )}
                >
                  {selectedTab.content}
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 overflow-y-auto">
              <ul className="divide-y divide-border">
                {tabs.map((tab) => (
                  <li key={`mobile-index-${tab.id}`}>
                    <button
                      type="button"
                      onClick={() => {
                        setMobileSelectedTab(tab.id);
                        handleTabChange(tab.id);
                      }}
                      className="w-full flex items-center justify-between px-4 py-3.5 text-left hover:bg-muted/60 active:bg-muted transition-colors"
                    >
                      <span className="text-base text-foreground">
                        {tab.label}
                      </span>
                      <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {footerInner}
        </DrawerContent>
      </Drawer>
    );
  }

  // ── Desktop: Dialog ─────────────────────────────────────────────────────
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="flex flex-col p-0 gap-0 bg-background border-solid rounded-3xl border-2 border-border"
        style={{ width, maxWidth: width, height, maxHeight: height }}
      >
        <DialogHeader className="w-full pl-2 pr-10">
          {headerInner}
          <DialogDescription className="sr-only">
            {description ?? title}
          </DialogDescription>
        </DialogHeader>

        {sharedHeader && (
          <div
            className={cn(
              "border-b py-2 flex-shrink-0 px-4",
              sharedHeaderClassName,
            )}
          >
            {sharedHeader}
          </div>
        )}

        {bodyInner}

        {hasFooter && (
          <DialogFooter className="p-0">{footerInner}</DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default FullScreenOverlay;
