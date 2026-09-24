/**
 * AN EMPTY CREDENTIAL IS A FACT; AN EMPTY READ OF A FULL ONE IS A FAILURE (lane ERRORS-HONEST).
 *
 * The real cases, as the vault list meets them:
 *   - Pinecrest Records keeps one credential, its Bandcamp label login, with nothing typed into it
 *     yet. The database says it holds 0 fields and 0 files → no alarm; the list shows it.
 *   - DD-160: a restrictive policy hid every field of Harbor Point Dental's front-desk login from its
 *     own owner. The database says it holds 2 fields; the read returned none → the alarm, by count.
 *   - The holdings door is not on this database yet → the older whole-vault rule, announced.
 */
import { emptyReadAlarm, holdingsDoorIsAbsent } from "../empty-read";

const BANDCAMP = "d6f2bc7a-db1d-484c-a580-77ffbc1b6123";
const FRONT_DESK = "5a0c7d1e-0b7e-4c5e-9d0f-3f1f3c1b9a21";
const PAYROLL = "9e2b4c6d-1f3a-4b8c-8d7e-2a6c4e8f0b13";

describe("the vault's empty-read alarm", () => {
  it("does not fire for a credential that genuinely holds nothing (Pinecrest's Bandcamp login)", () => {
    expect(
      emptyReadAlarm(1, [BANDCAMP], {
        state: "answered",
        rows: [{ credential_item_id: BANDCAMP, field_count: 0, file_count: 0 }],
      }),
    ).toBeNull();
  });

  it("fires when a credential holds fields the read did not return (DD-160)", () => {
    const alarm = emptyReadAlarm(3, [FRONT_DESK], {
      state: "answered",
      rows: [{ credential_item_id: FRONT_DESK, field_count: 2, file_count: 0 }],
    });
    expect(alarm).toMatch(/^One credential in this vault holds fields or files this screen could not read/);
    expect(alarm).toMatch(/DD-160/);
  });

  it("counts every unreadable credential and ignores the genuinely empty ones beside them", () => {
    const alarm = emptyReadAlarm(4, [BANDCAMP, FRONT_DESK, PAYROLL], {
      state: "answered",
      rows: [
        { credential_item_id: BANDCAMP, field_count: 0, file_count: 0 },
        { credential_item_id: FRONT_DESK, field_count: 2, file_count: 0 },
        { credential_item_id: PAYROLL, field_count: 0, file_count: 1 },
      ],
    });
    expect(alarm).toMatch(/^2 credentials in this vault hold fields or files/);
  });

  it("says nothing when every credential read something", () => {
    expect(emptyReadAlarm(2, [], { state: "answered", rows: [] })).toBeNull();
  });

  it("without the door, keeps the whole-vault rule and announces the stand-in", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    expect(emptyReadAlarm(1, [BANDCAMP], { state: "absent", why: "PGRST202" })).toMatch(
      /^Your vault has 1 item but none of their fields or files could be read/,
    );
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/errorshonest_s8_a_credential_says_how_much_it_holds\.sql/));
    // …and never alarms for a vault where other credentials did read.
    expect(emptyReadAlarm(3, [BANDCAMP], { state: "absent", why: "PGRST202" })).toBeNull();
    warn.mockRestore();
  });

  it("when the door fails, the whole-vault alarm says the check did not answer either", () => {
    expect(emptyReadAlarm(2, [BANDCAMP, FRONT_DESK], { state: "unavailable", why: "statement timeout" })).toMatch(
      /did not answer either: statement timeout\)$/,
    );
  });

  it("reads PostgREST's and Postgres's 'no such function' as an absent door, nothing else", () => {
    expect(holdingsDoorIsAbsent("PGRST202")).toBe(true);
    expect(holdingsDoorIsAbsent("42883")).toBe(true);
    expect(holdingsDoorIsAbsent("42501")).toBe(false);
    expect(holdingsDoorIsAbsent(undefined)).toBe(false);
  });
});
