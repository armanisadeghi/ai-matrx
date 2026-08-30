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
import type {
  ItemMenuConfig,
  ItemMenuSection,
} from "@/components/official/item/types";
import { webCopy } from "@/features/marketing/lib/copy-payloads";
import { marketingRoutes } from "@/features/marketing/lib/routes";
import type { MarketingSite, SiteListRow } from "@/features/marketing/types";
import { toast } from "@/lib/toast";

export interface SiteActionCallbacks<
  TSite extends MarketingSite = MarketingSite,
> {
  /** Keeps workspace navigation in the consuming shell's router. */
  onOpenWorkspace: (href: string) => void;
  onQuickView: (site: TSite) => void;
  onEditSite: (site: TSite) => void;
  onDeleteSite: (site: TSite) => void;
}

export type SiteMenuCopy = ReturnType<typeof webCopy>;

interface SiteMenuContextBase<
  TSite extends MarketingSite,
> extends SiteActionCallbacks<TSite> {
  site: TSite;
  /** Host-only actions rendered before the canonical site actions. */
  beforeSections?: ItemMenuSection[];
  /** Host-only actions rendered after the canonical site actions. */
  afterSections?: ItemMenuSection[];
}

/** A base site host supplies the copy payload that describes its own surface. */
export type SiteMenuContext<TSite extends MarketingSite = MarketingSite> =
  SiteMenuContextBase<TSite> & {
    copy: SiteMenuCopy;
  };

type DefaultSiteMenuContext = SiteMenuContextBase<SiteListRow> & {
  copy?: undefined;
};

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

/**
 * The one site-action registry used by every sites-list presentation.
 *
 * The portfolio's richer SiteListRow keeps its established default copy.
 * Other hosts provide copy shaped for their own surface and may surround the
 * canonical actions with host-only sections without forking those actions.
 */
export function buildSiteMenu(ctx: DefaultSiteMenuContext): ItemMenuConfig;
export function buildSiteMenu<TSite extends MarketingSite>(
  ctx: SiteMenuContext<TSite>,
): ItemMenuConfig;
export function buildSiteMenu(
  ctx: DefaultSiteMenuContext | SiteMenuContext,
): ItemMenuConfig {
  if (ctx.copy !== undefined) {
    return buildSiteMenuConfig(ctx, ctx.copy);
  }
  return buildSiteMenuConfig(ctx, siteRowCopy(ctx.site));
}

function buildSiteMenuConfig<TSite extends MarketingSite>(
  ctx: SiteMenuContextBase<TSite>,
  copy: SiteMenuCopy,
): ItemMenuConfig {
  const { site } = ctx;

  return {
    header: { title: site.name, description: site.domain },
    sections: [
      ...(ctx.beforeSections ?? []),
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
      ...(ctx.afterSections ?? []),
    ],
  };
}
