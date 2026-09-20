import {
  parseInitialization,
  siteProviderStatuses,
} from "@/features/marketing/lib/site-status";

const CONNECTED_GSC_INTEGRATIONS = {
  marketing: {
    providers: {
      google_search_console: {
        enabled: true,
        credential_authority: "external_connection",
        credential_ref: "00000000-0000-4000-8000-000000000000",
        resource_ref: "sc-domain:example.com",
      },
    },
  },
};

/** The site facts every case shares, so only the binding varies. */
const SITE_FACTS = {
  domain: "example.com",
  root_url: "https://example.com/",
} as const;

function gscStatus(site: Parameters<typeof siteProviderStatuses>[0]) {
  const status = siteProviderStatuses(site).find(
    (entry) => entry.key === "search_console",
  );
  if (!status) throw new Error("search_console status missing");
  return status;
}

describe("siteConnectionStatuses — Search Console sync state", () => {
  it("flags a configured binding that never synced as attention", () => {
    const status = gscStatus({
      ...SITE_FACTS,
      initialized_at: null,
      initialization: {},
      integrations: CONNECTED_GSC_INTEGRATIONS,
      gsc_synced_at: null,
    });
    expect(status.state).toBe("attention");
    expect(status.detail).toBe("Connected, never synced");
  });

  it("reports a synced binding as connected with freshness", () => {
    const status = gscStatus({
      ...SITE_FACTS,
      initialized_at: null,
      initialization: {},
      integrations: CONNECTED_GSC_INTEGRATIONS,
      gsc_synced_at: "2026-07-19T10:00:00Z",
    });
    expect(status.state).toBe("connected");
    expect(status.detail.startsWith("Connected · last synced ")).toBe(true);
  });

  it("keeps an unconfigured binding off regardless of sync stamp", () => {
    const status = gscStatus({
      ...SITE_FACTS,
      initialized_at: null,
      initialization: {},
      integrations: {},
      gsc_synced_at: null,
    });
    expect(status.state).toBe("off");
    expect(status.detail).toBe("Not connected");
  });
});

describe("siteConnectionStatuses — a property bound to a different site", () => {
  /*
    The live row, read 2026-09-17 and left untouched: site
    `d7c4aeb1-a920-4fa0-b118-00ffed913c22` (`ga4-oauth-qa-00fb6a62a3.invalid`)
    is bound, enabled, to the Search Console property `http://bhrcenter.com/`.
    Before this, every chip on every list said "Connected" for it — a boolean
    that lies about a binding that can never return a row.
  */
  const LIVE_MISMATCH = {
    marketing: {
      providers: {
        google_search_console: {
          enabled: true,
          credential_authority: "external_connection",
          credential_ref: "31b75c97-3710-4c2f-9834-dd6da29ca8b6",
          resource_ref: "http://bhrcenter.com/",
        },
      },
    },
  };

  it("never says Connected, and names both sides in the chip detail", () => {
    const status = gscStatus({
      domain: "ga4-oauth-qa-00fb6a62a3.invalid",
      root_url: "https://ga4-oauth-qa-00fb6a62a3.invalid",
      initialized_at: "2026-09-01T00:00:00Z",
      initialization: {},
      integrations: LIVE_MISMATCH,
      // Even a site that HAS synced: the binding is still wrong.
      gsc_synced_at: "2026-09-16T10:00:00Z",
    });
    expect(status.state).toBe("attention");
    expect(status.detail).toContain("does not match this site");
    expect(status.detail).toContain("bhrcenter.com");
  });

  it("leaves a matching binding alone", () => {
    const status = gscStatus({
      ...SITE_FACTS,
      initialized_at: null,
      initialization: {},
      integrations: CONNECTED_GSC_INTEGRATIONS,
      gsc_synced_at: "2026-09-16T10:00:00Z",
    });
    expect(status.state).toBe("connected");
  });
});

describe("parseInitialization — errors versus non-blocking notices", () => {
  it("keeps warnings visible without counting them as failed steps", () => {
    const parsed = parseInitialization({
      initialization: {
        homepage: "ok",
        errors: [],
        warnings: [
          {
            step: "screenshots",
            error_type: "ScreenshotPruneError",
            message: "One superseded screenshot could not be soft-deleted",
          },
        ],
      },
    });

    expect(parsed.stepErrors).toEqual([]);
    expect(parsed.stepWarnings).toEqual([
      {
        step: "screenshots",
        errorType: "ScreenshotPruneError",
        message: "One superseded screenshot could not be soft-deleted",
      },
    ]);
  });
});
