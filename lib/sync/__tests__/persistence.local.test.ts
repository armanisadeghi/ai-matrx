/**
 * persistence.local.test.ts — localStorage adapter contract.
 *
 * Runs under jsdom (jest.config.ts) — we use the real window.localStorage
 * and `.clear()` between tests rather than stubbing the whole storage object.
 */

import { localStorageAdapter } from "../persistence/local-storage";

describe("localStorageAdapter", () => {
  beforeEach(() => window.localStorage.clear());
  afterAll(() => window.localStorage.clear());

  it("writes and reads a record", () => {
    expect(
      localStorageAdapter.write("matrx:theme", {
        version: 1,
        identityKey: "auth:1",
        body: { mode: "dark" },
      }),
    ).toBe(true);
    const r = localStorageAdapter.read("matrx:theme");
    expect(r).not.toBeNull();
    expect(r!.version).toBe(1);
    expect(r!.identityKey).toBe("auth:1");
    expect(r!.body).toEqual({ mode: "dark" });
  });

  it("returns null when nothing is stored", () => {
    expect(localStorageAdapter.read("matrx:missing")).toBeNull();
  });

  it("returns null for malformed JSON", () => {
    window.localStorage.setItem("matrx:theme", "{not valid");
    expect(localStorageAdapter.read("matrx:theme")).toBeNull();
    // adapter did not throw; storage intact
    expect(window.localStorage.getItem("matrx:theme")).toBe("{not valid");
  });

  it("returns null for records missing version/identity", () => {
    window.localStorage.setItem(
      "matrx:theme",
      JSON.stringify({ body: { mode: "dark" } }),
    );
    expect(localStorageAdapter.read("matrx:theme")).toBeNull();
  });

  it("swallows quota errors on write", () => {
    // Stub setItem to throw.
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new Error("QuotaExceededError");
    };
    try {
      expect(
        localStorageAdapter.write("k", {
          version: 1,
          identityKey: "i",
          body: {},
        }),
      ).toBe(false);
    } finally {
      Storage.prototype.setItem = original;
    }
  });

  it("remove deletes the key", () => {
    localStorageAdapter.write("k", { version: 1, identityKey: "i", body: {} });
    expect(window.localStorage.getItem("k")).not.toBeNull();
    localStorageAdapter.remove("k");
    expect(window.localStorage.getItem("k")).toBeNull();
  });
});
