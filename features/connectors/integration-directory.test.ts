import {
  DEFAULT_DIRECTORY_FILTERS,
  directoryDetailFromParams,
  filterDirectory,
  savedAccountSummary,
  type IntegrationDirectoryItem,
} from "./integration-directory";

function item(
  overrides: Partial<IntegrationDirectoryItem> & Pick<IntegrationDirectoryItem, "id" | "name">,
): IntegrationDirectoryItem {
  return {
    description: "Connect work safely",
    vendor: "Example",
    category: "productivity",
    keywords: "files calendar",
    artwork: {
      id: overrides.id,
      name: overrides.name,
      blurb: "Connect work safely",
      surfaces: ["directory"],
    },
    featured: false,
    saved: false,
    connected: false,
    available: true,
    comingSoon: false,
    status: "Not connected",
    attention: false,
    ...overrides,
  };
}

describe("integration directory filters", () => {
  const items = [
    item({ id: "slack", name: "Slack", category: "communication", keywords: "messages team", featured: true }),
    item({ id: "drive", name: "Google Drive", saved: true, connected: true, accountSummary: "a@example.com" }),
    item({ id: "expired", name: "Box", saved: true, attention: true, status: "Needs attention", accountSummary: "b@example.com" }),
    item({ id: "soon", name: "Future", comingSoon: true, available: false }),
  ];

  it("combines category, status, and search rather than dropping filters while searching", () => {
    expect(
      filterDirectory(items, {
        ...DEFAULT_DIRECTORY_FILTERS,
        query: "team slack",
        category: "communication",
        status: "available",
      }).map((row) => row.id),
    ).toEqual(["slack"]);
  });

  it("keeps saved attention rows in Yours and places them before healthy rows", () => {
    expect(
      filterDirectory(items, { ...DEFAULT_DIRECTORY_FILTERS, view: "yours" }).map((row) => row.id),
    ).toEqual(["expired", "drive"]);
  });
});

describe("saved account summaries", () => {
  it("excludes revoked and disconnected accounts while retaining repair-needed ones", () => {
    expect(savedAccountSummary([
      { identity: "expired@example.com", status: "needs_reauth" },
      { identity: "gone@example.com", status: "revoked" },
      { identity: "old@example.com", status: "disconnected" },
    ], false, false)).toMatchObject({ saved: true, connected: false, attention: true, status: "Needs attention", accountSummary: "expired@example.com" });
  });

  it("does not turn a null status into a connected account", () => {
    expect(savedAccountSummary([{ identity: "unknown@example.com", status: null }], false, false)).toMatchObject({ saved: true, connected: false, attention: true, status: "Needs attention" });
  });
});

describe("OAuth return detail mapping", () => {
  it("maps native returns and preserves unknown provider details", () => {
    expect(directoryDetailFromParams(new URLSearchParams("microsoft_status=ok"))).toBe("native:microsoft");
    expect(directoryDetailFromParams(new URLSearchParams("provider=dropbox&oauth_status=success"))).toBe("native:dropbox");
    expect(directoryDetailFromParams(new URLSearchParams("provider=slack"))).toBe("provider:slack");
  });
});
