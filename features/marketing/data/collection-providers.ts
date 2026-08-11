/**
 * ONE declaration of the data sources a managed site collects from.
 *
 * The status panel on site settings used to render whatever the server sent,
 * verbatim: a red "Failed" badge next to a sentence about scheduling, a
 * floating "not connected" chip, and no way to act on either. THE DOOR LAW
 * says a surface that names a problem ships the fix — so every provider here
 * declares, in one place: what it collects (in plain English), how we decide
 * whether it is connected, where the user goes to connect it, and where its
 * data lives.
 *
 * Add a provider here and the settings panel, its copy payload, and the
 * agent-readable surface values all learn about it at once.
 */

import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  Gauge,
  Link2,
  ListOrdered,
  SearchCheck,
} from "lucide-react";

import { marketingRoutes } from "@/features/marketing/lib/routes";

/** Keys are `seo.collection_run.provider` values — never invent a new spelling. */
export type CollectionProviderKey =
  | "gsc"
  | "bing_webmaster"
  | "ga4"
  | "pagespeed_insights"
  | "dataforseo"
  | "brave"
  | "serpapi";

/**
 * How a provider gets work done. `scheduled` runs on a cadence we own;
 * `on_demand` only ever runs when a human or an agent asks for it — saying
 * "next due —" for one of those reads as a gap when it is the design.
 */
export type CollectionCadenceKind = "scheduled" | "on_demand";

export interface CollectionProviderSpec {
  key: CollectionProviderKey;
  /** Short user-facing name. Never a raw provider slug. */
  label: string;
  icon: LucideIcon;
  /** What this collects, for someone who has never heard of the vendor. */
  what: string;
  /** The unit behind the row count, e.g. "days of search data". */
  rowUnit: string;
  cadence: CollectionCadenceKind;
  /** Where the user goes to connect / configure this source. */
  fix: (context: CollectionDoorContext) => CollectionDoor;
  /** Where this provider's collected data is read. */
  data: (context: CollectionDoorContext) => CollectionDoor | null;
  /**
   * A site-level "run now" exists for this provider. Page-level-only runs
   * (PageSpeed) and cost-bearing runs that need a profile choice (backlinks)
   * deliberately send the user to the workspace that owns those choices
   * instead of firing a hidden, unpriced job from a settings card.
   */
  runnable: boolean;
}

export interface CollectionDoorContext {
  siteId: string;
  /** Canonical brand-first base path for the site, no trailing slash. */
  sitePath: string;
}

export interface CollectionDoor {
  label: string;
  href: string;
}

export const COLLECTION_PROVIDERS: CollectionProviderSpec[] = [
  {
    key: "gsc",
    label: "Google Search Console",
    icon: SearchCheck,
    what: "How people find this site on Google — the searches, clicks, positions, and which pages Google shows.",
    rowUnit: "stored search rows",
    cadence: "scheduled",
    runnable: true,
    fix: ({ sitePath }) => ({
      label: "Connect Search Console",
      href: `${sitePath}/integrations`,
    }),
    data: ({ siteId }) => ({
      label: "Open search data",
      href: marketingRoutes.searchConsole(siteId),
    }),
  },
  {
    key: "bing_webmaster",
    label: "Bing Webmaster",
    icon: SearchCheck,
    what: "The same search picture from Bing and Copilot — a second opinion on how this site is found.",
    rowUnit: "stored search rows",
    cadence: "scheduled",
    runnable: false,
    fix: () => ({
      label: "Connect Bing",
      // The site binding lives in that page's "Bind a verified Bing property
      // to a site" section — land on it, not at the top of the page.
      href: `${marketingRoutes.connectionsBing()}#site-bindings`,
    }),
    data: ({ siteId }) => ({
      label: "Open search data",
      href: marketingRoutes.searchConsole(siteId),
    }),
  },
  {
    key: "ga4",
    label: "Google Analytics",
    icon: BarChart3,
    what: "What visitors actually did once they arrived — sessions, engagement, and the pages they landed on.",
    rowUnit: "stored visit days",
    cadence: "scheduled",
    runnable: true,
    fix: ({ sitePath }) => ({
      label: "Connect Analytics",
      href: `${sitePath}/integrations`,
    }),
    data: () => null,
  },
  {
    key: "pagespeed_insights",
    label: "Page speed",
    icon: Gauge,
    what: "How fast each page loads for real visitors, and the specific things slowing it down.",
    rowUnit: "measured pages",
    cadence: "on_demand",
    runnable: false,
    fix: ({ sitePath }) => ({
      label: "Connect page speed",
      href: `${sitePath}/integrations`,
    }),
    data: ({ sitePath }) => ({
      label: "Open speed report",
      href: `${sitePath}/performance`,
    }),
  },
  {
    key: "dataforseo",
    label: "Backlinks",
    icon: Link2,
    what: "Who links to this site from elsewhere on the web, and how much authority those links carry.",
    rowUnit: "stored backlink snapshots",
    cadence: "scheduled",
    runnable: false,
    fix: ({ sitePath }) => ({
      label: "Set up backlink refresh",
      href: `${sitePath}/integrations`,
    }),
    data: ({ sitePath }) => ({
      label: "Open backlinks",
      href: `${sitePath}/backlinks`,
    }),
  },
  {
    key: "brave",
    label: "Rank tracking — Brave",
    icon: ListOrdered,
    what: "Where this site ranks in Brave's own search index for the keywords being tracked.",
    rowUnit: "rank checks",
    cadence: "on_demand",
    runnable: false,
    fix: ({ sitePath }) => ({
      label: "Set up rank tracking",
      href: `${sitePath}/ranks`,
    }),
    data: ({ sitePath }) => ({
      label: "Open rank portfolio",
      href: `${sitePath}/ranks`,
    }),
  },
  {
    key: "serpapi",
    label: "Rank tracking — Google",
    icon: ListOrdered,
    what: "Where this site ranks on Google — nationally, in a chosen city, or in the map pack.",
    rowUnit: "rank checks",
    cadence: "on_demand",
    runnable: false,
    fix: ({ sitePath }) => ({
      label: "Set up rank tracking",
      href: `${sitePath}/ranks`,
    }),
    data: ({ sitePath }) => ({
      label: "Open rank portfolio",
      href: `${sitePath}/ranks`,
    }),
  },
];

export function collectionProviderSpec(
  key: string,
): CollectionProviderSpec | null {
  return COLLECTION_PROVIDERS.find((spec) => spec.key === key) ?? null;
}
