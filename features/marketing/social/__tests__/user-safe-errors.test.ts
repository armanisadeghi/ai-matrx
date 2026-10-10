
import { describeSocialFailure } from "../failure";
import { socialErrorMessage, socialErrorUserCode } from "../server";
import { SocialStreamError } from "../stream";

const LEAK = /scrapecreators|grok|no provider|unsupported \(|get_profile|\/v\d\/|provider|social_/i;

describe("no vendor or router text reaches a screen", () => {
  it("the exact developer message the tester saw is replaced by a plain sentence", () => {
    const raw = "get_profile: no provider answered — scrapecreators: unsupported (get_profile on reddit); grok_x: unsupported (get_profile on reddit)";
    const err = new SocialStreamError("social_unsupported", raw);
    expect(socialErrorMessage(err, "That could not be read.")).not.toMatch(LEAK);
    const f = describeSocialFailure(err);
    expect(`${f.title} ${f.reason}`).not.toMatch(LEAK);
  });

  it("branches on the server's user code", () => {
    for (const [c, kind] of [["private", "restricted"], ["restricted", "restricted"], ["blocked", "busy"], ["temporarily_unavailable", "busy"], ["not_found", "other"], ["unsupported_platform", "other"]] as const) {
      const err = new SocialStreamError("social_not_found", "x", { user_code: c });
      expect(socialErrorUserCode(err)).toBe(c);
      expect(describeSocialFailure(err).kind).toBe(kind);
    }
  });

  it("a real not-found no longer claims the page is private", () => {
    const err = new SocialStreamError("social_not_found", "x", { user_code: "not_found" });
    expect(socialErrorMessage(err, "")).not.toMatch(/private/i);
  });
});
