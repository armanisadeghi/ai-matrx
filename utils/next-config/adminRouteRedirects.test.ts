// A redirect whose destination is its own source is an ERR_TOO_MANY_REDIRECTS page. A mechanical
// rename once produced exactly that for /administration/applets/** (2026-10-07).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { adminLegacyRouteRedirects } = require("./adminRouteRedirects") as {
  adminLegacyRouteRedirects: { source: string; destination: string }[];
};

describe("admin legacy route redirects", () => {
  it("never send a path to itself", () => {
    const loops = adminLegacyRouteRedirects.filter((r) => r.source === r.destination);
    expect(loops).toEqual([]);
  });

  it("never lead into another legacy source (a chain is a loop waiting to happen)", () => {
    const sources = new Set(adminLegacyRouteRedirects.map((r) => r.source));
    const chained = adminLegacyRouteRedirects.filter((r) => sources.has(r.destination));
    expect(chained).toEqual([]);
  });
});
