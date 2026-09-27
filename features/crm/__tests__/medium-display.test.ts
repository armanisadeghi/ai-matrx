import { mediumDisplay } from "../reachability";
import type { ContactMediumRow } from "../types";

function medium(overrides: Partial<ContactMediumRow>): ContactMediumRow {
  return {
    channel: "email",
    display_value: null,
    value_raw: null,
    value_key: "",
    handle: null,
    platform_slug: null,
    profile_url: null,
    ...overrides,
  } as ContactMediumRow;
}

describe("mediumDisplay — the one way a contact value becomes text", () => {
  it("keeps a platform id's case, names the platform, and links the profile", () => {
    // The real /crm/64c038c5… row: the lowercased dedupe key used to be shown.
    const shown = mediumDisplay(
      medium({
        channel: "external_id",
        display_value: "uc0dzj1pna_fp0mu6upskv5w",
        value_raw: "UC0DZj1PNa_Fp0MU6uPSKv5w",
        value_key: "uc0dzj1pna_fp0mu6upskv5w",
        platform_slug: "youtube",
        profile_url: "https://www.youtube.com/channel/UC0DZj1PNa_Fp0MU6uPSKv5w",
      }),
    );
    expect(shown).toEqual({
      text: "UC0DZj1PNa_Fp0MU6uPSKv5w",
      raw: null,
      platform: "YouTube",
      href: "https://www.youtube.com/channel/UC0DZj1PNa_Fp0MU6uPSKv5w",
    });
  });

  it("shows a platform identity by its handle, else the record's own name", () => {
    const channel = medium({
      channel: "external_id",
      value_raw: "UC0DZj1PNa_Fp0MU6uPSKv5w",
      platform_slug: "youtube",
    });
    expect(mediumDisplay(channel, "Cloud Codes")).toMatchObject({
      text: "Cloud Codes",
      raw: "UC0DZj1PNa_Fp0MU6uPSKv5w",
    });
    expect(mediumDisplay({ ...channel, handle: "cloudcodes" }, "Cloud Codes").text).toBe("@cloudcodes");
  });

  it("keeps the formatted display value for email and phone", () => {
    expect(
      mediumDisplay(
        medium({ channel: "phone", display_value: "+1 949 555 0100", value_raw: "9495550100" }),
      ).text,
    ).toBe("+1 949 555 0100");
    expect(
      mediumDisplay(medium({ channel: "email", display_value: "a@b.com", value_raw: "A@B.com" })).text,
    ).toBe("a@b.com");
  });

  it("never links a non-http profile value", () => {
    expect(
      mediumDisplay(medium({ channel: "url", value_raw: "x", profile_url: "javascript:alert(1)" })).href,
    ).toBeNull();
  });
});
