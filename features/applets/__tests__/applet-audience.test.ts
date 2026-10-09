/**
 * USING AN APPLET AND PUTTING IT ON THE WEB ARE SEPARATE CHOICES (audit9 B8).
 *
 * "Use it" opened "Publish …? Anyone with the link can open it … without signing in" with only Cancel /
 * Publish: the only way to use your own Applet was to give it to the world. Now "Use it" asks who can
 * open it — My organization (the default) or Anyone with the link — and both land as ONE write that every
 * surface (list, manage, builder card) reads back through `appletState`.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { APPLET_AUDIENCES, appletAudience, appletState, appletUseConsequence } from "@/features/applets/lib/applet-state";
import { appletAudiencePatch } from "@/features/applets/lib/publication";

const AT = "2026-10-09T00:00:00.000Z";

describe("who can open it", () => {
  it("offers My organization first — the default", () => {
    expect(APPLET_AUDIENCES[0]).toBe("organization");
  });

  it("My organization puts it in use with the web switch off", () => {
    const patch = appletAudiencePatch("organization", AT, "u1");
    expect(patch).toMatchObject({ status: "published", published_to_web: false, published_at: AT });
    const state = appletState({ ...patch, deleted_at: null });
    expect(state.kind).toBe("in_use");
    expect(state.live).toBe(false);
    expect(appletAudience({ ...patch, deleted_at: null })).toBe("organization");
  });

  it("Anyone with the link is the publication — published, on the web", () => {
    const patch = appletAudiencePatch("web", AT, "u1");
    expect(patch).toMatchObject({ status: "published", published_to_web: true });
    expect(appletState({ ...patch, deleted_at: null }).kind).toBe("published");
    expect(appletAudience({ ...patch, deleted_at: null })).toBe("web");
  });

  it("the dialog says who can open it, and only the web choice mentions strangers", () => {
    const org = appletUseConsequence({ name: "Reading List", slug: "reading-list", audience: "organization", tablesToMake: ["Books"] });
    expect(org.title).toBe("Use Reading List?");
    expect(org.description).toContain("your organization");
    expect(org.description).not.toMatch(/without signing in/);
    expect(org.description).toContain("Books");
    const web = appletUseConsequence({ name: "Reading List", slug: "reading-list", audience: "web" });
    expect(web.description).toContain("aimatrx.com/applets/reading-list");
    expect(web.description).toMatch(/without signing in/);
  });
});

describe("the builder's Use it never forces the web", () => {
  const ROOT = path.resolve(__dirname, "../../..");
  const builder = readFileSync(path.join(ROOT, "features/applets-host/builder/AppletBuilder.tsx"), "utf8");
  const publish = readFileSync(path.join(ROOT, "features/applets-host/builder/build-applet.ts"), "utf8");
  it("asks through the audience dialog, not a Publish confirm", () => {
    expect(builder).toContain("<UseAppletDialog");
    expect(builder).not.toContain("publishConsequence");
  });
  it("writes the chosen audience, never the bare publication", () => {
    expect(publish).toContain("appletAudiencePatch(audience");
    expect(publish).not.toContain("appletPublicationPatch(true");
  });
});
