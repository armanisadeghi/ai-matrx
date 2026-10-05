/** @jest-environment node */

/**
 * The CMS editor's publish honors an organization's writing-check BLOCK.
 *
 * `app/api/cms/pages/route.ts` action "publish" writes the CMS database directly
 * (`publish_page_draft`). For a page that realizes a plan node it reads the
 * organization's `brand_voice.writing_check_severity` from Supabase; only at
 * `block` does it ask aidream's `POST /cms/publish-check`, and a must-fix answer
 * stops the publish with a 422 carrying the plain list and the three ways to lift
 * it. Under warn or off the server is never called and the publish goes out.
 */

import { NextRequest } from "next/server";

type Op = [string, ...unknown[]];
const ops: Op[] = [];
let severity: string = "block";
let page: Record<string, unknown> = {};

function builder(table: string) {
  const b: Record<string, unknown> = {};
  const chain = (name: string) => (...args: unknown[]) => {
    ops.push([`${table}.${name}`, ...args]);
    return b;
  };
  for (const m of ["select", "eq", "is", "order", "in", "update"]) b[m] = chain(m);
  const row = { data: table === "client_pages" ? page : { organization_id: "5dc930e9-bd65-44a1-8369-af773f6e1a5b" }, error: null };
  b.single = async () => row;
  b.maybeSingle = async () => row;
  return b;
}

const cmsDb = {
  from: (table: string) => builder(table),
  rpc: async (fn: string, args: unknown) => {
    ops.push([`rpc.${fn}`, args]);
    return { data: true, error: null };
  },
};

const mainDb = {
  auth: { getSession: async () => ({ data: { session: { access_token: "jwt" } } }) },
  schema: (name: string) => ({
    from: (table: string) => builder(`${name}.${table}`),
    rpc: async (fn: string, args: Record<string, unknown>) => {
      ops.push([`main.${name}.${fn}`, args]);
      return { data: severity, error: null };
    },
  }),
};

jest.mock("@/utils/supabase/server", () => ({ createClient: jest.fn(async () => mainDb) }));
jest.mock("@/utils/supabase/resolveUser", () => ({
  getClaimsUser: async () => ({ data: { user: { id: "owner-1", email: "owner@example.test" } }, error: null }),
}));
jest.mock("@/app/api/cms/_lib/cmsDb", () => ({
  getCmsClient: () => cmsDb,
  verifyPageOwnership: async () => true,
  verifySiteOwnership: async () => true,
  lookupCmsPageAccess: async () => ({
    status: "ok",
    page: { id: "page-1", client_id: "site-1", title: "Services" },
    site: { id: "site-1", organization_id: null },
  }),
}));
jest.mock("@/utils/supabase/writeOne", () => ({
  writeOneRow: async (query: unknown) => {
    void query;
    return { data: { id: "page-1", client_id: "site-1", title: "Services" }, error: null };
  },
}));
jest.mock("@/app/api/cms/_lib/cmsAccess", () => ({
  ...jest.requireActual("@/app/api/cms/_lib/cmsAccess"),
  resolveCmsCaller: async () => ({ userId: "owner-1", memberOrgIds: [], adminOrgIds: [] }),
}));
jest.mock("@/app/api/cms/_lib/activityLog", () => ({ logCmsActivity: async () => undefined }));

process.env.NEXT_PUBLIC_SUPABASE_HTML_URL = "https://html.test.invalid";
process.env.SUPABASE_HTML_SECRET_KEY = "test-secret-not-a-real-key";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { POST } = require("@/app/api/cms/pages/route") as {
  POST: (r: NextRequest) => Promise<Response>;
};

const MUST_FIX = {
  allowed: false,
  must_fix: [
    {
      field: "meta_description",
      rule_id: "deslop-throat-clearing",
      match: "Here's the thing",
      fix_hint: "Cut the warm-up and state the point.",
    },
  ],
  message: "Not published /services: ...",
  lift: {
    allowed_terms_setting: "brand_voice.writing_check_allowed_terms",
    rules_setting: "brand_voice.writing_check_rules",
    rule_ids: ["deslop-throat-clearing"],
    severity_setting: "brand_voice.writing_check_severity",
  },
};
const ALLOWED = { ...MUST_FIX, allowed: true, must_fix: [], message: null };

function publish() {
  return POST(
    new NextRequest("https://www.aimatrx.com/api/cms/pages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "publish", pageId: "page-1" }),
    }),
  );
}

