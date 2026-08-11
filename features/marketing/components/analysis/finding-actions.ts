/**
 * The ONE row-action builder for a `web.finding`.
 *
 * Doctrine (CLAUDE.md § Feature entry lists): one `ItemMenuConfig` builder per
 * entity, consumed identically by the table's `…` menu, its right-click menu,
 * and any future card/row rendering. Three divergent hard-coded action lists
 * for one entity is the defect this kills — and a finding has enough verbs
 * (four status transitions × two suppression axes × two scopes) that they
 * would have drifted within a week.
 *
 * Every verb here is a REAL write against the columns the schema already has
 * (`finding-mutations.ts`). Nothing in this menu is decorative, and nothing
 * invents status vocabulary — `open | acknowledged | resolved | reopened` is
 * the closed set the DB CHECK enforces.
 */

import {
  CheckCheck,
  CircleSlash,
  ExternalLink,
  EyeOff,
  FileText,
  ListChecks,
  RotateCcw,
  Undo2,
} from "lucide-react";
import type { ItemMenuConfig } from "@/components/official/item/types";
import type { MarketingFinding } from "@/features/marketing/data/analysis-types";
import {
  acknowledgeFinding,
  reopenFinding,
  resolveFinding,
  unacknowledgeFinding,
  unsuppressFinding,
} from "@/features/marketing/data/finding-mutations";
import { humanizeItemKey } from "@/features/marketing/lib/finding-remedies";

/** The slice of a finding every action surface already has in hand. */
export type FindingActionRow = Pick<
  MarketingFinding,
  "id" | "item_key" | "status" | "suppressed" | "page_id"
> & {
  page_url?: string | null;
  item_label?: string | null;
};

export interface FindingActionContext {
  siteId: string;
  /** `/marketing/brands/[brandId]/sites/[siteId]` — every door hangs off it. */
  sitePath: string;
  /** Re-read after a write lands. */
  onDone: () => void | Promise<void>;
  /** Opens the reason dialog for THIS finding (a reason is mandatory). */
  requestSuppress: (row: FindingActionRow) => void;
  /** Opens the reason dialog for every live finding of this check. */
  requestSuppressCheck: (row: FindingActionRow) => void;
  /** Lifts a whole check's suppression; resolves to the number of rows. */
  unsuppressCheck: (row: FindingActionRow) => Promise<number>;
}

export function findingLabel(row: FindingActionRow): string {
  return row.item_label || humanizeItemKey(row.item_key);
}

export function buildFindingMenu(
  row: FindingActionRow,
  ctx: FindingActionContext,
): ItemMenuConfig {
  const label = findingLabel(row);
  const isResolved = row.status === "resolved";
  const run = async (write: Promise<unknown>) => {
    await write;
    await ctx.onDone();
  };

  return {
    header: { title: label, description: row.item_key },
    sections: [
      {
        id: "open",
        items: [
          {
            kind: "link",
            id: "open",
            label: "Open finding",
            icon: FileText,
            href: `${ctx.sitePath}/findings/${row.id}`,
          },
          {
            kind: "link",
            id: "open-new-tab",
            label: "Open in new tab",
            icon: ExternalLink,
            href: `${ctx.sitePath}/findings/${row.id}`,
            target: "_blank",
          },
          {
            kind: "link",
            id: "page-workspace",
            label: "Page workspace",
            icon: ListChecks,
            href: `${ctx.sitePath}/pages/${row.page_id}`,
            hidden: !row.page_id,
          },
          {
            kind: "link",
            id: "live-page",
            label: "Open the live page",
            icon: ExternalLink,
            href: row.page_url ?? "#",
            target: "_blank",
            hidden: !row.page_url,
          },
        ],
      },
      {
        id: "lifecycle",
        label: "Lifecycle",
        items: [
          {
            id: "acknowledge",
            label: "I'm on it",
            icon: CheckCheck,
            hidden: isResolved || row.status === "acknowledged",
            onSelect: () => run(acknowledgeFinding(ctx.siteId, row.id)),
            toast: {
              loading: "Acknowledging…",
              success: "Marked as acknowledged",
              error: "Could not acknowledge this finding",
            },
          },
          {
            id: "unacknowledge",
            label: "Not on it after all",
            icon: Undo2,
            hidden: row.status !== "acknowledged",
            onSelect: () => run(unacknowledgeFinding(ctx.siteId, row.id)),
            toast: {
              loading: "Updating…",
              success: "Back to open",
              error: "Could not change this finding",
            },
          },
          {
            id: "resolve",
            label: "I fixed this",
            icon: CircleSlash,
            // Safe to offer because it is a claim the analyzer re-checks: a
            // condition that is still broken comes back on this same row as
            // `reopened` on the next analysis.
            description: "Re-checked on the next analysis",
            hidden: isResolved,
            onSelect: () => run(resolveFinding(ctx.siteId, row.id)),
            toast: {
              loading: "Marking fixed…",
              success: "Marked fixed — the next analysis re-checks it",
              error: "Could not resolve this finding",
            },
          },
          {
            id: "reopen",
            label: "It's back — reopen",
            icon: RotateCcw,
            hidden: !isResolved,
            onSelect: () => run(reopenFinding(ctx.siteId, row.id)),
            toast: {
              loading: "Reopening…",
              success: "Reopened",
              error: "Could not reopen this finding",
            },
          },
        ],
      },
      {
        id: "noise",
        label: "Noise",
        items: [
          {
            id: "suppress",
            label: "This is intentional…",
            icon: EyeOff,
            hidden: row.suppressed,
            onSelect: () => ctx.requestSuppress(row),
          },
          {
            id: "unsuppress",
            label: "Stop suppressing",
            icon: Undo2,
            hidden: !row.suppressed,
            onSelect: () => run(unsuppressFinding(ctx.siteId, row.id)),
            toast: {
              loading: "Restoring…",
              success: "Back in the register",
              error: "Could not restore this finding",
            },
          },
          {
            id: "suppress-check",
            label: `Suppress every "${label}" finding…`,
            icon: EyeOff,
            description: "Across this whole site",
            onSelect: () => ctx.requestSuppressCheck(row),
          },
          {
            id: "unsuppress-check",
            label: `Stop suppressing "${label}"`,
            icon: Undo2,
            hidden: !row.suppressed,
            onSelect: async () => {
              const count = await ctx.unsuppressCheck(row);
              await ctx.onDone();
              if (count === 0) throw new Error("Nothing was suppressed");
            },
            toast: {
              loading: "Restoring…",
              success: "Restored across the site",
              error: "Could not restore this check",
            },
          },
        ],
      },
    ],
  };
}
