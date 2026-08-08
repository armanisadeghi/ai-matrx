"use client";

/**
 * StockSourcesView — the licensed-free supply channel for the site Media
 * workspace, two halves:
 *
 *  1. Brand portals — the brand's official press-kit / media-portal URLs
 *     (`web.brand_asset` kind `portal`), the places we're licensed to pull
 *     approved imagery from. They also appear in the Library view.
 *  2. Stock search — free licensed imagery (Unsplash today), searched via
 *     the canonical `/api/unsplash` proxy (`unsplashClient`), saved into
 *     the brand library with one click. Saves are DURABLE: bytes are
 *     ingested through the canonical file handler (`useFileUpload` with an
 *     `external_url` source) so the asset gets a `file_id`; if the byte
 *     fetch fails we fall back to the permanent Unsplash CDN URL. Every
 *     save records attribution in `notes` and fires the Unsplash
 *     `photos.trackDownload` guideline event.
 */

import { useState } from "react";
import type { Basic as UnsplashBasicPhoto } from "unsplash-js/dist/methods/photos/types";
import {
  ExternalLink,
  FolderPlus,
  Globe,
  Loader2,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { unsplashClient } from "@/hooks/images/unsplashClient";
import { useFileUpload } from "@/features/files/handler/hooks/useFileUpload";
import {
  useBrandAssets,
  useCreateBrandAsset,
  useDeleteBrandAsset,
} from "@/features/marketing/data/hooks";
import {
  LoadingSurface,
  QueryError,
} from "@/features/marketing/components/shared/MarketingUi";
import { MediaEmptyState } from "@/features/marketing/components/media/SnapshotMediaGallery";
import type { BrandAsset } from "@/features/marketing/types";

const STOCK_PAGE_SIZE = 24;

type StockOrientation = "any" | "landscape" | "portrait" | "squarish";

function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function attributionNotes(photo: UnsplashBasicPhoto): string {
  const photographer = photo.user?.name ?? "Unknown photographer";
  const photographerUrl = photo.user?.links?.html;
  return [
    `Unsplash photo by ${photographer}${photographerUrl ? ` (${photographerUrl})` : ""}`,
    `— ${photo.links.html}.`,
    "Unsplash License: free for commercial and personal use, no attribution required.",
  ].join(" ");
}

function BrandPortalsPanel({
  brandId,
  organizationId,
}: {
  brandId: string;
  organizationId: string;
}) {
  const assetsQuery = useBrandAssets(brandId);
  const createAsset = useCreateBrandAsset();
  const deleteAsset = useDeleteBrandAsset();
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");

  const portals = (assetsQuery.data ?? []).filter(
    (asset) => asset.kind === "portal",
  );

  const addPortal = async () => {
    const trimmedUrl = url.trim();
    if (!trimmedUrl) return;
    const withProtocol = /^https?:\/\//i.test(trimmedUrl)
      ? trimmedUrl
      : `https://${trimmedUrl}`;
    if (!hostnameOf(withProtocol)) {
      toast.error("That doesn't look like a valid URL");
      return;
    }
    try {
      await createAsset.mutateAsync({
        organizationId,
        brandId,
        kind: "portal",
        sourceUrl: withProtocol,
        title: title.trim() || hostnameOf(withProtocol),
        notes: null,
        isPrimary: false,
        source: "manual",
      });
      toast.success("Portal added");
      setTitle("");
      setUrl("");
      setAdding(false);
    } catch (error) {
      toast.error("Could not add the portal", {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  };

  const removePortal = async (asset: BrandAsset) => {
    const confirmed = await confirm({
      title: "Remove this portal link?",
      description: asset.title ?? asset.source_url ?? "Brand portal",
      confirmLabel: "Remove",
      variant: "destructive",
    });
    if (!confirmed) return;
    try {
      await deleteAsset.mutateAsync(asset.id);
      toast.success("Portal removed");
    } catch (error) {
      toast.error("Could not remove the portal", {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  };

  return (
    <section className="space-y-2 rounded-lg border border-border bg-card p-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5">
          <Globe className="h-3.5 w-3.5 text-foreground/60" />
          <h3 className="text-[11px] font-semibold text-foreground">
            Brand portals
          </h3>
          <span className="text-[10px] tabular-nums text-muted-foreground">
            {portals.length}
          </span>
        </div>
        <p className="min-w-0 flex-1 basis-64 text-[10px] text-muted-foreground/70">
          Official press kits and media portals this brand is licensed to pull
          approved imagery from. Portals also appear in the Library view.
        </p>
        <Button
          size="sm"
          variant="outline"
          className="h-6 px-2 text-[10px]"
          onClick={() => setAdding((prev) => !prev)}
        >
          <Plus className="mr-1 h-3 w-3" />
          Add portal
        </Button>
      </div>

      {adding ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Label (e.g. Press kit)"
            className="h-7 w-40 rounded-md border border-border bg-background px-2 text-[11px] text-foreground outline-none placeholder:text-muted-foreground max-md:text-base"
          />
          <input
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void addPortal();
            }}
            placeholder="https://brand.com/press"
            className="h-7 min-w-0 flex-1 basis-56 rounded-md border border-border bg-background px-2 text-[11px] text-foreground outline-none placeholder:text-muted-foreground max-md:text-base"
          />
          <Button
            size="sm"
            className="h-7 text-[11px]"
            disabled={createAsset.isPending || !url.trim()}
            onClick={() => void addPortal()}
          >
            {createAsset.isPending ? (
              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            ) : null}
            Save
          </Button>
        </div>
      ) : null}

      {portals.length === 0 && !adding ? (
        <p className="text-[10px] text-muted-foreground">
          No portals yet — add the brand&apos;s press kit, asset portal, or
          partner media library.
        </p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {portals.map((portal) => (
            <div
              key={portal.id}
              className="group flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1"
            >
              <a
                href={portal.source_url ?? undefined}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-[11px] text-foreground hover:text-primary"
                title={portal.source_url ?? undefined}
              >
                <ExternalLink className="h-3 w-3 text-muted-foreground" />
                <span className="max-w-48 truncate">
                  {portal.title ||
                    (portal.source_url ? hostnameOf(portal.source_url) : null) ||
                    "Portal"}
                </span>
              </a>
              <button
                type="button"
                onClick={() => void removePortal(portal)}
                disabled={deleteAsset.isPending}
                title="Remove portal"
                className="rounded p-0.5 text-muted-foreground/60 transition-colors hover:text-destructive"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export function StockSourcesView({
  brandId,
  organizationId,
}: {
  brandId: string;
  organizationId: string;
}) {
  const assetsQuery = useBrandAssets(brandId);
  const createAsset = useCreateBrandAsset();
  const { upload } = useFileUpload();

  const [query, setQuery] = useState("");
  const [orientation, setOrientation] = useState<StockOrientation>("any");
  const [photos, setPhotos] = useState<UnsplashBasicPhoto[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());

  const runSearch = async (nextPage: number) => {
    const q = query.trim();
    if (!q || searching) return;
    setSearching(true);
    try {
      const result = await unsplashClient.search.getPhotos({
        query: q,
        page: nextPage,
        perPage: STOCK_PAGE_SIZE,
        ...(orientation !== "any" ? { orientation } : {}),
      });
      if (result.type !== "success") {
        toast.error("Stock search failed", {
          description: result.errors.join("; "),
        });
        return;
      }
      setPhotos((prev) =>
        nextPage === 1 ? result.response.results : [...prev, ...result.response.results],
      );
      setPage(nextPage);
      setTotalPages(result.response.total_pages);
      setSearched(true);
    } finally {
      setSearching(false);
    }
  };

  const saveToLibrary = async (photo: UnsplashBasicPhoto) => {
    if (savingId) return;
    setSavingId(photo.id);
    const title =
      photo.description?.trim() || photo.alt_description?.trim() || null;
    const notes = attributionNotes(photo);
    try {
      // Unsplash API guideline: a save is a "download" — report it. Non-fatal
      // if it fails, but never silent.
      void unsplashClient.photos
        .trackDownload({ downloadLocation: photo.links.download_location })
        .then((result) => {
          if (result.type === "error") {
            console.warn(
              "[StockSourcesView] Unsplash trackDownload failed:",
              result.errors,
            );
          }
        });

      let fileId: string | null = null;
      try {
        const uploaded = await upload(
          { kind: "external_url", url: photo.urls.full },
          {
            folderPath: "Images/Brand Library/Stock",
            fileName: `unsplash-${photo.id}.jpg`,
            metadata: {
              stockSource: "unsplash",
              stockSourceId: photo.id,
              stockPageUrl: photo.links.html,
              photographerName: photo.user?.name ?? null,
              photographerUrl: photo.user?.links?.html ?? null,
            },
          },
        );
        fileId = uploaded.fileId;
      } catch (uploadError) {
        // Byte ingest failed (network/CORS) — fall back to the permanent
        // Unsplash CDN URL. Public, non-expiring, still a legitimate ref.
        console.warn(
          "[StockSourcesView] Durable ingest failed, saving CDN URL instead:",
          uploadError,
        );
      }

      await createAsset.mutateAsync({
        organizationId,
        brandId,
        kind: "image",
        sourceUrl: fileId ? null : photo.urls.regular,
        fileId,
        title,
        notes,
        isPrimary: false,
        source: "stock",
      });
      setSavedIds((prev) => new Set(prev).add(photo.id));
      toast.success(
        fileId
          ? "Saved to the brand library"
          : "Saved to the library (linked to the Unsplash CDN)",
      );
    } catch (error) {
      toast.error("Could not save to the library", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setSavingId(null);
    }
  };

  if (assetsQuery.isLoading) {
    return <LoadingSurface label="Loading sources…" />;
  }
  if (assetsQuery.isError) {
    return (
      <QueryError
        error={assetsQuery.error}
        onRetry={() => void assetsQuery.refetch()}
      />
    );
  }

  return (
    <div className="space-y-3">
      <BrandPortalsPanel brandId={brandId} organizationId={organizationId} />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 basis-48">
          <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void runSearch(1);
            }}
            placeholder="Search free stock imagery (Unsplash)…"
            className="h-7 w-full rounded-md border border-border bg-card pl-7 pr-2 text-[11px] text-foreground outline-none placeholder:text-muted-foreground max-md:text-base"
          />
        </div>
        <Select
          value={orientation}
          onValueChange={(value) => setOrientation(value as StockOrientation)}
        >
          <SelectTrigger className="h-7 w-[8.5rem] px-2 text-[11px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="text-[11px]">
            <SelectItem value="any">Any orientation</SelectItem>
            <SelectItem value="landscape">Landscape</SelectItem>
            <SelectItem value="portrait">Portrait</SelectItem>
            <SelectItem value="squarish">Square</SelectItem>
          </SelectContent>
        </Select>
        <Button
          size="sm"
          className="h-7 text-[11px]"
          disabled={searching || !query.trim()}
          onClick={() => void runSearch(1)}
        >
          {searching && page === 1 ? (
            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
          ) : null}
          Search
        </Button>
      </div>

      <p className="px-1 text-[10px] text-muted-foreground/70">
        All results are free for commercial use under the Unsplash License.
        Saving ingests the file into the brand library with photographer
        attribution recorded on the asset.
      </p>

      {!searched ? (
        <MediaEmptyState
          title="Search licensed-free stock imagery"
          detail="Find photography for this brand and save it straight into the library — attribution and provenance are recorded automatically."
        />
      ) : photos.length === 0 ? (
        <MediaEmptyState
          title="No results for that search"
          detail="Try broader terms, or a different orientation."
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {photos.map((photo) => {
              const saved = savedIds.has(photo.id);
              return (
                <div
                  key={photo.id}
                  className="group flex flex-col overflow-hidden rounded-lg border border-border bg-card"
                >
                  <div className="flex aspect-[4/3] items-center justify-center overflow-hidden bg-muted/40">
                    {/* Stock result — remote Unsplash CDN URL, no file_id yet. */}
                    <img
                      src={photo.urls.small}
                      alt={photo.alt_description ?? ""}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  </div>
                  <div className="space-y-0.5 p-1.5">
                    <p
                      className="truncate text-[10px] text-muted-foreground"
                      title={
                        photo.description ?? photo.alt_description ?? undefined
                      }
                    >
                      {photo.description ||
                        photo.alt_description ||
                        "Untitled photo"}
                    </p>
                    <div className="flex items-center justify-between gap-1">
                      <a
                        href={photo.user?.links?.html ?? photo.links.html}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="truncate text-[9px] text-muted-foreground/70 hover:text-primary"
                        title="Photographer profile on Unsplash"
                      >
                        {photo.user?.name ?? "Unsplash"}
                      </a>
                      <span className="shrink-0 text-[9px] tabular-nums text-muted-foreground/70">
                        {photo.width}×{photo.height}
                      </span>
                    </div>
                    <div className="flex items-center gap-0.5 pt-0.5">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-1.5 text-[10px]"
                        asChild
                      >
                        <a
                          href={photo.links.html}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Open on Unsplash"
                        >
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-1.5 text-[10px]"
                        disabled={savingId !== null || saved}
                        title={
                          saved
                            ? "Already saved to the library"
                            : "Save to the brand library"
                        }
                        onClick={() => void saveToLibrary(photo)}
                      >
                        {savingId === photo.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <FolderPlus
                            className={
                              saved ? "h-3 w-3 text-emerald-500" : "h-3 w-3"
                            }
                          />
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          {page < totalPages ? (
            <div className="flex justify-center">
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-[11px]"
                disabled={searching}
                onClick={() => void runSearch(page + 1)}
              >
                {searching ? (
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                ) : null}
                Load more
              </Button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
