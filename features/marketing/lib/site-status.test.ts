import { siteConnectionStatuses } from "@/features/marketing/lib/site-status";

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

function gscStatus(site: Parameters<typeof siteConnectionStatuses>[0]) {
  const status = siteConnectionStatuses(site).find(
    (entry) => entry.key === "search_console",
  );
  if (!status) throw new Error("search_console status missing");
  return status;
}

describe("siteConnectionStatuses — Search Console sync state", () => {
  it("flags a configured binding that never synced as attention", () => {
    const status = gscStatus({
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
      initialized_at: null,
      initialization: {},
      integrations: {},
      gsc_synced_at: null,
    });
    expect(status.state).toBe("off");
    expect(status.detail).toBe("Not connected");
  });
});
