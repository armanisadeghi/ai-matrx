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
