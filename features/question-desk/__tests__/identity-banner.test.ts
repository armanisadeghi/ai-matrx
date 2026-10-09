import { ADMIN_READING_LABEL, identityBannerText } from "../identityBanner";

const SENTENCE = "Signed in as admin@admin.com; this interview is addressed to a@b.co.";

describe("the interview identity banner", () => {
  it("says plainly that an admin is reading, and never tells the admin to switch accounts", () => {
    const text = identityBannerText(SENTENCE, true);
    expect(text).toContain(ADMIN_READING_LABEL);
    expect(text).toContain(SENTENCE);
    expect(text).not.toMatch(/switch accounts/i);
  });
  it("keeps the respondent's warning off the admin seat", () => {
    const text = identityBannerText(SENTENCE, false);
    expect(text).not.toContain(ADMIN_READING_LABEL);
    expect(text).toMatch(/switch accounts/i);
  });
});
