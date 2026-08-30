import {
  Braces,
  Copy,
  ExternalLink,
  Eye,
  PanelsTopLeft,
  Pencil,
  Trash2,
} from "lucide-react";

import { buildAgentPayload } from "@/components/agent-copy/buildAgentPayload";
import type { ItemMenuConfig } from "@/components/official/item/types";
import { webCopy } from "@/features/marketing/lib/copy-payloads";
import { marketingRoutes } from "@/features/marketing/lib/routes";
import type { MarketingSite, SiteListRow } from "@/features/marketing/types";
import { toast } from "@/lib/toast";

export interface SiteActionCallbacks {
  /** Keeps workspace navigation in the consuming shell's router. */
  onOpenWorkspace: (href: string) => void;
  onQuickView: (site: SiteListRow) => void;
  onEditSite: (site: MarketingSite) => void;
  onDeleteSite: (site: MarketingSite) => void;
}

export interface SiteMenuContext extends SiteActionCallbacks {
  site: SiteListRow;
}

async function copyToClipboard(text: string, message: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    document.body.removeChild(textarea);
  }
  toast.success(message);
}

export function siteRowCopy(site: SiteListRow) {
  return webCopy({
    kind: "web-site",
    label: `Site ${site.domain}`,
    description: "One managed website row from the Marketing sites list.",
    surface: `Sites list — ${site.domain}`,
    data: site,
    lines: [
      ["Site", site.name],
      ["Domain", site.domain],
      ["Root URL", site.root_url],
      ["Status", site.status],
      ["Pages", site.page_count],
      ["Pages in Google", site.pages_in_gsc],
      ["Clicks (28d)", site.gsc_clicks_28d],
      ["Impressions (28d)", site.gsc_impressions_28d],
      ["Avg position (28d)", site.gsc_position_28d?.toFixed(1) ?? null],
      ["Health score", site.health_score],
      ["GSC data through", site.gsc_latest_date],
    ],
    attributes: {
      site_id: site.id,
      brand_id: site.brand_id,
      status: site.status,
    },
  });
}

/** The one site-action registry used by every sites-list presentation. */
export function buildSiteMenu(ctx: SiteMenuContext): ItemMenuConfig {
  const { site } = ctx;
  const copy = siteRowCopy(site);

  return {
    header: { title: site.name, description: site.domain },
    sections: [
      {
        id: "open",
        items: [
          {
            id: "workspace",
            label: "Open workspace",
            icon: PanelsTopLeft,
            onSelect: () =>
              ctx.onOpenWorkspace(marketingRoutes.site(site.brand_id, site.id)),
          },
          {
            id: "quick-view",
            label: "Quick view",
            icon: Eye,
            onSelect: () => ctx.onQuickView(site),
          },
          {
            id: "live-site",
            kind: "link",
            label: "Open live site",
            icon: ExternalLink,
            href: site.root_url,
            target: "_blank",
          },
        ],
      },
      {
        id: "copy",
        items: [
          {
            id: "copy-summary",
            label: "Copy summary",
            icon: Copy,
            onSelect: () =>
              void copyToClipboard(
                copy.human(),
                `${site.domain} copied to clipboard`,
              ),
          },
          {
            id: "copy-ai",
            label: "Copy for AI",
            icon: Braces,
            onSelect: () =>
              void copyToClipboard(
                buildAgentPayload(copy.agent()),
                `${site.domain} copied for AI agent`,
              ),
          },
        ],
      },
      {
        id: "manage",
        items: [
          {
            id: "edit",
            label: "Edit site",
            icon: Pencil,
            onSelect: () => ctx.onEditSite(site),
          },
          {
            id: "delete",
            label: "Delete site",
            icon: Trash2,
            tone: "destructive",
            onSelect: () => ctx.onDeleteSite(site),
          },
        ],
      },
    ],
  };
}
