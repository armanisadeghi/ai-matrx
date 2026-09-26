jest.mock("../config", () => ({
  MODULE_HOME: "/administration",
  MODULE_NAME: "Administration",
  filteredPages: [],
}));
import { buildAdminTree, getAdminCrumbs } from "./route-tree";

it("keeps parameter templates out of admin breadcrumb destinations", () => {
  const tree = buildAdminTree([
    "mandates",
    "mandates/[mandateKey]",
    "mandates/new",
    "files/[...path]",
    "docs/[[...slug]]",
  ]);
  const crumbs = getAdminCrumbs(
    tree,
    "/administration/mandates/research_client.output_slides",
  );
  expect(crumbs[1].children.map((child) => child.fullPath)).toEqual([
    "/administration/mandates/new",
  ]);
  expect(crumbs[2].fullPath).toBe(
    "/administration/mandates/research_client.output_slides",
  );
  expect(JSON.stringify(tree)).not.toContain("[mandateKey]");
});

it.each(["new", "advanced"])(
  "preserves static mandate page name %s",
  (segment) => {
    const tree = buildAdminTree([
      "mandates",
      "mandates/new",
      "mandates/advanced",
    ]);
    const crumbs = getAdminCrumbs(tree, `/administration/mandates/${segment}`);
    expect(crumbs[2].label).toBe(segment[0].toUpperCase() + segment.slice(1));
  },
);

// VERIFIER-25: the organization scope console's crumb printed "884d1ce8 7b49 4fba …". A record's
// own address says the record's kind until the page publishes its name (`useRecordTitle`), which
// AdminBreadcrumbs then shows instead — never the identifier title-cased.
it("a record's uuid crumb says its kind, never the identifier", () => {
  const tree = buildAdminTree([
    "scopes-context",
    "scopes-context/organizations",
    "scopes-context/organizations/[orgId]",
    "chat/cx-dashboard/conversations",
    "chat/cx-dashboard/conversations/[id]",
    "knowledge/podcasts/shows/[showId]/episodes/[episodeId]",
  ]);
  const org = getAdminCrumbs(
    tree,
    "/administration/scopes-context/organizations/884d1ce8-7b49-4fba-9d2e-0c5a1f3e7b21",
  );
  expect(org.at(-1)!.label).toBe("Organization");
  expect(org.map((c) => c.label).join(" ")).not.toMatch(/884d1ce8/);
  const conversation = getAdminCrumbs(
    tree,
    "/administration/chat/cx-dashboard/conversations/5b0e3c1a-2f4d-4e8b-9a61-0c0ffee00025",
  );
  expect(conversation.at(-1)!.label).toBe("Conversation");
  // A key that is not a uuid keeps its words.
  expect(getAdminCrumbs(tree, "/administration/scopes-context/organizations/new").at(-1)!.label).toBe("New");
});
