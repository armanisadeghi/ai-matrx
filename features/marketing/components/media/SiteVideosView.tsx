"use client";

/**
 * SiteVideosView — the video pillar of the site Media workspace:
 *
 *  - CRAWLED: every real video/embed observed across canonical pages
 *    (YouTube/Vimeo/direct files, deduped by provider+id via
 *    lib/snapshot-video.ts — tracking iframes excluded), promotable to the
 *    brand library as `web.brand_asset` kind `video`.
 *  - LIBRARY: the brand's OWNED video assets (uploaded files render through
 *    InlineMediaRef; promoted embeds keep their provider poster).
 *
 * ONE agent flow ships with this view: "Write metadata" runs the Marketing
 * Video Metadata Writer headlessly (lib/generate-video-metadata.ts) and
 * persists title / description / keywords / schema.org VideoObject onto the
 * asset row (`data.video_metadata`). Promo-clip GENERATION is a registered
 * Coming Soon promise (`marketing.generate-video`), not a stub.
 *
 * Third-party crawl posters render via plain `<img loading="lazy">` — the
 * documented exception for external assets with no file_id.
 */

import { useMemo, useState } from "react";
import {
  Clapperboard,
  ExternalLink,
  FileVideo,
  Film,
  FolderPlus,
  Loader2,
  Tags,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAppDispatch } from "@/lib/redux/hooks";
import { InlineMediaRef } from "@/features/files/components/inline/InlineMediaRef";
import { VideoPublishDate } from "@/features/files/blocks/video/VideoPublishDate";
import { announceComingSoon } from "@/lib/coming-soon/announce";
import { useMarketingSite } from "@/features/marketing/components/site/MarketingSiteLayoutClient";
import { MediaEmptyState } from "@/features/marketing/components/media/SnapshotMediaGallery";
import {
  LoadingSurface,
  QueryError,
} from "@/features/marketing/components/shared/MarketingUi";
import {
  useBrandAssets,
  useCreateBrandAsset,
  useSiteVideos,
  useUpdateBrandAsset,
} from "@/features/marketing/data/hooks";
import { youTubeThumbnail, youtubeId } from "@/lib/media/youtube";
import { generateVideoMetadata } from "@/features/marketing/lib/generate-video-metadata";
import { MARKETING_SITE_SURFACE_NAME } from "@/features/marketing/lib/scopes/site-surface-base";
import type { SiteVideoAsset } from "@/features/marketing/lib/snapshot-video";
import type { SiteMediaStandards } from "@/features/marketing/data/media-library";
import { isJsonRecord, type BrandAsset } from "@/features/marketing/types";
import type { Json } from "@/types/database.types";
import { videoPublishDateFromMetadata } from "@/lib/media/video-date";
import { useYouTubeVideoIdentityIndex } from "@/features/research/hooks/useResearchState";

const PROVIDER_LABELS: Record<SiteVideoAsset["provider"], string> = {
  youtube: "YouTube",
  vimeo: "Vimeo",
  file: "Video file",
  embed: "Embed",
};

function assetHasMetadata(asset: BrandAsset): boolean {
  return isJsonRecord(asset.data) && isJsonRecord(asset.data.video_metadata);
}

/** Poster for a library video that came from a provider URL (no file_id). */
function libraryPosterUrl(asset: BrandAsset): string | null {
  if (!asset.source_url) return null;
  const yt = youtubeId(asset.source_url);
  return yt ? youTubeThumbnail(yt) : null;
}

function pagesLabel(video: SiteVideoAsset): string {
  const paths = video.pages
    .slice(0, 3)
    .map((page) => page.path ?? page.url)
    .join(", ");
  return video.pages.length > 3
    ? `${paths} +${video.pages.length - 3} more`
    : paths;
}

