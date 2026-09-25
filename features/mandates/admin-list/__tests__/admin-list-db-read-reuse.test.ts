/**
 * A REPORT LANDING NEVER RESTARTS THE DATABASE READ (2026-09-25).
 *
 * Every aidream report that lands bumps the list's `version` and the shell
 * re-asks the page. Before this, each re-ask threw away the page read in flight
 * and started it again, so the first rows waited for the LAST report. The
 * database half is now reused while only the reports moved — and read again on
 * a write or a plain refresh, so nothing stale is shown as fresh.
 */
const store = { version: 0, epoch: 0 };

jest.mock("../store", () => ({
  ensureMandateAdminReports: jest.fn(),
  getMandateAdminDbEpoch: () => store.epoch,
  getMandateAdminListState: () => ({ version: store.version }),
  mergeProvisionOffers: jest.fn(),
  recordMandateAdminFailure: jest.fn(),
}));
jest.mock("../rpc", () => ({ callMandateAdminList: jest.fn() }));
jest.mock("@/features/mandates/admin/service", () => ({ fetchMandateConsoleData: jest.fn() }));
jest.mock("@/features/mandates/provisions", () => ({ fetchProvisions: jest.fn() }));

import { readDbOnce } from "../service";

const PAGE = JSON.stringify({ p_mode: "page", p_scope: "system", p_sort: "name" });

describe("the admin mandate list's database half", () => {
  beforeEach(() => {
    store.version += 100; // a fresh window per test; the cache is module-wide
    store.epoch += 100;
  });

  it("identical asks in flight share ONE read", async () => {
    const read = jest.fn(async () => ({ total: 469 }));
    const [a, b] = await Promise.all([readDbOnce(PAGE, read), readDbOnce(PAGE, read)]);
    expect(read).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
  });

  it("a report landing (version moved, no write) reuses the read", async () => {
    const read = jest.fn(async () => ({ total: 469 }));
    await readDbOnce(PAGE, read);
    store.version += 1; // coverage landed
    await readDbOnce(PAGE, read);
    store.version += 1; // the grades landed
    await readDbOnce(PAGE, read);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("a write anywhere reads the database again", async () => {
    const read = jest.fn(async () => ({ total: 469 }));
    await readDbOnce(PAGE, read);
    store.epoch += 1;
    store.version += 1;
    await readDbOnce(PAGE, read);
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("a plain refresh (nothing moved) reads the database again", async () => {
    const read = jest.fn(async () => ({ total: 469 }));
    await readDbOnce(PAGE, read);
    await readDbOnce(PAGE, read);
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("a failed read is never reused", async () => {
    const read = jest
      .fn<Promise<{ total: number }>, []>()
      .mockRejectedValueOnce(new Error("timeout"))
      .mockResolvedValueOnce({ total: 469 });
    await expect(readDbOnce(PAGE, read)).rejects.toThrow("timeout");
    store.version += 1;
    await expect(readDbOnce(PAGE, read)).resolves.toEqual({ total: 469 });
    expect(read).toHaveBeenCalledTimes(2);
  });
});
