// DRILL-PARITY-LAST — the old users usage page's "Last activity" is a moment Measure (unit "time"):
// the door sends ISO text, the explorer carries it as epoch ms and reads it as a local date and time;
// a moment never adds up. Total tokens (a sum_of) is a plain token count.

import { formatAbsoluteDate } from "@ai-matrx/kit/format";

import { drillUnitAdds, drillUnitFormatter } from "../measureFormat";
import { drillRowOf, drillValueNumber } from "../useDrillExplorer";

describe("a moment Measure (Last active)", () => {
  it("the door's ISO text is carried as epoch ms; numbers and numeric text stay numbers", () => {
    expect(drillValueNumber("2026-09-30T14:00:00+00:00")).toBe(Date.parse("2026-09-30T14:00:00Z"));
    expect(drillValueNumber("12.5")).toBe(12.5);
    expect(drillValueNumber(7)).toBe(7);
    expect(drillValueNumber("not a value")).toBeNull();
  });

  it("an answer row keeps the moment beside its numbers", () => {
    const row = drillRowOf({ groups: { person: "p-1" }, measures: { cost: "1.5", last_activity: "2026-09-30T14:00:00+00:00" }, row_count: 3 });
    expect(row.measures).toEqual({ cost: 1.5, last_activity: Date.parse("2026-09-30T14:00:00Z") });
  });

  it("reads as the viewer's local date and time, a blank as a dash, and never adds up", () => {
    const at = Date.parse("2026-09-30T14:00:00Z");
    const time = drillUnitFormatter("time", "points");
    expect(time(at)).toBe(formatAbsoluteDate(at, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }, "—"));
    expect(time(at)).not.toMatch(/^[\d,]+$/);
    expect(time(null)).toBe("—");
    expect(drillUnitAdds("time")).toBe(false);
    expect(drillUnitAdds("tokens")).toBe(true);
  });
});
