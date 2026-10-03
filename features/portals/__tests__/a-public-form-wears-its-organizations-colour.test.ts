/**
 * MAKE-HOME W5 — a public form wears its organization's look. Real use case: Cedar Ridge Physical
 * Therapy's new-patient intake in teal with a clinic photo as its cover, and Rincon Plumbing's
 * request form in blue with no cover.
 *
 * The breaks this catches: the accent not reaching the page's primary colour (buttons and the
 * progress line stay the app's blue), only `--primary` overridden (Tailwind's `--color-primary` is
 * computed at the root, so nothing changes), and a non-https cover being drawn.
 */
import { portalLook } from "../look";
import type { PortalStyle } from "../service";

function style(over: Partial<PortalStyle>): PortalStyle {
  return {
    display_name: "Cedar Ridge Physical Therapy",
    welcome: null,
    logo_file_id: null,
    logo_url: null,
    accent: null,
    footer_links: [],
    from_organization: ["display_name"],
    cover_url: null,
    ...over,
  };
}

describe("a public form's colour and cover", () => {
  it.each([
    ["teal", "hsl(175 84% 30%)"],
    ["blue", "hsl(221 83% 50%)"],
  ] as const)("%s becomes the page's resolved primary colour", (accent, colour) => {
    const vars = portalLook(style({ accent }), "Cedar Ridge Physical Therapy").primaryVars;
    expect(vars?.["--color-primary"]).toBe(colour);
    expect(vars?.["--color-ring"]).toBe(colour);
    expect(vars?.["--color-primary-foreground"]).toBe("hsl(0 0% 100%)");
  });

  it("leaves the app's own colour when the look has none", () => {
    expect(portalLook(style({ accent: null }), "Cedar Ridge Physical Therapy").primaryVars).toBeNull();
  });

  it("draws a cover only from a secure public address", () => {
    const cover = "https://cdn.matrxserver.com/0a54df90/clinic-front-desk.jpg?v=1c2d3e4f";
    expect(portalLook(style({ cover_url: cover }), "x").coverUrl).toBe(cover);
    expect(portalLook(style({ cover_url: "http://cdn.matrxserver.com/clinic.jpg" }), "x").coverUrl).toBeNull();
    expect(portalLook(style({}), "x").coverUrl).toBeNull();
  });
});
