import {
  accountKey,
  lookupFor,
  lookupReducer,
  needsPlatformPick,
  resolveAccountInput,
  savedAccount,
  shouldLookUp,
  type FoundAccount,
  type LookupState,
} from "../account-input";

const found: FoundAccount = {
  profileId: "p1",
  platform: "tiktok",
  handle: "vasarostyle",
  displayName: "Vasaro Style",
  avatarUrl: null,
  hasStoredAvatar: false,
  followers: 1200,
  source: "cache",
};
const idle: LookupState = { state: "idle" };

describe("resolveAccountInput", () => {
  it("every TikTok variation lands on the same account", () => {
    const keys = [
      "https://www.tiktok.com/@vasarostyle",
      "https://tiktok.com/@vasarostyle",
      "tiktok.com/@vasarostyle",
      "@vasarostyle",
      "vasarostyle",
    ].map((text) => {
      const parsed = resolveAccountInput({ text, contextPlatform: "tiktok" });
      expect(parsed.status).toBe("ok");
      return parsed.status === "ok" ? accountKey(parsed) : "";
    });
    expect(new Set(keys)).toEqual(new Set(["tiktok:vasarostyle"]));
  });

  it("the person's pick beats the context for a bare handle; a link beats both", () => {
    expect(resolveAccountInput({ text: "abc", picked: "x", contextPlatform: "tiktok" })).toMatchObject({ platform: "x" });
    expect(resolveAccountInput({ text: "instagram.com/abc", picked: "x", contextPlatform: "tiktok" })).toMatchObject({
      platform: "instagram",
      detected: true,
    });
  });
});

describe("needsPlatformPick", () => {
  it("shows only for a bare handle with nothing to say which platform", () => {
    expect(needsPlatformPick(resolveAccountInput({ text: "abc" }))).toBe(true);
    expect(needsPlatformPick(resolveAccountInput({ text: "abc", contextPlatform: "tiktok" }), "tiktok")).toBe(false);
    expect(needsPlatformPick(resolveAccountInput({ text: "tiktok.com/@abc" }))).toBe(false);
    expect(needsPlatformPick(resolveAccountInput({ text: "" }))).toBe(false);
  });
});

describe("lookup state", () => {
  const parsed = resolveAccountInput({ text: "@vasarostyle", contextPlatform: "tiktok" });
  const key = "tiktok:vasarostyle";

  it("start -> found, and the result belongs to the account in the field", () => {
    let s = lookupReducer(idle, { type: "start", key });
    expect(s.state).toBe("checking");
    s = lookupReducer(s, { type: "found", key, account: found });
    expect(lookupFor(s, parsed)).toMatchObject({ state: "found" });
  });

  it("an answer for an account the person has since left is dropped", () => {
    const s = lookupReducer(lookupReducer(idle, { type: "start", key }), { type: "start", key: "tiktok:other" });
    expect(lookupReducer(s, { type: "found", key, account: found })).toEqual(s);
  });

  it("editing the field to another account shows no stale result", () => {
    const s = lookupReducer(lookupReducer(idle, { type: "start", key }), { type: "found", key, account: found });
    const other = resolveAccountInput({ text: "someoneelse", contextPlatform: "tiktok" });
    expect(lookupFor(s, other)).toEqual(idle);
    expect(lookupFor(s, resolveAccountInput({ text: "" }))).toEqual(idle);
  });

  it("not found and failed are honest states, and a miss returns to idle for the one paid fetch", () => {
    const checking = lookupReducer(idle, { type: "start", key });
    expect(lookupReducer(checking, { type: "not_found", key, message: "Couldn't find that account" })).toMatchObject({ state: "not_found" });
    expect(lookupReducer(checking, { type: "failed", key, message: "Out of points" })).toMatchObject({ state: "failed", message: "Out of points" });
    expect(lookupReducer(checking, { type: "miss", key })).toEqual(idle);
  });

  it("a lookup starts only for a complete account nothing has answered yet", () => {
    expect(shouldLookUp(idle, parsed)).toBe(true);
    expect(shouldLookUp({ state: "checking", key }, parsed)).toBe(false);
    expect(shouldLookUp({ state: "found", key, account: found }, parsed)).toBe(false);
    expect(shouldLookUp(idle, resolveAccountInput({ text: "" }))).toBe(false);
    expect(shouldLookUp(idle, resolveAccountInput({ text: "bare" }))).toBe(false);
  });

  it("a failed lookup never stops the account being saved", () => {
    const failed: LookupState = { state: "failed", key, message: "Out of points" };
    expect(savedAccount(parsed, failed)).toEqual({
      platform: "tiktok",
      handle: "vasarostyle",
      url: "https://www.tiktok.com/@vasarostyle",
      displayName: null,
    });
  });

  it("the found name comes along when there is one", () => {
    expect(savedAccount(parsed, { state: "found", key, account: found })?.displayName).toBe("Vasaro Style");
  });

  it("nothing to save until the field is a complete account", () => {
    expect(savedAccount(resolveAccountInput({ text: "" }), idle)).toBeNull();
    expect(savedAccount(resolveAccountInput({ text: "https://example.com/x" }), idle)).toBeNull();
  });
});
