import type { MarketingSite } from "@/features/marketing/types";
import { isJsonRecord } from "@/features/marketing/types";
import {
  parseSiteIntegrations,
  providerReferenceStatus,
} from "@/features/marketing/data/integrations-schema";

/**
 * The five big-picture connection statuses for a site. This module is the ONE
 * place they are derived so the portfolio list and the site page can never
 * disagree (same law as features/admin/applications/version.ts).
 */
export type SiteConnectionState = "connected" | "attention" | "off";

export interface SiteConnectionStatus {
  key: "initialized" | "search_console" | "analytics" | "pagespeed" | "cms";
  /** Short chip label. */
  label: string;
  /** Full name for the site page status board. */
  name: string;
  state: SiteConnectionState;
  detail: string;
}

export interface InitializationStepError {
  step: string;
  errorType: string | null;
  /** ANSI-stripped, first meaningful lines only — safe to render. */
  message: string;
}

export interface ParsedInitialization {
  homepageOk: boolean;
  sitemapsFound: number | null;
  screenshotsCaptured: number | null;
  discoveredTotal: number | null;
  stepErrors: InitializationStepError[];
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Strip ANSI escapes and collapse a server traceback to its readable head. */
export function cleanServerErrorMessage(raw: string): string {
  const noAnsi = raw.replace(/\[[0-9;]*m/g, "");
  const lines = noAnsi
    .split("\n")
    .map((line) => line.trim())
    .filter(
      (line) =>
        line &&
        !/^-{4,}$/.test(line) &&
        !line.startsWith("Traceback") &&
        !line.startsWith("File \"") &&
        !line.startsWith("...("),
    );
  return lines.slice(0, 4).join(" · ") || raw.slice(0, 200);
}

function parseStepErrors(value: unknown): InitializationStepError[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (typeof entry === "string") {
      return [{ step: "unknown", errorType: null, message: cleanServerErrorMessage(entry) }];
    }
    if (typeof entry === "object" && entry !== null && !Array.isArray(entry)) {
      const record = entry as { [key: string]: unknown };
      const message =
        typeof record.message === "string" ? record.message : JSON.stringify(record);
      return [
        {
          step: typeof record.step === "string" ? record.step : "unknown",
          errorType:
            typeof record.error_type === "string" ? record.error_type : null,
          message: cleanServerErrorMessage(message),
        },
      ];
    }
    return [];
  });
}

/** Normalize the scraper-written `web.site.initialization` summary. */
export function parseInitialization(
  site: Pick<MarketingSite, "initialization">,
): ParsedInitialization {
  const root = isJsonRecord(site.initialization) ? site.initialization : {};
  const sitemaps = isJsonRecord(root.sitemaps) ? root.sitemaps : {};
  const screenshots = isJsonRecord(root.screenshots) ? root.screenshots : {};
  const discovered = isJsonRecord(root.discovered) ? root.discovered : {};
  const discoveredCounts = Object.values(discovered).flatMap((value) =>
    typeof value === "number" && Number.isFinite(value) ? [value] : [],
  );
  return {
    homepageOk: root.homepage === "ok",
    sitemapsFound: numberOrNull(sitemaps.found),
    screenshotsCaptured: numberOrNull(screenshots.captured),
    discoveredTotal: discoveredCounts.length
      ? discoveredCounts.reduce((sum, count) => sum + count, 0)
      : null,
    stepErrors: parseStepErrors(root.errors),
  };
}

/** Derive the five connection statuses from a site row. Pure; no fetching. */
export function siteConnectionStatuses(
  site: Pick<
    MarketingSite,
    "initialized_at" | "initialization" | "integrations" | "gsc_synced_at"
  >,
): SiteConnectionStatus[] {
  const init = parseInitialization(site);
  const integrations = parseSiteIntegrations(site.integrations);

  const initialized: SiteConnectionStatus = site.initialized_at
    ? init.stepErrors.length
      ? {
          key: "initialized",
          label: "Init",
          name: "Site initialized",
          state: "attention",
          detail: `Initialized with ${init.stepErrors.length} failed step${init.stepErrors.length === 1 ? "" : "s"} (${init.stepErrors.map((error) => error.step).join(", ")})`,
        }
      : {
          key: "initialized",
          label: "Init",
          name: "Site initialized",
          state: "connected",
          detail: "Homepage, sitemaps, and basics captured",
        }
    : {
        key: "initialized",
        label: "Init",
        name: "Site initialized",
        state: "off",
        detail: "Never initialized — run the first capture",
      };

  const providerStatus = (
    key: SiteConnectionStatus["key"],
    label: string,
    name: string,
    status: ReturnType<typeof providerReferenceStatus>,
    offDetail: string,
  ): SiteConnectionStatus => ({
    key,
    label,
    name,
    state:
      status === "reference_configured"
        ? "connected"
        : status === "needs_reference"
          ? "attention"
          : "off",
    detail:
      status === "reference_configured"
        ? "Connected"
        : status === "needs_reference"
          ? "Enabled but missing a reference"
          : offDetail,
  });

  const gscBase = providerStatus(
    "search_console",
    "GSC",
    "Google Search Console",
    providerReferenceStatus(integrations.googleSearchConsole, true),
    "Not connected",
  );
  // A configured GSC binding without one completed sync is not "connected":
  // no data has ever flowed. gsc_synced_at is stamped by the sync command.
  const searchConsole: SiteConnectionStatus =
    gscBase.state === "connected"
      ? site.gsc_synced_at
        ? {
            ...gscBase,
            detail: `Connected · last synced ${new Date(site.gsc_synced_at).toLocaleDateString()}`,
          }
        : {
            ...gscBase,
            state: "attention",
            detail: "Connected, never synced",
          }
      : gscBase;

  return [
    initialized,
    searchConsole,
    providerStatus(
      "analytics",
      "GA4",
      "Google Analytics 4",
      providerReferenceStatus(integrations.googleAnalytics4, true),
      "Not connected",
    ),
    providerStatus(
      "pagespeed",
      "PSI",
      "PageSpeed Insights",
      providerReferenceStatus(integrations.pageSpeedInsights, false, false),
      "Not enabled",
    ),
    providerStatus(
      "cms",
      "CMS",
      "CMS connection",
      providerReferenceStatus(integrations.cms, true, false),
      integrations.cms.kind ? "Configured kind, not connected" : "Not configured",
    ),
  ];
}
