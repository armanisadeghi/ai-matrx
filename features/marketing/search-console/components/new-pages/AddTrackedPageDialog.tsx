"use client";

/**
 * Add a page to the New Pages launch tracker: search the site's existing
 * canonical pages first; a URL that isn't registered yet is created through
 * the canonical `createManualPage` (never a second insert path) and then
 * tracked. The "I've requested indexing" checkbox stamps step 1 of the
 * workflow at add time.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Plus } from "lucide-react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { createManualPage } from "@/features/marketing/data/service";
import {
  searchSitePages,
  trackPage,
} from "@/features/marketing/search-console/data-launch";
import { parseLaunchTracking } from "@/features/marketing/search-console/lib/launch-tracking";

export function AddTrackedPageDialog({
  open,
  onOpenChange,
  siteId,
  organizationId,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  siteId: string;
  organizationId: string | null;
  onAdded: () => void;
}) {
  const [search, setSearch] = useState("");
  const [indexingRequested, setIndexingRequested] = useState(true);
  const [busy, setBusy] = useState(false);

  const results = useQuery({
    queryKey: ["marketing", "gsc", "launch-search", siteId, search],
    queryFn: ({ signal }) => searchSitePages(siteId, search, signal),
    enabled: open && search.trim().length >= 2,
    staleTime: 30 * 1000,
  });

  const finish = () => {
    onAdded();
    onOpenChange(false);
    setSearch("");
  };

  const trackExisting = async (pageId: string) => {
    setBusy(true);
    try {
      await trackPage(pageId, { indexingRequested });
      toast.success("Page is now tracked.");
      finish();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not track the page.",
      );
    } finally {
      setBusy(false);
    }
  };

  const createAndTrack = async () => {
    if (!organizationId) {
      toast.error("This site has no organization — cannot register pages.");
      return;
    }
    setBusy(true);
    try {
      const page = await createManualPage({
        siteId,
        organizationId,
        url: search.trim(),
      });
      await trackPage(page.id, { indexingRequested });
      toast.success("Page registered and tracked.");
      finish();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not register the page.",
      );
    } finally {
      setBusy(false);
    }
  };

  const searchLooksLikeUrl = /^https?:\/\/\S+\.\S+/.test(search.trim());
  const rows = results.data ?? [];
  const exactMatch = rows.some(
    (r) => r.url.replace(/\/$/, "") === search.trim().replace(/\/$/, ""),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Track a new page</DialogTitle>
          <DialogDescription>
            Step 1 of the launch workflow: add the page here, request indexing
            in Search Console, then watch for the first impression.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search site pages or paste a full URL…"
            className="h-8 text-xs"
            autoFocus
            aria-label="Page URL"
          />
          <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
            <Checkbox
              checked={indexingRequested}
              onCheckedChange={(v) => setIndexingRequested(v === true)}
            />
            I&apos;ve requested indexing for this page in GSC
          </label>

          {results.isFetching ? (
            <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Searching pages…
            </div>
          ) : rows.length > 0 ? (
            <div className="max-h-64 space-y-1 overflow-y-auto">
              {rows.map((row) => {
                const alreadyTracked =
                  parseLaunchTracking(row.launch_tracking) !== null;
                return (
                  <div
                    key={row.id}
                    className="flex items-center justify-between gap-2 rounded-md border border-border bg-card px-2 py-1"
                  >
                    <span
                      className="min-w-0 truncate text-xs text-foreground"
                      title={row.url}
                    >
                      {row.url}
                    </span>
                    {alreadyTracked ? (
                      <span className="shrink-0 text-[11px] text-muted-foreground">
                        Already tracked
                      </span>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 shrink-0 text-[11px]"
                        disabled={busy}
                        onClick={() => void trackExisting(row.id)}
                      >
                        Track
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          ) : search.trim().length >= 2 ? (
            <p className="py-1 text-xs text-muted-foreground">
              No registered pages match.
            </p>
          ) : null}

          {searchLooksLikeUrl && !exactMatch ? (
            <Button
              size="sm"
              className="h-7 w-full gap-1 text-xs"
              disabled={busy}
              onClick={() => void createAndTrack()}
            >
              {busy ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Plus className="h-3 w-3" />
              )}
              Register “{search.trim()}” and track it
            </Button>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
