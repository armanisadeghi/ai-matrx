import { comparableHandle, findSavedAccount, resolveTrackOutcome } from "./track-outcome";

const base = {
  isRefusal: (e: unknown) => e instanceof RangeError,
  refusalMessage: (e: unknown) => (e as Error).message,
  transportMessage: (e: unknown) => (e as Error).message,
};

describe("comparableHandle", () => {
  it("reduces handles and links to the same name", () => {
    expect(comparableHandle("@LaJollaKayak")).toBe("lajollakayak");
    expect(comparableHandle("https://www.instagram.com/lajollakayak/?hl=en")).toBe("lajollakayak");
    expect(comparableHandle("https://www.reddit.com/r/sandiegokayaking")).toBe("sandiegokayaking");
    expect(comparableHandle("u/harborlightkayak")).toBe("harborlightkayak");
  });
});

describe("findSavedAccount", () => {
  const rows = [{ trackedAccountId: "t1", platform: "instagram", handle: "lajollakayak" }];
  it("matches platform and handle", () => {
    expect(findSavedAccount(rows, "instagram", "https://instagram.com/LaJollaKayak/")?.trackedAccountId).toBe("t1");
  });
  it("does not match another platform or handle", () => {
    expect(findSavedAccount(rows, "facebook", "lajollakayak")).toBeNull();
    expect(findSavedAccount(rows, "instagram", "someoneelse")).toBeNull();
  });
});

describe("resolveTrackOutcome", () => {
  it("returns the answer when the call answers", async () => {
    const r = await resolveTrackOutcome({ ...base, call: async () => ({ trackedAccountId: "a" }), verify: async () => null });
    expect(r).toEqual({ ok: true, unavailable: false, trackedAccountId: "a", message: null });
  });
  it("a dropped stream whose account was saved is a success, never 'not saved'", async () => {
    const r = await resolveTrackOutcome({
      ...base,
      call: async () => {
        throw new TypeError("network error");
      },
      verify: async () => "saved-id",
    });
    expect(r.ok).toBe(true);
    expect(r.unavailable).toBe(false);
    expect(r.trackedAccountId).toBe("saved-id");
  });
  it("a dropped stream with nothing saved is a connection failure", async () => {
    const r = await resolveTrackOutcome({
      ...base,
      call: async () => {
        throw new TypeError("network error");
      },
      verify: async () => null,
    });
    expect(r).toMatchObject({ ok: false, unavailable: true });
  });
  it("a refusal is reported as the refusal and is not re-read", async () => {
    const verify = jest.fn(async () => "x");
    const r = await resolveTrackOutcome({
      ...base,
      call: async () => {
        throw new RangeError("Profile is private");
      },
      verify,
    });
    expect(r).toMatchObject({ ok: false, unavailable: false, message: "Profile is private" });
    expect(verify).not.toHaveBeenCalled();
  });
});
