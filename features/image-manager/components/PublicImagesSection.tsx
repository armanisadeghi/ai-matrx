"use client";

/**
 * features/image-manager/components/PublicImagesSection.tsx
 *
 * Public Images surface for the Image Manager hub.
 *
 * Renders a small "Curated Covers" strip up top (sourced from
 * `features/canvas/social/preset-covers.ts`) so users have a one-click
 * way to drop a high-quality OG-ready cover into their selection without
 * spelunking through Unsplash search. The Unsplash search gallery sits
 * below — same component as before, no behaviour change.
 *
 * The curated strip is *theme-filterable* via a chip row. We default to
 * "All" so first-time users see the full catalog at a glance.
 */

import React, { useMemo, useState } from "react";
import { GalleryVertical, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  BottomSheet,
  BottomSheetBody,
  BottomSheetHeader,
} from "@/components/official/bottom-sheet/BottomSheet";
import { Button } from "@/components/ui/button";
import { ResponsiveGallery } from "@/components/image/ResponsiveGallery";
import { useSelectedImages } from "@/components/image/context/SelectedImagesProvider";
import {
  PRESET_COVERS,
  type PresetCover,
} from "@/features/canvas/social/preset-covers";
import { useBrowseAction } from "@/features/image-manager/browse/BrowseImageProvider";
import { OPEN_PUBLIC_SEARCH_FILTERS_EVENT } from "@/features/image-manager/mobileEvents";

type ThemeFilter = "all" | PresetCover["theme"];

const THEME_OPTIONS: { id: ThemeFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "study", label: "Study" },
  { id: "abstract", label: "Abstract" },
  { id: "nature", label: "Nature" },
  { id: "minimal", label: "Minimal" },
  { id: "creative", label: "Creative" },
];

export interface PublicImagesSectionProps {
  initialSearchTerm?: string;
}

export function PublicImagesSection({
  initialSearchTerm,
}: PublicImagesSectionProps) {
  const [theme, setTheme] = useState<ThemeFilter>("all");
  const [filterOpen, setFilterOpen] = useState(false);
  const { isSelected, toggleImage, selectionMode, clearImages, addImage } =
    useSelectedImages();
  const browse = useBrowseAction();

  const covers = useMemo(
    () =>
      theme === "all"
        ? PRESET_COVERS
        : PRESET_COVERS.filter((c) => c.theme === theme),
    [theme],
  );

  React.useEffect(() => {
    const handler = () => setFilterOpen(true);
    window.addEventListener(OPEN_PUBLIC_SEARCH_FILTERS_EVENT, handler);
    return () =>
      window.removeEventListener(OPEN_PUBLIC_SEARCH_FILTERS_EVENT, handler);
  }, []);

  const handleCoverClick = (cover: PresetCover) => {
    // Browse mode: open in floating viewer with the full filtered strip.
    if (selectionMode === "none") {
      const idx = covers.findIndex((c) => c.id === cover.id);
      browse({
        images: covers.map((c) => c.ogUrl),
        alts: covers.map((c) => c.label),
        initialIndex: Math.max(0, idx),
        title: cover.label,
      });
      return;
    }

    const sourceId = `preset:${cover.id}`;
    if (isSelected(sourceId)) {
      toggleImage({ type: "public", url: cover.ogUrl, id: sourceId });
      return;
    }
    if (selectionMode === "single") clearImages();
    addImage({
      type: "public",
      url: cover.ogUrl,
      id: sourceId,
      metadata: {
        title: cover.label,
        description: `Curated cover · ${cover.theme}`,
        thumbUrl: cover.thumbUrl,
      },
    });
  };

  return (
    <div className="h-full overflow-auto overscroll-contain">
      <section className="px-3 md:px-4 pt-3">
        <header className="mb-3 flex flex-wrap items-center gap-2 md:pr-8">
          <div className="flex items-center gap-4 pr-10">
            <GalleryVertical className="h-3.5 w-3.5 text-amber-500" />
            <h3 className="text-xs uppercase tracking-wide text-muted-foreground">
              Curated Covers
            </h3>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setFilterOpen(true)}
            className="ml-auto h-8 md:hidden"
          >
            <SlidersHorizontal className="mr-1.5 h-3.5 w-3.5" />
            {THEME_OPTIONS.find((opt) => opt.id === theme)?.label ?? "Theme"}
          </Button>
          <div className="ml-auto hidden flex-wrap gap-1 rounded-md border border-border/70 bg-card/45 p-0.5 md:flex">
            {THEME_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setTheme(opt.id)}
                className={cn(
                  "h-6 rounded px-2 text-[11px] font-medium transition-colors",
                  theme === opt.id
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </header>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
          {covers.map((cover) => {
            const sourceId = `preset:${cover.id}`;
            const selected = selectionMode !== "none" && isSelected(sourceId);
            return (
              <button
                key={cover.id}
                type="button"
                onClick={() => handleCoverClick(cover)}
                className={cn(
                  "group relative aspect-[16/9] overflow-hidden rounded-md border-2 transition-all bg-muted/40",
                  "hover:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/40",
                  selected
                    ? "border-primary ring-2 ring-primary/30"
                    : "border-transparent",
                )}
                title={`${cover.label} (${cover.theme})`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={cover.thumbUrl}
                  alt={cover.label}
                  className="absolute inset-0 h-full w-full object-cover"
                  loading="lazy"
                />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent text-white text-[11px] px-2 py-1 truncate">
                  {cover.label}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <section className="px-3 md:px-4 pt-3 pb-6">
        <ResponsiveGallery
          type="unsplash"
          initialSearchTerm={initialSearchTerm}
        />
      </section>

      <BottomSheet
        open={filterOpen}
        onOpenChange={setFilterOpen}
        title="Cover themes"
      >
        <BottomSheetHeader
          title="Cover themes"
          trailing={
            <button
              type="button"
              onClick={() => setFilterOpen(false)}
              className="min-h-[44px] px-1 text-[15px] text-primary active:opacity-70"
            >
              Done
            </button>
          }
        />
        <BottomSheetBody className="px-4 pb-5">
          <div className="overflow-hidden rounded-xl border border-border bg-card/60">
            {THEME_OPTIONS.map((opt, index) => {
              const active = theme === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => {
                    setTheme(opt.id);
                    setFilterOpen(false);
                  }}
                  className={cn(
                    "flex min-h-[48px] w-full items-center px-3 text-left",
                    index > 0 && "border-t border-border",
                    active ? "text-primary" : "text-foreground",
                  )}
                >
                  <span className="flex-1 text-[15px] font-medium">
                    {opt.label}
                  </span>
                  {active ? (
                    <span className="text-xs text-primary">Current</span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </BottomSheetBody>
      </BottomSheet>
    </div>
  );
}
