import { History } from "lucide-react";
import type { Json } from "@/types/database.types";
import {
  latestDismissal,
  parseDismissals,
} from "@/features/marketing/lib/dismissals";
import { formatDate } from "@/features/marketing/components/shared/MarketingUi";

/**
 * Subtle marker for a crawler-observed row (page/sitemap) the user dismissed
 * and a later crawl/sync revived — observed reality came back after being
 * hidden. Renders nothing when `metadata.dismissals` is absent.
 */
export function PreviouslyDismissedBadge({
  metadata,
}: {
  metadata: Json | null;
}) {
  const records = parseDismissals(metadata);
  const latest = latestDismissal(records);
  if (!latest) return null;
  const tooltip = [
    `Dismissed ${records.length}× and revived by a later observation.`,
    latest.dismissed_at
      ? `Last dismissed ${formatDate(latest.dismissed_at)}`
      : null,
    latest.revived_at ? `Revived ${formatDate(latest.revived_at)}` : null,
    latest.revive_reason ? `Reason: ${latest.revive_reason}` : null,
  ]
    .filter(Boolean)
    .join("\n");
  return (
    <span
      title={tooltip}
      className="inline-flex shrink-0 items-center gap-1 rounded-full border border-warning/40 bg-warning/10 px-1.5 py-px text-[10px] font-medium text-warning"
    >
      <History className="h-3 w-3" />
      Previously dismissed{records.length > 1 ? ` ×${records.length}` : ""}
    </span>
  );
}
