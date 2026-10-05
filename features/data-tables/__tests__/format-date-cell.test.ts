/**
 * grid-parity `formats.all`, defect #2: a `date` column rendered one day
 * early and with a time attached (`Due` stored as `2026-01-01` showed as
 * `12/31/2025, 4:00:00 PM` under the old `new Date(value).toLocaleString()`
 * path — confirmed live against the fixture with
 * `node scripts/grid-parity/compare.mjs --only formats.all`).
 *
 * Forced to a negative-offset zone so the bug (which only shows up west of
 * UTC) reproduces the same way in CI as it did on the reviewer's machine.
 */
import { formatDateCellDisplay } from "../format-date-cell";

describe("formatDateCellDisplay", () => {
  const originalTz = process.env.TZ;

  beforeAll(() => {
    process.env.TZ = "America/Los_Angeles";
  });

  afterAll(() => {
    process.env.TZ = originalTz;
  });

  it("renders a `date` column as the stored calendar day, with no time", () => {
    const display = formatDateCellDisplay("2026-01-01", "date");
    expect(display).not.toMatch(/2025/);
    expect(display).not.toMatch(/:/);
    expect(display).toContain("2026");
    expect(display.toLowerCase()).toContain("jan");
  });

  it("still renders a `datetime` column as a real local timestamp, with a time", () => {
    // A genuine UTC timestamp — this one really does shift into the
    // viewer's local zone, and it keeps its time-of-day.
    const display = formatDateCellDisplay("2026-01-01T23:00:00Z", "datetime");
    expect(display).toMatch(/:/);
  });
});
