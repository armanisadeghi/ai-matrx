import type { MarketingSite } from "@/features/marketing/types";
import { isJsonRecord } from "@/features/marketing/types";
import {
  parseSiteIntegrations,
  providerReferenceStatus,
} from "@/features/marketing/data/integrations-schema";
import { judgeGscBindingWrite } from "@/features/marketing/google/gsc-property";
import { trackingHealth } from "@/features/marketing/tracking/health";
import type { TagManagerSnapshotRow } from "@/features/marketing/tracking/types";

/**
 * The six big-picture connection statuses for a site. This module is the ONE
 * place they are derived so the portfolio list and the site page can never
 * disagree (same law as features/admin/applications/version.ts).
 *
 * The sixth, `tracking`, is the Tag Manager verdict (google-native PLAN §4.10 Plane A). Its
 * derivation lives in `features/marketing/tracking/health.ts` — the same one the
 * `SiteTrackingPanel` renders — so the chip and the panel can never disagree either. It needs
 * the site's newest snapshot row, which this pure function cannot read, so the caller passes it;
 * with nothing passed the chip still tells the truth from the BINDING alone ("bound but never
 * checked" / "not connected"), never a grey blank.
 */
export type SiteConnectionState = "connected" | "attention" | "off";

export interface SiteConnectionStatus {
  key:
    | "initialized"
    | "search_console"
    | "analytics"
    | "pagespeed"
    | "cms"
    | "tracking";
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
  stepWarnings: InitializationStepError[];
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
        !line.startsWith('File "') &&
        !line.startsWith("...("),
    );
  return lines.slice(0, 4).join(" · ") || raw.slice(0, 200);
}

function parseStepErrors(value: unknown): InitializationStepError[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (typeof entry === "string") {
      return [
        {
          step: "unknown",
          errorType: null,
          message: cleanServerErrorMessage(entry),
        },
      ];
    }
    if (typeof entry === "object" && entry !== null && !Array.isArray(entry)) {
      const record = entry as { [key: string]: unknown };
      const message =
        typeof record.message === "string"
          ? record.message
          : JSON.stringify(record);
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
    stepWarnings: parseStepErrors(root.warnings),
  };
}

/**
 * The `tracking` chip, through the ONE tracking derivation. A caller that has not read the
 * snapshot still gets the honest binding-only answer rather than a chip that reads "off" on a
 * site whose container is bound and passing.
 */
function trackingStatus(
  containerBound: boolean,
  tracking: SiteTrackingStatusInput | undefined,
): SiteConnectionStatus {
  const health = trackingHealth({
    snapshot: tracking?.snapshot ?? null,
    containerBound,
    maxAgeHours: tracking?.maxAgeHours ?? null,
    now: tracking?.now ?? new Date(),
  });
  return {
    key: "tracking",
    label: health.label,
    name: health.name,
    state: health.state,
    detail: health.stale
      ? `${health.detail} — last checked more than your organization allows before a tracking check is called stale.`
      : health.detail,
  };
}

/** What the caller can supply so the `tracking` chip carries a real verdict. */
export interface SiteTrackingStatusInput {
  /** The site's newest live `web.tag_manager_snapshot` row, or null. */
  snapshot: TagManagerSnapshotRow | null;
  /** `google.tracking.snapshot_max_age_hours`; null when the knob is unreadable. */
  maxAgeHours: number | null;
  /** Injectable so one clock judges the age (the DataFreshnessLine contract). */
  now?: Date;
}

/** Derive the six connection statuses from a site row. Pure; no fetching. */
export function siteConnectionStatuses(
  site: Pick<
    MarketingSite,
    | "initialized_at"
    | "initialization"
    | "integrations"
    | "gsc_synced_at"
    | "domain"
    | "root_url"
  >,
  tracking?: SiteTrackingStatusInput,
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
      : init.stepWarnings.length
        ? {
            key: "initialized",
            label: "Init",
            name: "Site initialized",
            state: "attention",
            detail: `Initialized with ${init.stepWarnings.length} non-blocking notice${init.stepWarnings.length === 1 ? "" : "s"}`,
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
    "GSC",
    providerReferenceStatus(integrations.googleSearchConsole, true),
    "Not connected",
  );
  // THE REFUSAL IS PART OF THE CHIP (PLAN §5.3, verification defect B-4). A
  // property bound to a DIFFERENT site answers 200 with zero rows, so without
  // this the chip said "Connected" on a binding that can never return a row —
  // "connected" as a boolean that lies. One judge, the same one the editor
  // uses; this only reports it.
  const gscRefusal = judgeGscBindingWrite(integrations.googleSearchConsole, {
    root_url: site.root_url,
    domain: site.domain,
  });
  // A configured GSC binding without one completed sync is not "connected":
  // no data has ever flowed. gsc_synced_at is stamped by the sync command.
  const searchConsole: SiteConnectionStatus = !gscRefusal.allowed
    ? {
        ...gscBase,
        state: "attention",
        detail: `Search Console property does not match this site — ${gscRefusal.refusal?.headline ?? "the bound property belongs to another site"}`,
      }
    : gscBase.state === "connected"
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
      integrations.cms.kind
        ? "Configured kind, not connected"
        : "Not configured",
    ),
    trackingStatus(integrations.googleTagManager.enabled &&
      Boolean(integrations.googleTagManager.resourceRef.trim()), tracking),
  ];
}
