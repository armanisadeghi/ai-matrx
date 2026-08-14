import type { CmsPageMapEntry } from "../setup/bridge";
import type { PlanNodeRow } from "../types";
import { computePlanDrift } from "./drift";

const node = (overrides: Partial<PlanNodeRow> = {}): PlanNodeRow => ({
  attributes: {},
  brief: [],
  cluster_label: null,
  created_at: "2026-08-13T00:00:00Z",
  created_by: null,
  deleted_at: null,
  depth: 0,
  id: "node-home",
  label: "Home",
  meta_description: null,
  meta_title: null,
  metadata: {},
  needs_reviewer: false,
  node_type: "home",
  organization_id: "org-1",
  page_type_id: null,
  parent_id: null,
  pillar_label: null,
  primary_keyword_id: null,
  priority: null,
  route: "/",
  site_id: "site-1",
  slug: "home",
  status_id: null,
  technical_depth: null,
  updated_at: "2026-08-13T00:00:00Z",
  updated_by: null,
  version: 1,
  visibility: "personal",
  ...overrides,
});

const page = (overrides: Partial<CmsPageMapEntry> = {}): CmsPageMapEntry => ({
  pageId: "page-home",
  planNodeId: "node-home",
  route: "/home",
  title: "Home",
  isPublished: false,
  hasDraft: true,
  isHomePage: true,
  liveUrl: null,
  previewUrl: "https://preview.example.com/",
  planExcludedAt: null,
  ...overrides,
});

describe("computePlanDrift", () => {
  it("treats a designated home page as root even when its stored route is /home", () => {
    const home = node();
    const cmsHome = page();
    const model = computePlanDrift({
      nodes: [home],
      cmsPages: [cmsHome],
      pagesByNodeId: new Map([[home.id, cmsHome]]),
      reality: null,
    });

    expect(model.counts.conflicts).toBe(0);
    expect(model.byNodeId.get(home.id)).toMatchObject({
      kind: "ghost",
      reason: "not_published",
    });
  });

  it("still reports a real non-home route conflict", () => {
    const about = node({
      id: "node-about",
      label: "About",
      node_type: "article",
      route: "/about",
      slug: "about",
    });
    const cmsAbout = page({
      pageId: "page-about",
      planNodeId: about.id,
      title: "About",
      route: "/company",
      isHomePage: false,
    });
    const model = computePlanDrift({
      nodes: [about],
      cmsPages: [cmsAbout],
      pagesByNodeId: new Map([[about.id, cmsAbout]]),
      reality: null,
    });

    expect(model.counts.conflicts).toBe(1);
    expect(model.byNodeId.get(about.id)).toMatchObject({
      kind: "conflict",
      nodeRoute: "/about",
      pageRoute: "/company",
    });
  });
});
