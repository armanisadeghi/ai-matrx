/**
 * ONE STATE, EVERY SURFACE — lane Y, 2026-10-08.
 *
 * The audit: after "Use it" one Applet read "Live v13" in the builder, "Published" in the /applets list
 * and "Draft" (still offering Publish) in the manage header — three hand-written derivations over three
 * stored fields (status, published_to_web, deleted_at), and "Use it" wrote only one of the two
 * publication fields. And the shown version was `version`, the row's write counter, so opening the
 * builder moved it.
 *
 * Guards: `appletState` is the one answer (truth table below); every surface that names an Applet's
 * state or version reads it — none re-derives from `status === "published"` or shows `.version`.
 * Red at the commit before lane Y (the header, overview, settings, builder and list each derived their
 * own), green after.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { appletState, appletVersionLabel, publishConsequence } from "@/features/applets/lib/applet-state";
import { appletPublicationPatch } from "@/features/applets/lib/publication";

const ROOT = path.resolve(__dirname, "../../..");
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");

describe("appletState — the one answer", () => {
  it("published only when status AND published_to_web say so", () => {
    expect(appletState({ status: "published", published_to_web: true, deleted_at: null }).label).toBe("Published");
    expect(appletState({ status: "published", published_to_web: false, deleted_at: null }).label).toBe("Draft");
    expect(appletState({ status: "draft", published_to_web: true, deleted_at: null }).label).toBe("Draft");
    expect(appletState({ status: "draft", published_to_web: false }).live).toBe(false);
  });

  it("archived is deleted_at, and it wins over every status", () => {
    expect(appletState({ status: "published", published_to_web: true, deleted_at: "2026-10-08T00:00:00Z" }).kind).toBe("archived");
    expect(appletState({ status: "suspended", published_to_web: false, deleted_at: "2026-10-08T00:00:00Z" }).kind).toBe("archived");
  });

  it("suspended reads Suspended, never Draft", () => {
    expect(appletState({ status: "suspended", published_to_web: true }).label).toBe("Suspended");
  });

  it("the publication transition always lands on Published / Draft, never half", () => {
    expect(appletState({ ...appletPublicationPatch(true), deleted_at: null }).label).toBe("Published");
    expect(appletState({ ...appletPublicationPatch(false), deleted_at: null }).label).toBe("Draft");
  });

  it("shows the content version, and nothing before the first build", () => {
    expect(appletVersionLabel(3)).toBe("v3");
    expect(appletVersionLabel(0)).toBeNull();
  });

  it("Publish / Use it names the public link and every table it creates, before acting", () => {
    const { title, description } = publishConsequence({ name: "Guest Tracker", slug: "guest-tracker", tablesToMake: ["Podcast Guests"] });
    expect(title).toBe("Publish Guest Tracker?");
    expect(description).toContain("aimatrx.com/applets/guest-tracker");
    expect(description).toContain("Podcast Guests");
  });
});

describe("every surface reads appletState — no surface derives its own", () => {
  const SURFACES = [
    "features/applets/browse/service.ts",
    "features/applets/components/route-header/AppletHeader.tsx",
    "features/applets/route/AppletOverviewContent.tsx",
    "features/applets/route/AppletSettingsContent.tsx",
    "features/applets-host/builder/AppletBuilder.tsx",
    "features/code/library-sources/adapters/aga-apps.ts",
    "features/files/virtual-sources/adapters/aga-apps.ts",
  ];
  it.each(SURFACES)("%s", (file) => {
    const src = read(file);
    expect(src).toContain("appletState(");
    // A hand-written "is it published?" is the defect class (three surfaces, three answers).
    expect(src).not.toMatch(/status\s*===\s*["']published["']/);
    expect(src).not.toMatch(/status\s*!==\s*["']published["']/);
  });

  it("the list column renders the row's state, the builder shows the content version", () => {
    expect(read("features/applets/browse/columns.tsx")).toContain("row.state.label");
    const builder = read("features/applets-host/builder/AppletBuilder.tsx");
    expect(builder).not.toMatch(/saved\.version\b/);
    expect(builder).toContain("saved.content_version");
    expect(read("features/applets/route/AppletOverviewContent.tsx")).not.toMatch(/`Version \$\{app\.version\}`/);
  });
});
