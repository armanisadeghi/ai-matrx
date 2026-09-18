import { csvExportItem, jsonExportItem } from "./export";

/**
 * The witness for the production crash found on 2026-09-18: every agent
 * version-diff page (`/agents/<id>/latest`, `/agents/<id>/v/<n>`) rendered
 * "Something went wrong — Transfer id \"export:csv\" is empty or registered
 * more than once" and nothing else, for every agent, because the page offers
 * two CSV exports and two JSON exports and the helpers gave each pair the same
 * id. The content-transfer registry refuses duplicate ids during render, so the
 * whole route died behind an error boundary.
 */
describe("export item ids are unique per menu row", () => {
  it("gives two CSV rows on one menu different ids", () => {
    const changedFields = csvExportItem(() => [], "CSV (changed fields)");
    const allVersions = csvExportItem(() => [], "CSV (all versions)");
    expect(changedFields.id).not.toBe(allVersions.id);
  });

  it("gives two JSON rows on one menu different ids", () => {
    const renderedDiff = jsonExportItem(() => ({}), "JSON (rendered diff)");
    const bothSnapshots = jsonExportItem(() => ({}), "JSON (both snapshots)");
    expect(renderedDiff.id).not.toBe(bothSnapshots.id);
  });

  it("reproduces the exact version-diff menu with four distinct ids", () => {
    const items = [
      jsonExportItem(() => ({}), "JSON (rendered diff)"),
      csvExportItem(() => [], "CSV (changed fields)"),
      csvExportItem(() => [], "CSV (all versions)"),
      jsonExportItem(() => ({}), "JSON (both snapshots)"),
    ];
    expect(new Set(items.map((i) => i.id)).size).toBe(items.length);
  });

  it("keeps the bare ids for the default labels", () => {
    expect(csvExportItem(() => []).id).toBe("csv");
    expect(jsonExportItem(() => ({})).id).toBe("json");
  });

  it("is deterministic — the same label always yields the same id", () => {
    expect(csvExportItem(() => [], "CSV (all versions)").id).toBe(
      csvExportItem(() => [], "CSV (all versions)").id,
    );
  });
});
