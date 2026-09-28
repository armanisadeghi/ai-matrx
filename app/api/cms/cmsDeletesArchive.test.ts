/** @jest-environment node */

/**
 * Every CMS delete route ARCHIVES, never destroys (CMS migration 0041).
 *
 *   column absent (before 0041) → 503 `cms_archive_not_live`, nothing removed
 *   column present              → an archive (UPDATE deleted_at or the migration's
 *                                 cascade function), never `.delete()`
 *
 * RED AGAINST THE OLD CODE without touching a real file:
 *
 *   ARCHIVE_BASELINE_REV=<rev> npx jest app/api/cms/cmsDeletesArchive.test.ts
 *
 * copies each route as it was at <rev> into the git-ignored `/tmp/` scratch
 * directory (relative imports rewritten to the `@/` alias, so the mocks below
 * still apply) and runs the same assertions against it.
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { NextRequest } from "next/server";

type Op = [string, ...unknown[]];
const ops: Op[] = [];
let columnPresent = false;

const ROWS: Record<string, Record<string, unknown>> = {
  client_sites: { id: "site-1", slug: "green-acres", name: "Green Acres", owner_user_id: "owner-1", organization_id: null, visibility: "private" },
  client_pages: { id: "page-1", client_id: "site-1", title: "Services", slug: "services" },
  client_components: { id: "comp-1", client_id: "site-1", name: "Main header", component_type: "header" },
  client_assets: { id: "asset-1", client_id: "site-1", file_name: "logo.png", file_path: "" },
  html_pages: { id: "html-1" },
};

function builder(table: string) {
  const b: Record<string, unknown> = {};
  const chain = (name: string) => (...args: unknown[]) => {
    ops.push([`${table}.${name}`, ...args]);
    return b;
  };
  for (const m of ["select", "eq", "neq", "is", "or", "order", "in", "update", "delete", "insert"]) b[m] = chain(m);
  const row = { data: ROWS[table] ?? null, error: null, count: 0 };
  b.single = async () => row;
  b.maybeSingle = async () => row;
  b.range = async () => ({ data: [], error: null, count: 0 });
  b.limit = async () => {
    ops.push([`${table}.probe`]);
    return columnPresent
      ? { data: [], error: null }
      : { data: null, error: { code: "42703", message: `column ${table}.deleted_at does not exist` } };
  };
  b.then = (resolve: (v: unknown) => void) => resolve({ data: [], error: null, count: 0 });
  return b;
}

const fakeDb = {
  from: (table: string) => builder(table),
  rpc: async (fn: string, args: unknown) => {
    ops.push([`rpc.${fn}`, args]);
    return { data: { action: "archived" }, error: null };
  },
};

jest.mock("@/utils/supabase/server", () => ({
  createClient: jest.fn(async () => ({ auth: { getSession: async () => ({ data: { session: null } }) } })),
}));
jest.mock("@/utils/supabase/resolveUser", () => ({
  getClaimsUser: async () => ({ data: { user: { id: "owner-1", email: "owner@example.test" } }, error: null }),
}));
jest.mock("@supabase/supabase-js", () => ({ createClient: () => fakeDb }));
jest.mock("@/app/api/cms/_lib/cmsDb", () => ({
  getCmsClient: () => fakeDb,
  lookupCmsSiteAccess: async () => ({ status: "ok", site: ROWS.client_sites }),
  lookupCmsPageAccess: async () => ({ status: "ok", page: ROWS.client_pages, site: ROWS.client_sites }),
  verifySiteOwnership: async () => true,
  verifyPageOwnership: async () => true,
  verifyComponentOwnership: async () => ({ ok: true, clientId: "site-1" }),
  verifyAssetOwnership: async () => true,
  verifyHtmlPageOwnership: async () => true,
}));
jest.mock("@/app/api/cms/_lib/cmsAccess", () => ({
  ...jest.requireActual("@/app/api/cms/_lib/cmsAccess"),
  resolveCmsCaller: async () => ({ userId: "owner-1", memberOrgIds: [], adminOrgIds: [] }),
  canAccessCmsSite: () => true,
}));
jest.mock("@/app/api/cms/_lib/activityLog", () => ({ logCmsActivity: async () => undefined }));

process.env.NEXT_PUBLIC_SUPABASE_HTML_URL = "https://html.test.invalid";
process.env.SUPABASE_HTML_SECRET_KEY = "test-secret-not-a-real-key";

const ROOT = join(__dirname, "..", "..", "..");
const BASELINE = process.env.ARCHIVE_BASELINE_REV;

function loadRoute(rel: string): { POST: (r: NextRequest) => Promise<Response> } {
  if (!BASELINE) return require(join(ROOT, rel));
  const src = execFileSync("git", ["show", `${BASELINE}:${rel}`], { cwd: ROOT, encoding: "utf8" });
  const dir = dirname(rel);
  const rewritten = src
    .replace(/from "\.\.\/_lib\//g, 'from "@/app/api/cms/_lib/')
    .replace(/from "\.\//g, `from "@/${dir}/`);
  const out = join(ROOT, "tmp", "archive-baseline", BASELINE, rel);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, rewritten);
  return require(out);
}

const { __resetArchiveProbeForTests } = jest.requireActual("@/app/api/cms/_lib/cmsArchive") as {
  __resetArchiveProbeForTests: () => void;
};

const CASES: Array<[string, string, Record<string, unknown>]> = [
  ["site", "app/api/cms/sites/route.ts", { action: "delete", siteId: "site-1", force: true }],
  ["page", "app/api/cms/pages/route.ts", { action: "delete", pageId: "page-1" }],
  ["component", "app/api/cms/components/route.ts", { action: "delete", componentId: "comp-1" }],
  ["asset", "app/api/cms/assets/route.ts", { action: "delete", assetId: "asset-1" }],
  ["html page", "app/api/html-pages/route.ts", { action: "delete", pageId: "html-1" }],
];

function request(body: Record<string, unknown>) {
  return new NextRequest("https://www.aimatrx.com/api/x", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const removals = () => ops.filter(([name]) => name.endsWith(".delete"));

beforeEach(() => {
  ops.length = 0;
  __resetArchiveProbeForTests();
});

describe.each(CASES)("%s delete", (_label, rel, body) => {
  it("refuses with cms_archive_not_live and removes nothing before 0041", async () => {
    columnPresent = false;
    const response = await loadRoute(rel).POST(request(body));
    const json = (await response.json()) as { code?: string };
    expect(response.status).toBe(503);
    expect(json.code).toBe("cms_archive_not_live");
    expect(removals()).toEqual([]);
    expect(ops.filter(([n]) => n.startsWith("rpc."))).toEqual([]);
  });

  it("archives and never deletes once the column exists", async () => {
    columnPresent = true;
    const response = await loadRoute(rel).POST(request(body));
    expect(response.status).toBe(200);
    expect(removals()).toEqual([]);
    const archived =
      ops.some(([n]) => n === "rpc.cms_archive_site" || n === "rpc.cms_archive_page") ||
      ops.some(
        ([n, arg]) =>
          n.endsWith(".update") && typeof arg === "object" && arg !== null && "deleted_at" in arg,
      );
    expect(archived).toBe(true);
  });
});
