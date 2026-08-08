"use client";

/**
 * ResearchMediaView — the inspiration/reuse pool: every image the research
 * system captured for this organization, with its source page and topic.
 * Own-domain images can be promoted straight into the brand library;
 * third-party images are inspiration — open the source, or hand the look to
 * the Generate view as a creative brief.
 */

import { useMemo, useState } from "react";
import { ExternalLink, FolderPlus, Search, Sparkles } from "lucide-react";
import { toast } from "@/lib/toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useMarketingSite } from "@/features/marketing/components/site/MarketingSiteLayoutClient";
import {
  useCreateBrandAsset,
  useResearchImages,
} from "@/features/marketing/data/hooks";
import {
  LoadingSurface,
  QueryError,
} from "@/features/marketing/components/shared/MarketingUi";
import { MediaEmptyState } from "@/features/marketing/components/media/SnapshotMediaGallery";
import type { ResearchImageRow } from "@/features/marketing/data/media-library";

function hostnameOf(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

export function ResearchMediaView({
  brandId,
  onUseAsBrief,
}: {
  brandId: string;
  /** Hand this image to the Generate view as a creative brief. */
  onUseAsBrief: (image: ResearchImageRow) => void;
}) {
  const { site } = useMarketingSite();
  const images = useResearchImages(site.organization_id);
  const createAsset = useCreateBrandAsset();
  const [topicFilter, setTopicFilter] = useState("all");
  const [originFilter, setOriginFilter] = useState<"all" | "own" | "external">(
    "all",
  );
  const [search, setSearch] = useState("");
  const [promotingId, setPromotingId] = useState<string | null>(null);

  const siteHost = hostnameOf(site.root_url);
  const rows = useMemo(() => images.data ?? [], [images.data]);

  const topics = useMemo(() => {
    const byId = new Map<string, string>();
    for (const row of rows) {
      if (row.topicId) byId.set(row.topicId, row.topicName ?? "Untitled topic");
    }
    return [...byId.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);

  const isOwn = useMemo(() => {
    return (row: ResearchImageRow) => {
      if (!siteHost) return false;
      const sourceHost = (row.sourceHostname ?? "").replace(/^www\./, "");
      const imageHost = hostnameOf(row.url);
      return sourceHost === siteHost || imageHost === siteHost;
    };
  }, [siteHost]);

  const filtered = useMemo(() => {
    let items = rows;
    if (topicFilter !== "all") {
      items = items.filter((row) => row.topicId === topicFilter);
    }
    if (originFilter !== "all") {
      items = items.filter((row) =>
        originFilter === "own" ? isOwn(row) : !isOwn(row),
      );
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      items = items.filter(
        (row) =>
          row.url.toLowerCase().includes(q) ||
          (row.alt ?? "").toLowerCase().includes(q) ||
          (row.caption ?? "").toLowerCase().includes(q) ||
          (row.sourceHostname ?? "").toLowerCase().includes(q),
      );
    }
    return items;
  }, [rows, topicFilter, originFilter, search, isOwn]);

  const promote = async (row: ResearchImageRow) => {
    setPromotingId(row.id);
    try {
      await createAsset.mutateAsync({
        organizationId: site.organization_id,
        brandId,
        kind: "image",
        sourceUrl: row.url,
        title: row.alt || row.caption || null,
        notes: row.sourceUrl
          ? `Promoted from research (${row.topicName ?? "topic"}) — source: ${row.sourceUrl}`
          : `Promoted from research (${row.topicName ?? "topic"}).`,
        isPrimary: false,
        source: "research",
      });
      toast.success("Added to the brand library");
    } catch (error) {
      toast.error("Could not add to the library", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setPromotingId(null);
    }
  };

  if (images.isLoading) {
    return <LoadingSurface label="Loading research images…" />;
  }
  if (images.isError) {
    return (
      <QueryError error={images.error} onRetry={() => void images.refetch()} />
    );
  }

  if (rows.length === 0) {
    return (
      <MediaEmptyState
        title="No research images for this organization yet"
        detail="Run a research topic — every image its sources carry lands here as inspiration and reuse material."
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 basis-48">
          <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search alt, caption, host…"
            className="h-7 w-full rounded-md border border-border bg-card pl-7 pr-2 text-[11px] text-foreground outline-none placeholder:text-muted-foreground max-md:text-base"
          />
        </div>
        <Select value={topicFilter} onValueChange={setTopicFilter}>
          <SelectTrigger className="h-7 w-[12rem] px-2 text-[11px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="text-[11px]">
            <SelectItem value="all">All topics</SelectItem>
            {topics.map(([id, name]) => (
              <SelectItem key={id} value={id}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={originFilter}
          onValueChange={(value) =>
            setOriginFilter(value as "all" | "own" | "external")
          }
        >
          <SelectTrigger className="h-7 w-[9rem] px-2 text-[11px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="text-[11px]">
            <SelectItem value="all">Any origin</SelectItem>
            <SelectItem value="own">This site&apos;s domain</SelectItem>
            <SelectItem value="external">External (inspiration)</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-[10px] tabular-nums text-muted-foreground">
          {filtered.length}/{rows.length}
        </span>
      </div>

      <p className="px-1 text-[10px] text-muted-foreground/70">
        Images from this site&apos;s own domain can be reused directly.
        External images are competitor/reference material — use them as
        inspiration for a generated original, never verbatim.
      </p>

      {filtered.length === 0 ? (
        <MediaEmptyState
          title="No research images matched the current filters"
          detail="Clear the topic/origin filters or the search to see the full pool."
        />
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {filtered.map((row) => {
            const own = isOwn(row);
            return (
              <div
                key={row.id}
                className="group flex flex-col overflow-hidden rounded-lg border border-border bg-card"
              >
                <div className="flex aspect-[4/3] items-center justify-center overflow-hidden bg-muted/40">
                  {/* Third-party research asset — external URL, no file_id. */}
                  <img
                    src={row.thumbnailUrl || row.url}
                    alt={row.alt ?? ""}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                </div>
                <div className="space-y-0.5 p-1.5">
                  <div className="flex items-center gap-1">
                    <Badge
                      variant="outline"
                      className={
                        own
                          ? "h-4 border-emerald-500/50 px-1 text-[9px] text-emerald-600 dark:text-emerald-400"
                          : "h-4 px-1 text-[9px]"
                      }
                    >
                      {own ? "own domain" : (row.sourceHostname ?? "external")}
                    </Badge>
                    {row.width && row.height ? (
                      <span className="text-[9px] tabular-nums text-muted-foreground/70">
                        {row.width}×{row.height}
                      </span>
                    ) : null}
                  </div>
                  {row.alt || row.caption ? (
                    <p
                      className="truncate text-[10px] text-muted-foreground"
                      title={row.alt ?? row.caption ?? undefined}
                    >
                      {row.alt ?? row.caption}
                    </p>
                  ) : null}
                  {row.topicName ? (
                    <p className="truncate text-[9px] text-muted-foreground/70">
                      {row.topicName}
                    </p>
                  ) : null}
                  <div className="flex items-center gap-0.5 pt-0.5">
                    {row.sourceUrl ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-1.5 text-[10px]"
                        asChild
                      >
                        <a
                          href={row.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Open the source page"
                        >
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </Button>
                    ) : null}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-1.5 text-[10px]"
                      title="Use as a creative brief in Generate"
                      onClick={() => onUseAsBrief(row)}
                    >
                      <Sparkles className="h-3 w-3" />
                    </Button>
                    {own ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-1.5 text-[10px]"
                        disabled={promotingId === row.id}
                        title="Add to the brand library"
                        onClick={() => void promote(row)}
                      >
                        <FolderPlus className="h-3 w-3" />
                      </Button>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
