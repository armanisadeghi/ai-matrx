"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { EmbedSiteFrame } from "@/features/window-panels/components/EmbedSiteFrame";
import {
  normalizeUserUrl,
  shortUrlLabel,
} from "@/features/window-panels/utils/embed-site-url";
import {
  isSystemSiteWorkbenchBookmark,
  mergeSiteWorkbenchBookmarks,
  SITE_WORKBENCH_DEFAULT_URL,
  SITE_WORKBENCH_USER_BOOKMARKS_MAX,
  type SiteWorkbenchBookmark,
} from "@/features/window-panels/windows/iframe/site-workbench-bookmarks";
import { useSetting } from "@/features/settings/hooks/useSetting";
import type { SiteWorkbenchUserBookmark } from "@/lib/redux/preferences/userPreferencesSlice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { BookMarked, Plus, X } from "lucide-react";
import { toast } from "@/lib/toast";

export type { SiteWorkbenchBookmark };

export interface BrowserWorkbenchTab {
  id: string;
  label: string;
  url: string;
}

function newId(): string {
  return globalThis.crypto.randomUUID();
}

function isTabRow(x: unknown): x is BrowserWorkbenchTab {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.id === "string" &&
    typeof o.label === "string" &&
    typeof o.url === "string"
  );
}

function parseTabs(raw: unknown): BrowserWorkbenchTab[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(isTabRow);
}

export interface BrowserWorkbenchWindowProps {
  isOpen: boolean;
  onClose: () => void;
  initialBookmarks?: unknown;
  initialTabs?: unknown;
  initialActiveTabId?: string | null;
}

export default function BrowserWorkbenchWindow({
  isOpen,
  onClose,
  initialBookmarks,
  initialTabs,
  initialActiveTabId,
}: BrowserWorkbenchWindowProps) {
  if (!isOpen) return null;
  return (
    <BrowserWorkbenchWindowInner
      onClose={onClose}
      initialTabs={initialTabs}
      initialActiveTabId={initialActiveTabId}
    />
  );
}

