"use client";

import { useState } from "react";
import { BookMarked, Globe, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { SettingsSubHeader } from "@/components/official/settings/layout/SettingsSubHeader";
import { SettingsSection } from "@/components/official/settings/layout/SettingsSection";
import { SettingsCallout } from "@/components/official/settings/layout/SettingsCallout";
import { SettingsReadOnlyValue } from "@/components/official/settings/layout/SettingsReadOnlyValue";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  normalizeUserUrl,
  shortUrlLabel,
} from "@/features/window-panels/utils/embed-site-url";
import {
  SYSTEM_SITE_WORKBENCH_BOOKMARKS,
  SITE_WORKBENCH_USER_BOOKMARKS_MAX,
} from "@/features/window-panels/windows/iframe/site-workbench-bookmarks";
import type { SiteWorkbenchUserBookmark } from "@/lib/redux/preferences/userPreferencesSlice";
import { useSetting } from "../hooks/useSetting";

function newBookmarkId(): string {
  return globalThis.crypto.randomUUID();
}

export default function SiteWorkbenchTab() {
  const [userBookmarks, setUserBookmarks] = useSetting<
    SiteWorkbenchUserBookmark[]
  >("userPreferences.siteWorkbench.bookmarks");
  const [draftLabel, setDraftLabel] = useState("");
  const [draftUrl, setDraftUrl] = useState("");

  const addBookmark = () => {
    const url = normalizeUserUrl(draftUrl);
    if (!url) {
      toast.error("Enter a valid URL");
      return;
    }
    const label = draftLabel.trim() || shortUrlLabel(url);
    if (userBookmarks.some((bookmark) => bookmark.url === url)) {
      toast.message("That URL is already saved");
      return;
    }
    if (userBookmarks.length >= SITE_WORKBENCH_USER_BOOKMARKS_MAX) {
      toast.error(
        `You can save up to ${SITE_WORKBENCH_USER_BOOKMARKS_MAX} bookmarks`,
      );
      return;
    }
    setUserBookmarks([...userBookmarks, { id: newBookmarkId(), label, url }]);
    setDraftLabel("");
    setDraftUrl("");
  };

  const removeBookmark = (id: string) => {
    setUserBookmarks(userBookmarks.filter((bookmark) => bookmark.id !== id));
  };

  return (
    <>
      <SettingsSubHeader
        title="Site Workbench"
        description="Built-in shortcuts plus your own bookmarks for the embedded browser window."
        icon={Globe}
      />

      <SettingsCallout tone="info">
        Built-in bookmarks are shared for every user. Your bookmarks sync across
        devices and appear in the Site Workbench sidebar.
      </SettingsCallout>

      <SettingsSection title="Built-in bookmarks" icon={BookMarked}>
        {SYSTEM_SITE_WORKBENCH_BOOKMARKS.map((bookmark, index) => (
          <SettingsReadOnlyValue
            key={bookmark.id}
            label={bookmark.label}
            value={shortUrlLabel(bookmark.url)}
            last={index === SYSTEM_SITE_WORKBENCH_BOOKMARKS.length - 1}
          />
        ))}
      </SettingsSection>

      <SettingsSection title="Your bookmarks" icon={Plus}>
        <div className="flex flex-col gap-2 px-1 pb-2">
          <Input
            value={draftLabel}
            onChange={(e) => setDraftLabel(e.target.value)}
            placeholder="Label (optional)"
            className="h-9 text-base"
            style={{ fontSize: "16px" }}
          />
          <Input
            value={draftUrl}
            onChange={(e) => setDraftUrl(e.target.value)}
            placeholder="https://…"
            className="h-9 font-mono text-base"
            style={{ fontSize: "16px" }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addBookmark();
              }
            }}
          />
          <Button
            type="button"
            size="sm"
            className="self-start"
            onClick={addBookmark}
          >
            Add bookmark
          </Button>
        </div>

        {userBookmarks.length === 0 ? (
          <SettingsReadOnlyValue
            label="Saved bookmarks"
            value="None yet"
            last
          />
        ) : (
          userBookmarks.map((bookmark, index) => (
            <div
              key={bookmark.id}
              className="flex items-center justify-between gap-2 border-b border-border/60 px-1 py-2 last:border-b-0"
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">
                  {bookmark.label}
                </div>
                <div className="truncate font-mono text-xs text-muted-foreground">
                  {shortUrlLabel(bookmark.url)}
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="shrink-0"
                onClick={() => removeBookmark(bookmark.id)}
                aria-label={`Remove ${bookmark.label}`}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))
        )}

        <SettingsReadOnlyValue
          label="Limit"
          value={`${userBookmarks.length} / ${SITE_WORKBENCH_USER_BOOKMARKS_MAX}`}
          last
        />
      </SettingsSection>
    </>
  );
}
