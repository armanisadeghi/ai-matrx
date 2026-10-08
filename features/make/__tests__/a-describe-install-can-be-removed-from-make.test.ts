// A describe install can be removed from /make (lane DESCRIBE-INSTALL, 2026-10-08).
//
// THE REAL USE CASE. "Track my creator posts" made four tables and three forms; once the result card was
// gone, /make listed only "Recently changed" and nothing took them back. The catalogue door now answers
// the organization's installed one-offs (installed_one_offs) and /make draws them with the gallery's own
// Remove. Red before: galleryFilter had no such option and MakeHome drew no such list.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { galleryFilter } from "../gallery/catalogue";

const ORG = "5dc930e9-bd65-44a1-8369-af773f6e1a5b";

describe("the installed one-offs list on /make", () => {
  it("asks the catalogue door for this organization's installed one-offs", () => {
    expect(galleryFilter({}, { installedIn: ORG, installedOneOffs: true })).toMatchObject({ installed_in: ORG, installed_one_offs: true });
    expect(galleryFilter({}, { installedIn: ORG })).not.toHaveProperty("installed_one_offs");
  });
  it("is drawn on /make with the gallery's own preview (Remove) and no second remover", () => {
    const home = readFileSync(join(__dirname, "../MakeHome.tsx"), "utf8");
    expect(home).toMatch(/<InstalledOneOffs \/>/);
    const gallery = readFileSync(join(__dirname, "../gallery/TemplateGallery.tsx"), "utf8");
    expect(gallery).toMatch(/<TemplatePreview templateId=\{card\.id\} bare installedOneOff \/>/);
    expect(home).not.toMatch(/template_uninstall/);
  });
  it("shows an installed one-off only what fits it: no stray Install, no Archive template; Save as my template stays", () => {
    const gallery = readFileSync(join(__dirname, "../gallery/TemplateGallery.tsx"), "utf8");
    expect(gallery).toMatch(/installedOneOff\?: boolean/);
    expect(gallery).toMatch(/installedOneOff && !stuck && run\.phase !== "running" \? null/);
    expect(gallery).toMatch(/card\.scope === "org" && !installedOneOff \? <ArchiveOrgTemplate/);
    expect(gallery).toMatch(/card\.ephemeral \? <KeepOneOff/);
  });
});
