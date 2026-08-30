// The legacy `?feature=` deep-link shim is LOAD-BEARING: 25+ doors across the
// app emit the old form. These tests pin the normalization contract.
import {
  featureFilters,
  legacyFeatureRedirect,
  mandatesBrowseHref,
} from "../url-compat";

describe("mandates browse url-compat", () => {
  it("builds the canonical filters value for a feature", () => {
    expect(featureFilters("podcast")).toEqual({
      feature: { kind: "select", values: ["podcast"] },
    });
  });

  it("builds a canonical browse href that round-trips through JSON", () => {
    const href = mandatesBrowseHref("podcast");
    const filters = new URLSearchParams(href.split("?")[1]).get("filters");
    expect(JSON.parse(filters ?? "")).toEqual(featureFilters("podcast"));
  });

  it("bare href when no feature", () => {
    expect(mandatesBrowseHref()).toBe("/agents/mandates");
    expect(mandatesBrowseHref("  ")).toBe("/agents/mandates");
  });

  it("redirects the legacy form onto the canonical form", () => {
    const target = legacyFeatureRedirect({ feature: "podcast" });
    expect(target).toBe(mandatesBrowseHref("podcast"));
  });

  it("array param takes the first value (Next searchParams shape)", () => {
    expect(legacyFeatureRedirect({ feature: ["sms", "podcast"] })).toBe(
      mandatesBrowseHref("sms"),
    );
  });

  it("never redirects when canonical filters are already present", () => {
    expect(
      legacyFeatureRedirect({ feature: "podcast", filters: "{}" }),
    ).toBeNull();
  });

  it("never redirects without the legacy param", () => {
    expect(legacyFeatureRedirect({})).toBeNull();
  });
});
