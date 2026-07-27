"use client";

import { FileCode2, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PageSnapshot } from "@/features/marketing/types";
import { useOpenFilePreviewWindow } from "@/features/overlays/openers/filePreviewWindow";
import { marketingPageManifest } from "@/features/surfaces/manifests/marketing-page.manifest";
import { surfaceValueLabels } from "@/features/surfaces/utils/surface-display";
import {
  parseSnapshotExtracted,
  parseSnapshotImages,
  parseSnapshotLinksSummary,
} from "@/features/marketing/lib/snapshot-content";
import {
  CondensedFieldGrid,
  formatDate,
} from "@/features/marketing/components/shared/MarketingUi";

// THE NAMING LAW: canonical labels for every declared surface value + group —
// section titles and field labels below render these byte-identically.
const L = surfaceValueLabels(marketingPageManifest);

export function ContentStats({ snapshot }: { snapshot: PageSnapshot }) {
  const openFilePreview = useOpenFilePreviewWindow();
  const extracted = parseSnapshotExtracted(snapshot.extracted);
  const links = parseSnapshotLinksSummary(snapshot.links_summary);
  const images = parseSnapshotImages(snapshot.images);
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
