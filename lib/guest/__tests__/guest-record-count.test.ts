/**
 * The sign-up / login pages tell a guest how many records come with them (lane F12): the count is the
 * guest's own `app.guest_save_status`, read through the guest cookie, and says nothing when there is none.
 */
const getAll = jest.fn();
const rpc = jest.fn();
const getClaims = jest.fn();

jest.mock("server-only", () => ({}));
jest.mock("next/headers", () => ({ cookies: async () => ({ getAll }) }));
jest.mock("@supabase/ssr", () => ({
  createServerClient: () => ({ auth: { getClaims }, schema: () => ({ rpc }) }),
}));

import { guestRecordsNote, readGuestRecordCount } from "@/lib/guest/guest-record-count";

describe("readGuestRecordCount", () => {
  beforeEach(() => {
    getAll.mockReset();
    rpc.mockReset();
    getClaims.mockReset();
  });

  it("reads the guest's saved count from its own session", async () => {
    getAll.mockReturnValue([{ name: "sb-matrx-guest", value: "x" }]);
    getClaims.mockResolvedValue({ data: { claims: { sub: "g", is_anonymous: true } } });
    rpc.mockResolvedValue({ data: { saved: 3, reminder_at: 3, ceiling: 25 }, error: null });
    await expect(readGuestRecordCount()).resolves.toBe(3);
    expect(rpc).toHaveBeenCalledWith("guest_save_status", {});
  });

  it("is 0 with no guest cookie (and asks nothing)", async () => {
    getAll.mockReturnValue([{ name: "sb-main-auth-token", value: "x" }]);
    await expect(readGuestRecordCount()).resolves.toBe(0);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("is 0 when the cookie is not an anonymous session", async () => {
    getAll.mockReturnValue([{ name: "sb-matrx-guest", value: "x" }]);
    getClaims.mockResolvedValue({ data: { claims: { sub: "g", is_anonymous: false } } });
    await expect(readGuestRecordCount()).resolves.toBe(0);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("is 0 and screams when the read fails", async () => {
    const err = jest.spyOn(console, "error").mockImplementation(() => undefined);
    getAll.mockReturnValue([{ name: "sb-matrx-guest", value: "x" }]);
    getClaims.mockResolvedValue({ data: { claims: { is_anonymous: true } } });
    rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    await expect(readGuestRecordCount()).resolves.toBe(0);
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });
});

describe("guestRecordsNote", () => {
  it("is one plain line, singular and plural, and null for none", () => {
    expect(guestRecordsNote(3)).toBe("Your 3 records come with you.");
    expect(guestRecordsNote(1)).toBe("Your 1 record comes with you.");
    expect(guestRecordsNote(0)).toBeNull();
  });
});
