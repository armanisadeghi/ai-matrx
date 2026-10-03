// features/unified-data/hub/__tests__/the-hub-lists-its-tables-once.test.ts
//
// THE ORGANIZATION HUB LISTS ITS TABLES ONCE (lane POST-PUBLISH-FE, VERIFIER-18 M3).
//
// The hub lists the organization's tables (and, behind Show everything, what the app keeps for
// itself), then mounts records-ui's `TablesHome` for making a table. `TablesHome` draws its own
// full lists — Tables, Mine, Dashboards, Kept by the app — unless it is passed `makingOnly`
// (records-ui 0.85.6). Measured on the shared preview before this lane: the hub drew every table
// twice. This guard reads the hub's source: every `<TablesHome` it mounts passes `makingOnly`.
// The screen half is proven headless on the shared preview (lane report).
import { readFileSync } from "node:fs";
import { join } from "node:path";

const HUB = readFileSync(join(__dirname, "..", "OrganizationHub.tsx"), "utf8");

describe("the organization hub · one list of tables", () => {
  // Since G5 b (lane MAKE-HOME, 2026-10-02) making a table is the page header's New table, which opens
  // the one New table dialog (features/make/MakeMount.tsx): the hub mounts no TablesHome at all, so it
  // can never draw a second list of tables nor a name box under every organization's rows.
  it("mounts no TablesHome of its own — making a table is the New table dialog", () => {
    expect(HUB.match(/<TablesHome\b/g) ?? []).toEqual([]);
  });
});
