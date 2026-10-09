/**
 * ON THE WEB, BUT ITS DATA IS NOT (Applet audit 2026-10-09: post-tracker, post-approvals): a signed-out
 * visitor's every read of a custom table or platform entity is refused, so Manage must say so.
 */
import { webVisitorsMissData } from "@/features/applets/lib/applet-state";
import { appletSources } from "@/features/applets/types";

const TABLE = { alias: "posts", table_id: "6087f27b-5e8b-48ee-b786-6b4efb39d4cf", organization_id: "344cfaa8-2b0c-4971-854a-9694614816f2" };

function row(published_to_web: boolean, sources: unknown[]) {
  return { status: "published", published_to_web, deleted_at: null, sources } as const;
}

describe("webVisitorsMissData", () => {
  it("is true for a web Applet that reads a stored table", () => {
    const app = row(true, [TABLE]);
    expect(webVisitorsMissData(app, appletSources(app as never))).toBe(true);
  });
  it("is true for a web Applet over a platform entity", () => {
    const app = row(true, [{ alias: "notes", entity: "note" }]);
    expect(webVisitorsMissData(app, appletSources(app as never))).toBe(true);
  });
  it("is false when only the organization can open it", () => {
    const app = row(false, [TABLE]);
    expect(webVisitorsMissData(app, appletSources(app as never))).toBe(false);
  });
  it("is false for a web Applet with no stored data (a job-only Applet)", () => {
    const app = row(true, []);
    expect(webVisitorsMissData(app, appletSources(app as never))).toBe(false);
  });
});
