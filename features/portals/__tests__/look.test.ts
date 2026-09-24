/**
 * Lane S6 — the look a portal draws, from what the store resolved (`custom._portal_style`).
 * Real use case: Rincon Plumbing Co's portal for property managers.
 */
import { monogram, portalLook } from "../look";
import type { PortalStyle } from "../service";

const rincon: PortalStyle = {
  display_name: "Rincon Plumbing",
  welcome: "Your buildings' service calls, gate codes and invoices, in one place.",
  logo_file_id: "7abfb7b8-8a96-4df9-a0e5-bd77a341f330",
  logo_url: "https://cdn.matrxserver.com/87a6e699/7abfb7b8?v=796a6f3c",
  accent: "blue",
  footer_links: [
    { label: "Call dispatch", url: "tel:+1 (805) 555-0142" },
    { label: "Email the office", url: "mailto:office@rinconplumbing.test" },
    { label: "Our website", url: "https://rinconplumbing.test" },
    { label: "Sneaky", url: "javascript:alert(1)" },
    { label: "", url: "https://no-label.test" },
  ],
  from_organization: [],
};

describe("a portal's look", () => {
  it("carries the business's own name, welcome, logo and colour", () => {
    const look = portalLook(rincon, "Rincon Plumbing Co");
    expect(look.name).toBe("Rincon Plumbing");
    expect(look.welcome).toMatch(/service calls/);
    expect(look.logoUrl).toBe(rincon.logo_url);
    expect(look.bandClass).toBe("bg-blue-500");
    expect(look.tintClass).toContain("bg-blue-50");
  });

  it("keeps only the links the store accepts, with a dialable phone number", () => {
    const look = portalLook(rincon, "Rincon Plumbing Co");
    expect(look.footerLinks).toEqual([
      { label: "Call dispatch", href: "tel:+18055550142", external: false },
      { label: "Email the office", href: "mailto:office@rinconplumbing.test", external: false },
      { label: "Our website", href: "https://rinconplumbing.test", external: true },
    ]);
  });

  it("is never blank: no look of its own shows the organization's name and the app's colour", () => {
    const bare: PortalStyle = {
      display_name: "Ironclad Mobile Mechanic",
      welcome: null,
      logo_file_id: null,
      logo_url: null,
      accent: null,
      footer_links: [],
      from_organization: ["display_name"],
    };
    const look = portalLook(bare, "Ironclad Mobile Mechanic");
    expect(look.name).toBe("Ironclad Mobile Mechanic");
    expect(look.bandClass).toBeNull();
    expect(look.logoUrl).toBeNull();
    expect(monogram(look.name)).toBe("I");
    // A database older than lane S6 sends no style at all.
    expect(portalLook(undefined, "Rincon Plumbing Co").name).toBe("Rincon Plumbing Co");
  });

  it("refuses a colour that is not a design-system name and a logo that is not https", () => {
    const odd = { ...rincon, accent: "#ff00ff" as unknown as PortalStyle["accent"], logo_url: "http://insecure.test/logo.png" };
    const look = portalLook(odd, "Rincon Plumbing Co");
    expect(look.bandClass).toBeNull();
    expect(look.logoUrl).toBeNull();
  });
});
