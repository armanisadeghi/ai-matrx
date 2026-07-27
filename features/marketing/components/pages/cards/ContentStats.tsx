"use client";

import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  FileCode2,
  FileText,
  ImageIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { MarketingPage, PageSnapshot } from "@/features/marketing/types";
import { useOpenFilePreviewWindow } from "@/features/overlays/openers/filePreviewWindow";
import { marketingPageManifest } from "@/features/surfaces/manifests/marketing-page.manifest";
import { surfaceValueLabels } from "@/features/surfaces/utils/surface-display";
import {
  parseSnapshotExtracted,
  parseSnapshotImages,
  parseSnapshotLinksSummary,
  type ParsedSnapshotImage,
} from "@/features/marketing/lib/snapshot-content";
import {
  CondensedFieldGrid,
  formatDate,
} from "@/features/marketing/components/shared/MarketingUi";
import { DesiredSection } from "@/features/marketing/components/pages/desired/DesiredSection";
import { useDesiredValueSlice } from "@/features/marketing/components/pages/desired/useDesiredValueSlice";

// THE NAMING LAW: canonical labels for every declared surface value + group —
// section titles and field labels below render these byte-identically.
const L = surfaceValueLabels(marketingPageManifest);

/** Last path segment of the image src — enough to recognize the asset. */
function srcTail(src: string): string {
  const withoutQuery = src.split(/[?#]/)[0] ?? src;
  const segments = withoutQuery.split("/").filter(Boolean);
  return segments.length > 0 ? segments[segments.length - 1]! : src;
}

export function ContentStats({
  snapshot,
  page,
}: {
  snapshot: PageSnapshot;
  page: MarketingPage;
}) {
  const openFilePreview = useOpenFilePreviewWindow();
  const extracted = parseSnapshotExtracted(snapshot.extracted);
  const links = parseSnapshotLinksSummary(snapshot.links_summary);
  const images = parseSnapshotImages(snapshot.images);
  const [imagesExpanded, setImagesExpanded] = useState(false);
  return (
    <div className="p-3">
      <CondensedFieldGrid
        fields={[
          {
            label: L.word_count,
            value: snapshot.word_count?.toLocaleString() ?? "—",
          },
          {
            label: "Sentences",
            value: extracted.sentenceCount?.toLocaleString() ?? "—",
          },
          {
            label: "Flesch reading ease",
            value:
              extracted.fleschReadingEase === null
                ? "—"
                : extracted.fleschReadingEase.toFixed(1),
            tone:
              extracted.fleschReadingEase !== null &&
              extracted.fleschReadingEase < 30
                ? "warning"
                : "default",
          },
          {
            label: "Links",
            value:
              links.total === null
                ? "—"
                : `${links.total.toLocaleString()} (${links.internal ?? 0} internal · ${links.external ?? 0} external)`,
          },
          {
            label: "Images",
            value:
              images.count === null
                ? "—"
                : `${images.count.toLocaleString()}${images.missingAlt ? ` · ${images.missingAlt} missing alt` : ""}`,
            tone: images.missingAlt ? "warning" : "default",
          },
          { label: L.snapshot_captured_at, value: formatDate(snapshot.captured_at) },
        ]}
      />
      {images.items.length > 0 ? (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setImagesExpanded((v) => !v)}
            className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            {imagesExpanded ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
            <ImageIcon className="h-3 w-3" />
            {images.items.length} image{images.items.length === 1 ? "" : "s"} on
            this page
          </button>
          {imagesExpanded ? (
            <SnapshotImageList items={images.items} page={page} />
          ) : null}
        </div>
      ) : images.count !== null && images.count > 0 ? (
        <p className="mt-2 text-[10px] text-muted-foreground">
          Per-image inventory not available — the crawler doesn't persist it
          yet.
        </p>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        {snapshot.body_file_id ? (
          <Button
            variant="outline"
            size="sm"
            className="h-7"
            onClick={() => openFilePreview({ fileId: snapshot.body_file_id })}
          >
            <FileCode2 className="mr-1.5 h-3.5 w-3.5" />
            Captured HTML
          </Button>
        ) : null}
        {snapshot.markdown_file_id ? (
          <Button
            variant="outline"
            size="sm"
            className="h-7"
            onClick={() =>
              openFilePreview({ fileId: snapshot.markdown_file_id })
            }
          >
            <FileText className="mr-1.5 h-3.5 w-3.5" />
            Extracted Markdown
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Compact per-image inventory with desired-alt editing. Desired alts save
 * through the shared desired-slice pattern (`desired_values.image_alts`,
 * keyed by the image `src`), same contract as every other desired card.
 */
function SnapshotImageList({
  items,
  page,
}: {
  items: ParsedSnapshotImage[];
  page: MarketingPage;
}) {
  const desired = useDesiredValueSlice(page, "image_alts");
  const draft = desired.draft ?? {};

  const setDesiredAlt = (src: string, value: string) => {
    const next = { ...draft };
    if (value) {
      next[src] = value;
    } else {
      delete next[src];
    }
    desired.setDraft(Object.keys(next).length > 0 ? next : undefined);
  };

  return (
    <div className="mt-1.5 rounded-md border border-border/60">
      <DesiredSection
        hint="Alt text each existing image SHOULD carry, keyed by its src."
        dirty={desired.dirty}
        saving={desired.saving}
        onSave={() => void desired.save()}
        onReset={desired.reset}
        className="border-t-0"
      >
        <div className="max-h-64 overflow-y-auto divide-y divide-border/40 rounded-md border border-border/40">
          {items.map((item, index) => {
          const src = item.src ?? "";
          const missingAlt = item.alt === null || item.alt === "";
          const dims =
            item.width !== null && item.height !== null
              ? `${item.width}×${item.height}`
              : null;
          return (
            <div key={`${src}-${index}`} className="px-2 py-1.5 space-y-1">
              <div className="flex items-center gap-1.5 min-w-0">
                <span
                  className="truncate font-mono text-[10px] text-foreground"
                  title={src || undefined}
                >
                  {src ? srcTail(src) : "(no src)"}
                </span>
                {dims ? (
                  <span className="shrink-0 text-[10px] text-muted-foreground">
                    {dims}
                  </span>
                ) : null}
                {item.loading ? (
                  <span className="shrink-0 text-[10px] text-muted-foreground">
                    {item.loading}
                  </span>
                ) : null}
                {missingAlt ? (
                  <Badge
                    variant="outline"
                    className="shrink-0 h-4 px-1 text-[9px] border-amber-500/50 text-amber-600 dark:text-amber-400"
                  >
                    no alt
                  </Badge>
                ) : null}
              </div>
              {!missingAlt ? (
                <p
                  className="truncate text-[10px] text-muted-foreground"
                  title={item.alt ?? undefined}
                >
                  alt: {item.alt}
                </p>
              ) : null}
              {src ? (
                <Input
                  value={draft[src] ?? ""}
                  onChange={(event) => setDesiredAlt(src, event.target.value)}
                  placeholder={
                    missingAlt ? "Desired alt text" : "Desired alt (override)"
                  }
                  className={cn(
                    "h-6 text-[11px]",
                    missingAlt && !draft[src] && "border-amber-500/40",
                  )}
                />
              ) : null}
              </div>
            );
          })}
        </div>
      </DesiredSection>
    </div>
  );
}