let fetchSpy: jest.SpyInstance;
function serverAnswers(body: unknown) {
  fetchSpy = jest.spyOn(global, "fetch").mockResolvedValue(
    new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } }),
  );
}
const published = () => ops.some(([n]) => n === "rpc.publish_page_draft");
const checkCalls = () =>
  fetchSpy.mock.calls.filter(([url]) => String(url).endsWith("/cms/publish-check"));

beforeEach(() => {
  ops.length = 0;
  jest.restoreAllMocks();
  page = { id: "page-1", plan_node_id: "node-1", title: "Services", client_id: "site-1" };
});

it("block + must-fix: refuses with the plain list and the three ways to lift it, publishes nothing", async () => {
  severity = "block";
  serverAnswers(MUST_FIX);
  const response = await publish();
  const json = (await response.json()) as Record<string, unknown>;
  expect(response.status).toBe(422);
  expect(json.code).toBe("cms_writing_check_blocked");
  expect(String(json.error)).toContain('meta_description: "Here\'s the thing". Cut the warm-up');
  expect(String(json.error)).toContain("allow the words, turn off the rule, or set the check to warn");
  expect(json.lift).toEqual(MUST_FIX.lift);
  expect(published()).toBe(false);
  const [, init] = checkCalls()[0];
  expect(JSON.parse(String((init as RequestInit).body))).toEqual({ page_id: "page-1" });
  expect(ops).toContainEqual([
    "main.platform.knob_resolve",
    { p_feature: "brand_voice", p_key: "writing_check_severity", p_organization_id: "5dc930e9-bd65-44a1-8369-af773f6e1a5b" },
  ]);
});

it("block + clean text: publishes", async () => {
  severity = "block";
  serverAnswers(ALLOWED);
  const response = await publish();
  expect(response.status).toBe(200);
  expect(checkCalls()).toHaveLength(1);
  expect(published()).toBe(true);
});

it.each(["warn", "off"])("%s: never calls the server and publishes", async (level) => {
  severity = level;
  serverAnswers(MUST_FIX);
  const response = await publish();
  expect(response.status).toBe(200);
  expect(checkCalls()).toHaveLength(0);
  expect(published()).toBe(true);
});

it("a page outside the plan is not checked at all", async () => {
  severity = "block";
  page = { ...page, plan_node_id: null };
  serverAnswers(MUST_FIX);
  const response = await publish();
  expect(response.status).toBe(200);
  expect(checkCalls()).toHaveLength(0);
  expect(ops.some(([n]) => n.startsWith("main.platform"))).toBe(false);
  expect(published()).toBe(true);
});

it("an unreachable check publishes loudly marked, never silently", async () => {
  severity = "block";
  fetchSpy = jest.spyOn(global, "fetch").mockRejectedValue(new Error("down"));
  jest.spyOn(console, "error").mockImplementation(() => undefined);
  const response = await publish();
  expect(response.status).toBe(200);
  expect(response.headers.get("X-Cms-Writing-Check")).toBe("skipped");
  expect(published()).toBe(true);
});


// ── a save to a PUBLISHED SEO page writes live text directly ("update") ──

jest.mock("@/app/api/cms/_lib/validateContent", () => ({
  ...jest.requireActual("@/app/api/cms/_lib/validateContent"),
  validateContent: async () => ({ allowed: true, skipped: false, findings: [] }),
}));

function save(fields: Record<string, unknown>) {
  return POST(
    new NextRequest("https://www.aimatrx.com/api/cms/pages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "update", pageId: "page-1", ...fields }),
    }),
  );
}
const updated = () => ops.some(([n]) => n === "client_pages.update");

it("block: a save to a published SEO page sends the edit and is refused on must-fix", async () => {
  severity = "block";
  page = { ...page, is_published: true };
  serverAnswers(MUST_FIX);
  const response = await save({ metaDescription: "Here's the thing." });
  expect(response.status).toBe(422);
  expect(updated()).toBe(false);
  const [, init] = checkCalls()[0];
  expect(JSON.parse(String((init as RequestInit).body))).toEqual({
    page_id: "page-1",
    live_edit: { meta_description: "Here's the thing." },
  });
});

it("warn: a save to a published SEO page never calls the server", async () => {
  severity = "warn";
  page = { ...page, is_published: true };
  serverAnswers(MUST_FIX);
  const response = await save({ metaDescription: "Here's the thing." });
  expect(response.status).toBe(200);
  expect(checkCalls()).toHaveLength(0);
  expect(updated()).toBe(true);
});

it("a save to an unpublished page is not a publish", async () => {
  severity = "block";
  page = { ...page, is_published: false };
  serverAnswers(MUST_FIX);
  const response = await save({ metaDescription: "Here's the thing." });
  expect(response.status).toBe(200);
  expect(checkCalls()).toHaveLength(0);
});