function BookmarkSection({
  title,
  bookmarks,
  onOpen,
  onRemove,
  removable,
}: {
  title: string;
  bookmarks: SiteWorkbenchBookmark[];
  onOpen: (url: string, label: string) => void;
  onRemove?: (id: string) => void;
  removable: boolean;
}) {
  if (bookmarks.length === 0) return null;
  return (
    <div className="space-y-0.5">
      <div className="px-2 pt-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </div>
      <ul className="space-y-0.5 px-1.5 pb-1">
        {bookmarks.map((b) => (
          <li key={b.id} className="group flex items-stretch gap-0.5">
            <button
              type="button"
              className="min-w-0 flex-1 rounded-md border border-transparent px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent"
              onClick={() => onOpen(b.url, b.label)}
            >
              <span className="line-clamp-2 font-medium">{b.label}</span>
              <span className="line-clamp-1 font-mono text-[10px] text-muted-foreground">
                {shortUrlLabel(b.url)}
              </span>
            </button>
            {removable && onRemove ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-auto w-7 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                onClick={() => onRemove(b.id)}
                aria-label={`Remove ${b.label}`}
              >
                <X className="h-3 w-3" />
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

function BrowserWorkbenchWindowInner({
  onClose,
  initialTabs,
  initialActiveTabId,
}: Omit<BrowserWorkbenchWindowProps, "isOpen" | "initialBookmarks">) {
  const [userBookmarks, setUserBookmarks] = useSetting<
    SiteWorkbenchUserBookmark[]
  >("userPreferences.siteWorkbench.bookmarks");

  const allBookmarks = useMemo(
    () => mergeSiteWorkbenchBookmarks(userBookmarks),
    [userBookmarks],
  );

  const systemBookmarks = useMemo(
    () =>
      allBookmarks.filter((bookmark) =>
        isSystemSiteWorkbenchBookmark(bookmark.id),
      ),
    [allBookmarks],
  );

  const personalBookmarks = useMemo(
    () =>
      allBookmarks.filter(
        (bookmark) => !isSystemSiteWorkbenchBookmark(bookmark.id),
      ),
    [allBookmarks],
  );

  const [tabs, setTabs] = useState<BrowserWorkbenchTab[]>(() => {
    const parsed = parseTabs(initialTabs);
    if (parsed.length > 0) return parsed;
    const id = newId();
    return [{ id, label: "Lucide", url: SITE_WORKBENCH_DEFAULT_URL }];
  });

  const [activeTabId, setActiveTabId] = useState<string | null>(() => {
    const parsed = parseTabs(initialTabs);
    const firstId = parsed[0]?.id ?? null;
    if (
      typeof initialActiveTabId === "string" &&
      parsed.some((t) => t.id === initialActiveTabId)
    ) {
      return initialActiveTabId;
    }
    return firstId;
  });

  const activeTab = useMemo(
    () => tabs.find((t) => t.id === activeTabId) ?? tabs[0] ?? null,
    [tabs, activeTabId],
  );

  const [addressDraft, setAddressDraft] = useState(activeTab?.url ?? "");

  useEffect(() => {
    if (activeTab) setAddressDraft(activeTab.url);
  }, [activeTab?.id, activeTab?.url]);

  useEffect(() => {
    if (!activeTabId && tabs.length > 0) {
      setActiveTabId(tabs[0].id);
    }
  }, [activeTabId, tabs]);

  const collectData = useCallback(
    (): Record<string, unknown> => ({
      tabs,
      activeTabId,
    }),
    [tabs, activeTabId],
  );

  const openOrFocusUrl = useCallback((url: string, label: string) => {
    const normalized = normalizeUserUrl(url);
    if (!normalized) {
      toast.error("Invalid URL");
      return;
    }
    setTabs((prev) => {
      const hit = prev.find((t) => t.url === normalized);
      if (hit) {
        setActiveTabId(hit.id);
        return prev;
      }
      const id = newId();
      setActiveTabId(id);
      return [
        ...prev,
        { id, url: normalized, label: shortUrlLabel(normalized) || label },
      ];
    });
  }, []);

  const go = useCallback(() => {
    const next = normalizeUserUrl(addressDraft);
    if (!next) {
      toast.error("Enter a valid URL");
      return;
    }
    if (!activeTab) return;
    setTabs((prev) =>
      prev.map((t) =>
        t.id === activeTab.id
          ? { ...t, url: next, label: shortUrlLabel(next) }
          : t,
      ),
    );
  }, [addressDraft, activeTab]);

  const newTab = useCallback(() => {
    const id = newId();
    const url = SITE_WORKBENCH_DEFAULT_URL;
    setTabs((prev) => [...prev, { id, url, label: "New" }]);
    setActiveTabId(id);
  }, []);

  const closeTab = useCallback(
    (id: string) => {
      setTabs((prev) => {
        const next = prev.filter((t) => t.id !== id);
        if (activeTabId === id) {
          setActiveTabId(next[0]?.id ?? null);
        }
        return next;
      });
    },
    [activeTabId],
  );

  const bookmarkActive = useCallback(() => {
    if (!activeTab) return;
    const normalized = normalizeUserUrl(activeTab.url);
    if (!normalized) {
      toast.error("Invalid URL");
      return;
    }
    if (allBookmarks.some((bookmark) => bookmark.url === normalized)) {
      toast.message("Already in bookmarks");
      return;
    }
    if (userBookmarks.length >= SITE_WORKBENCH_USER_BOOKMARKS_MAX) {
      toast.error(
        `You can save up to ${SITE_WORKBENCH_USER_BOOKMARKS_MAX} bookmarks`,
      );
      return;
    }
    setUserBookmarks([
      ...userBookmarks,
      {
        id: newId(),
        label: activeTab.label || shortUrlLabel(normalized),
        url: normalized,
      },
    ]);
  }, [activeTab, allBookmarks, setUserBookmarks, userBookmarks]);

  const removeUserBookmark = useCallback(
    (id: string) => {
      if (isSystemSiteWorkbenchBookmark(id)) return;
      setUserBookmarks(userBookmarks.filter((bookmark) => bookmark.id !== id));
    },
    [setUserBookmarks, userBookmarks],
  );

  const sidebar = (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-1 border-b px-2 py-1.5">
        <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          <BookMarked className="h-3 w-3" />
          Bookmarks
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 px-1.5"
          onClick={bookmarkActive}
          title="Save active tab to your bookmarks"
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        {allBookmarks.length === 0 ? (
          <p className="px-2 py-2 text-[11px] text-muted-foreground">
            Save the current page with +. Click a bookmark to open a tab.
          </p>
        ) : (
          <>
            <BookmarkSection
              title="Built-in"
              bookmarks={systemBookmarks}
              onOpen={openOrFocusUrl}
              removable={false}
            />
            <BookmarkSection
              title="Yours"
              bookmarks={personalBookmarks}
              onOpen={openOrFocusUrl}
              onRemove={removeUserBookmark}
              removable
            />
          </>
        )}
      </ScrollArea>
    </div>
  );

  return (
    <WindowPanel
      title="Site workbench"
      id="browser-workbench-window"
      minWidth={640}
      minHeight={420}
      width={900}
      height={620}
      position="center"
      onClose={onClose}
      overlayId="browserWorkbenchWindow"
      onCollectData={collectData}
      sidebar={sidebar}
      sidebarDefaultSize={220}
      sidebarMinSize={160}
      sidebarExpandsWindow
      footer={
        <div className="flex w-full min-w-0 flex-wrap items-center gap-2 px-2 py-1.5">
          <Input
            value={addressDraft}
            onChange={(e) => setAddressDraft(e.target.value)}
            className="h-8 min-w-[12rem] flex-1 font-mono text-xs"
            style={{ fontSize: "16px" }}
            placeholder="https://…"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                go();
              }
            }}
            aria-label="Active tab URL"
          />
          <div className="flex shrink-0 items-center gap-1">
            <Button type="button" size="sm" className="h-8" onClick={go}>
              Go
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="h-8"
              onClick={newTab}
            >
              New tab
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex h-full min-h-0 flex-col gap-0 border-t border-border/60">
        <div className="flex shrink-0 gap-0.5 overflow-x-auto border-b border-border bg-muted/30 px-1 py-1">
          {tabs.map((t) => (
            <div
              key={t.id}
              className={cn(
                "flex max-w-[140px] shrink-0 items-center rounded-md border text-left text-[11px] transition-colors",
                t.id === activeTab?.id
                  ? "border-border bg-background shadow-sm"
                  : "border-transparent bg-transparent hover:bg-muted/80",
              )}
            >
              <button
                type="button"
                className="min-w-0 flex-1 truncate px-2 py-1 text-left font-medium"
                onClick={() => setActiveTabId(t.id)}
              >
                {t.label}
              </button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 w-7 shrink-0 p-0"
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(t.id);
                }}
                aria-label={`Close ${t.label}`}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
        <div className="min-h-0 flex-1">
          {activeTab ? (
            <EmbedSiteFrame
              key={`${activeTab.id}-${activeTab.url}`}
              src={activeTab.url}
              title={activeTab.label}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Open a tab to browse.
            </div>
          )}
        </div>
      </div>
    </WindowPanel>
  );
}