export function SiteVideosView({
  brandId,
  standards,
}: {
  brandId: string;
  standards: SiteMediaStandards;
}) {
  const dispatch = useAppDispatch();
  const { site } = useMarketingSite();
  const videosQuery = useSiteVideos(site.id);
  const assetsQuery = useBrandAssets(brandId);
  const createAsset = useCreateBrandAsset();
  const updateAsset = useUpdateBrandAsset();
  /** Key of the crawled video / asset id currently running the metadata agent. */
  const [metadataBusy, setMetadataBusy] = useState<string | null>(null);
  const [addingKey, setAddingKey] = useState<string | null>(null);

  const libraryVideos = useMemo(
    () => (assetsQuery.data ?? []).filter((asset) => asset.kind === "video"),
    [assetsQuery.data],
  );
  const youtubeVideoIds = [
    ...(videosQuery.data ?? []).flatMap((video) =>
      video.provider === "youtube" && video.videoId ? [video.videoId] : [],
    ),
    ...libraryVideos.flatMap((asset) => {
      const id = asset.source_url ? youtubeId(asset.source_url) : null;
      return id ? [id] : [];
    }),
  ];
  const { identityForId: youtubeIdentityForId } =
    useYouTubeVideoIdentityIndex(youtubeVideoIds);

  /** Crawled videos already promoted (matched on source_url). */
  const librarySourceUrls = useMemo(
    () =>
      new Set(
        libraryVideos.flatMap((asset) =>
          asset.source_url ? [asset.source_url] : [],
        ),
      ),
    [libraryVideos],
  );

  const siteContext = [
    `Site: ${site.name} — ${site.root_url}.`,
    standards.notes ? `Site media standards notes: ${standards.notes}` : null,
  ]
    .filter(Boolean)
    .join(" ");

  const crawledVideoContext = (video: SiteVideoAsset): string =>
    [
      `${PROVIDER_LABELS[video.provider]} video: ${video.url}.`,
      video.videoId ? `Provider video id: ${video.videoId}.` : null,
      video.mimeType ? `Mime type: ${video.mimeType}.` : null,
      `Embedded on: ${pagesLabel(video)}.`,
      `Found as a crawled ${video.tag ?? video.kind} on the site's own pages.`,
    ]
      .filter(Boolean)
      .join(" ");

  const assetVideoContext = (asset: BrandAsset): string =>
    [
      asset.source_url
        ? `Video URL: ${asset.source_url}.`
        : "An uploaded video file owned by the brand (no external URL).",
      asset.title ? `Existing title: ${asset.title}.` : null,
      asset.notes ? `Existing notes: ${asset.notes}.` : null,
      `Library source: ${asset.source}.`,
    ]
      .filter(Boolean)
      .join(" ");

  /** Persist an agent metadata result onto an existing asset row. */
  const saveMetadata = async (
    asset: BrandAsset,
    videoContext: string,
  ): Promise<void> => {
    const outcome = await dispatch(
      generateVideoMetadata({
        videoContext,
        siteContext,
        surfaceKey: MARKETING_SITE_SURFACE_NAME,
      }),
    );
    if (!outcome.ok) {
      toast.error("Metadata generation failed", {
        description: outcome.message,
      });
      return;
    }
    const existingData = isJsonRecord(asset.data) ? asset.data : {};
    const metadata = outcome.metadata;
    const videoMetadata: { [key: string]: Json } = {
      title: metadata.title,
      description: metadata.description,
      keywords: metadata.keywords,
      schema_org: metadata.schemaOrg,
      generated_at: new Date().toISOString(),
    };
    await updateAsset.mutateAsync({
      assetId: asset.id,
      expectedVersion: asset.version,
      patch: {
        title: metadata.title,
        notes: metadata.description,
        data: { ...existingData, video_metadata: videoMetadata },
      },
    });
    toast.success("Video metadata written", {
      description: metadata.title,
    });
  };

  const writeAssetMetadata = async (asset: BrandAsset) => {
    setMetadataBusy(asset.id);
    try {
      await saveMetadata(asset, assetVideoContext(asset));
    } catch (error) {
      toast.error("Could not save the metadata", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setMetadataBusy(null);
    }
  };

  const promoteToLibrary = async (
    video: SiteVideoAsset,
  ): Promise<BrandAsset | null> => {
    try {
      return await createAsset.mutateAsync({
        organizationId: site.organization_id,
        brandId,
        kind: "video",
        sourceUrl: video.url,
        title: null,
        notes: null,
        isPrimary: false,
        source: "discovered",
      });
    } catch (error) {
      toast.error("Could not add the video to the library", {
        description: error instanceof Error ? error.message : undefined,
      });
      return null;
    }
  };

  const addCrawled = async (video: SiteVideoAsset) => {
    setAddingKey(video.key);
    try {
      const asset = await promoteToLibrary(video);
      if (asset) toast.success("Video added to the brand library");
    } finally {
      setAddingKey(null);
    }
  };

  const writeCrawledMetadata = async (video: SiteVideoAsset) => {
    setMetadataBusy(video.key);
    try {
      // Metadata lives on a library row — promote first when needed.
      const existing = libraryVideos.find(
        (asset) => asset.source_url === video.url,
      );
      const asset = existing ?? (await promoteToLibrary(video));
      if (!asset) return;
      await saveMetadata(asset, crawledVideoContext(video));
    } catch (error) {
      toast.error("Could not save the metadata", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setMetadataBusy(null);
    }
  };

  if (videosQuery.isLoading || assetsQuery.isLoading) {
    return <LoadingSurface label="Loading the video inventory…" />;
  }
  if (videosQuery.isError) {
    return (
      <QueryError
        error={videosQuery.error}
        onRetry={() => void videosQuery.refetch()}
      />
    );
  }

  const crawled = videosQuery.data ?? [];
  const empty = crawled.length === 0 && libraryVideos.length === 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-[11px] text-muted-foreground">
          {`${crawled.length.toLocaleString()} crawled video${crawled.length === 1 ? "" : "s"} across canonical pages · ${libraryVideos.length.toLocaleString()} in the brand library.`}
        </p>
        <div className="ml-auto">
          <Button
            size="sm"
            variant="outline"
            className="h-7"
            onClick={() => void announceComingSoon("marketing.generate-video")}
          >
            <Clapperboard className="mr-1.5 h-3.5 w-3.5" />
            Generate promo clip
          </Button>
        </div>
      </div>

      {empty ? (
        <MediaEmptyState
          title="No videos yet"
          detail="Crawl the site to surface embedded videos, or upload video files in the Library view — both land here."
        />
      ) : null}

      {libraryVideos.length > 0 ? (
        <section className="space-y-2">
          <div className="flex items-baseline gap-2 px-1">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-foreground/70">
              Brand library
            </h3>
            <span className="text-[10px] tabular-nums text-muted-foreground">
              {libraryVideos.length}
            </span>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {libraryVideos.map((asset) => {
              const poster = libraryPosterUrl(asset);
              const libraryVideoId = asset.source_url
                ? youtubeId(asset.source_url)
                : null;
              const publishedAt =
                (libraryVideoId
                  ? youtubeIdentityForId(libraryVideoId)?.published_at
                  : null) ?? videoPublishDateFromMetadata(asset.data);
              const busy = metadataBusy === asset.id;
              // Locals (not `asset.x` inline) — the React Compiler lint taints
              // the whole base object when a member expression feeds a `ref` prop.
              const fileId = asset.file_id;
              const videoAlt = asset.title ?? "Brand video";
              return (
                <div
                  key={asset.id}
                  className="flex flex-col overflow-hidden rounded-lg border border-border bg-card"
                >
                  <div className="relative aspect-video bg-muted/40">
                    {fileId ? (
                      <InlineMediaRef
                        ref={fileId}
                        as="video"
                        size="fill"
                        fit="contain"
                        alt={videoAlt}
                        preload="metadata"
                      />
                    ) : poster ? (
                      // Third-party provider poster — documented <img> exception.
                      <img
                        src={poster}
                        alt={asset.title ?? "Video poster"}
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-muted-foreground">
                        <FileVideo className="h-6 w-6" />
                      </div>
                    )}
                    <VideoPublishDate
                      publishedAt={publishedAt}
                      className="pointer-events-none absolute bottom-1.5 left-1.5 rounded bg-black/75 px-1 py-0.5 text-white shadow-sm"
                    />
                  </div>
                  <div className="flex items-center gap-1.5 p-1.5">
                    <div className="min-w-0 flex-1">
                      <p
                        className="truncate text-[11px] font-medium text-foreground"
                        title={asset.title ?? undefined}
                      >
                        {asset.title || "Untitled video"}
                      </p>
                      <p className="truncate text-[9px] text-muted-foreground">
                        {asset.source}
                        {assetHasMetadata(asset) ? " · metadata written" : ""}
                      </p>
                    </div>
                    {assetHasMetadata(asset) ? (
                      <Badge
                        variant="outline"
                        className="h-4 shrink-0 px-1 text-[8px] text-emerald-600 dark:text-emerald-400"
                      >
                        <Tags className="mr-0.5 h-2.5 w-2.5" />
                        meta
                      </Badge>
                    ) : null}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 shrink-0 px-1.5 text-[10px]"
                      disabled={busy || updateAsset.isPending}
                      onClick={() => void writeAssetMetadata(asset)}
                      title="Run the metadata agent: title, description, keywords, schema.org VideoObject"
                    >
                      {busy ? (
                        <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                      ) : (
                        <Tags className="mr-1 h-3 w-3" />
                      )}
                      {assetHasMetadata(asset) ? "Rewrite" : "Write metadata"}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {crawled.length > 0 ? (
        <section className="space-y-2">
          <div className="flex items-baseline gap-2 px-1">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-foreground/70">
              Crawled videos &amp; embeds
            </h3>
            <span className="text-[10px] tabular-nums text-muted-foreground">
              {crawled.length}
            </span>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {crawled.map((video) => {
              const inLibrary = librarySourceUrls.has(video.url);
              const busy = metadataBusy === video.key;
              const adding = addingKey === video.key;
              const publishedAt =
                (video.videoId
                  ? youtubeIdentityForId(video.videoId)?.published_at
                  : null) ?? video.publishedAt;
              return (
                <div
                  key={video.key}
                  className="flex flex-col overflow-hidden rounded-lg border border-border bg-card"
                >
                  <div className="relative aspect-video bg-muted/40">
                    {video.posterUrl ? (
                      // Third-party provider poster — documented <img> exception.
                      <img
                        src={video.posterUrl}
                        alt=""
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    ) : video.provider === "file" ? (
                      <div className="flex h-full items-center justify-center text-muted-foreground">
                        <FileVideo className="h-6 w-6" />
                      </div>
                    ) : (
                      <div className="flex h-full items-center justify-center text-muted-foreground">
                        <Clapperboard className="h-6 w-6" />
                      </div>
                    )}
                    <Badge
                      variant="outline"
                      className="absolute left-1.5 top-1.5 h-4 bg-background/80 px-1 text-[8px] backdrop-blur-sm"
                    >
                      {PROVIDER_LABELS[video.provider]}
                    </Badge>
                    <VideoPublishDate
                      publishedAt={publishedAt}
                      className="pointer-events-none absolute bottom-1.5 left-1.5 rounded bg-black/75 px-1 py-0.5 text-white shadow-sm"
                    />
                  </div>
                  <div className="space-y-1 p-1.5">
                    <a
                      href={video.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex min-w-0 items-center gap-1 font-mono text-[10px] text-foreground hover:text-primary"
                      title={video.url}
                    >
                      <span className="truncate">{video.url}</span>
                      <ExternalLink className="h-2.5 w-2.5 shrink-0" />
                    </a>
                    <p
                      className="truncate text-[9px] text-muted-foreground"
                      title={pagesLabel(video)}
                    >
                      {`On ${video.pages.length} page${video.pages.length === 1 ? "" : "s"}: ${pagesLabel(video)}`}
                    </p>
                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-1.5 text-[10px]"
                        disabled={inLibrary || adding || createAsset.isPending}
                        onClick={() => void addCrawled(video)}
                        title={
                          inLibrary
                            ? "Already in the brand library"
                            : "Save this video as a brand library asset"
                        }
                      >
                        {adding ? (
                          <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                        ) : (
                          <FolderPlus className="mr-1 h-3 w-3" />
                        )}
                        {inLibrary ? "In library" : "Add to library"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-1.5 text-[10px]"
                        disabled={busy}
                        onClick={() => void writeCrawledMetadata(video)}
                        title="Run the metadata agent (adds the video to the library first when needed)"
                      >
                        {busy ? (
                          <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                        ) : (
                          <Tags className="mr-1 h-3 w-3" />
                        )}
                        Write metadata
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {crawled.length === 0 && libraryVideos.length > 0 ? (
        <p className="flex items-center gap-1.5 px-1 text-[10px] text-muted-foreground">
          <Film className="h-3 w-3" />
          No embedded videos found on the crawled pages.
        </p>
      ) : null}
    </div>
  );
}
