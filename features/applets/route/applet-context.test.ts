import { buildAppletBundle, type AppletBundleSource } from "./applet-context";

const base: AppletBundleSource = {
  id: "0d2b45a2-bf89-4e74-a212-bbaec63904cd",
  slug: "holloway-content",
  name: "Content & approvals",
  tagline: "Posts, clients & approvals.",
  description: null,
  status: "published",
  published_to_web: true,
  category: null,
  tags: [],
  content_version: 3,
  entry: "App.tsx",
  files: { "App.tsx": "export default function App() { return null; }", "Approvals.tsx": "x".repeat(20_000) },
  pages: [{ path: "/", title: "Posts", file: "App.tsx" }, { path: "/approvals", title: "Approvals", file: "Approvals.tsx" }],
  mandates: [{ alias: "polish", key: "brand.voice_rewrite" }],
  sources: [{ alias: "posts", table_id: "t-1", organization_id: "o-1" }, { alias: "contacts", entity: "party" }],
  total_executions: 12,
  success_rate: null,
  last_execution_at: null,
};

it("packs the open Applet as one escaped XML element: pages, jobs, sources, file sizes", () => {
  const xml = buildAppletBundle(base, "settings");
  expect(xml.startsWith('<applet id="0d2b45a2')).toBe(true);
  expect(xml).toContain('public_url="/applets/holloway-content"');
  expect(xml).toContain('view="settings"');
  expect(xml).toContain("&amp; approvals");
  expect(xml).toContain('<page path="/approvals" title="Approvals" file="Approvals.tsx"/>');
  expect(xml).toContain('<job alias="polish" key="brand.voice_rewrite"/>');
  expect(xml).toContain('<source alias="contacts" entity="party"/>');
  expect(xml).toContain('<file name="Approvals.tsx" chars="20000"/>');
  expect(xml).not.toContain("xxxxxxxx");
  expect(xml.length).toBeLessThanOrEqual(9000);
});

it("omits parts the Applet does not have instead of rendering blanks", () => {
  const xml = buildAppletBundle({ ...base, published_to_web: false, mandates: [], description: null });
  expect(xml).not.toContain("public_url");
  expect(xml).not.toContain("<job ");
  expect(xml).not.toContain("<description");
});
