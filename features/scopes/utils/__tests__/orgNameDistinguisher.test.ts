// features/scopes/utils/__tests__/orgNameDistinguisher.test.ts
//
// UI-FIX-19 (VERIFIER-19 #9) — ORGANIZATIONS WITH THE SAME NAME ARE TOLD APART, ON EVERY LIST.
//
// THE USE CASE. admin@admin.com owns three organizations named "Ironclad Mobile Mechanic" (a
// mobile-mechanic crew and two copies a fixture lane made) and two named "Birchwood Avenue
// Renovation". Every list she picks an organization from must key its rows by id and draw each
// shared name with the one thing that differs — the web address — the way GitHub shows
// owner/name. A list of distinct names is unchanged.
//
// The helper suite proves the rule; the census suite fails on any organization list that draws a
// bare name, and on any cmdk item whose identity is a name alone (two same-named rows collapse
// into one inside cmdk). RED on the tree before UI-FIX-19 (the helper did not exist, and the
// census found the Vault chooser, the shortcut scope picker, the hierarchy cascade, the site move
// card and the library publish panel drawing bare names).
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { orgNameDistinguisher, orgRowLabel } from "../formatOrgDisplayName";

const IRONCLADS = [
  { id: "0a751390-558e-4775-ba0e-3891bdf82d45", name: "Ironclad Mobile Mechanic", slug: "ironclad-mobile-mechanic" },
  { id: "9ffd844b-38a4-44d0-8a24-45bb481a002d", name: "Ironclad Mobile Mechanic", slug: "ironclad-mobile-mechanic-9ffd844b" },
  { id: "719980a1-75f1-410f-88aa-0223f38f2872", name: "Ironclad Mobile Mechanic ", slug: "ironclad-mobile-mechanic-719980a1" },
  { id: "837a7e77-9250-40a7-b1a9-a639593729e2", name: "Ironclad Mobile Mechanic — Coachella Valley Route", slug: "ironclad-mobile-mechanic-coachella-valley-route" },
];

describe("the same name, told apart", () => {
  it("draws the address on every row whose name another row carries, and only those", () => {
    expect(IRONCLADS.map((o) => orgNameDistinguisher(o, IRONCLADS))).toEqual([
      "ironclad-mobile-mechanic",
      "ironclad-mobile-mechanic-9ffd844b",
      "ironclad-mobile-mechanic-719980a1",
      null,
    ]);
    const labels = IRONCLADS.map((o) => orgRowLabel(o, IRONCLADS));
    expect(new Set(labels).size).toBe(IRONCLADS.length);
  });

  it("falls back to the id's first characters when a list carries no address", () => {
    const bare = IRONCLADS.map(({ id, name }) => ({ id, name }));
    expect(orgNameDistinguisher(bare[0]!, bare)).toBe("0a751390");
  });
});

const ROOT = join(__dirname, "..", "..", "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

// Every organization list on the platform that draws its own rows (the census, UI-FIX-19). The
// shared `OrganizationPicker` (@ai-matrx/design-system) is not here: it applies the same rule
// through `distinguisher`, which `OrganizationPickerPanel` passes as the slug.
const ORGANIZATION_LISTS = [
  "features/secrets/components/VaultWorkspace.tsx",
  "features/agent-shortcuts/components/ShortcutScopePicker.tsx",
  "features/agent-context/components/hierarchy-selection/useHierarchySelection.ts",
  "features/marketing/components/settings/MoveSiteOrganizationCard.tsx",
  "features/rag/components/library/LibraryPublishPanel.tsx",
];

describe("every organization list tells a shared name apart", () => {
  it.each(ORGANIZATION_LISTS)("%s draws the distinguisher", (rel) => {
    expect(read(rel)).toMatch(/orgNameDistinguisher\(/);
  });

  it("the shared picker is handed the address", () => {
    expect(read("features/organizations/components/OrganizationPickerPanel.tsx")).toMatch(/distinguisher:\s*org\.slug/);
  });

  it("no cmdk item in the hierarchy cascade takes a name alone as its identity", () => {
    const cascade = read("features/agent-context/components/hierarchy-selection/HierarchyCascade.tsx");
    expect(cascade).not.toMatch(/<CommandItem[^>]*\bvalue=\{\s*opt\.name\s*\}/s);
  });
});
