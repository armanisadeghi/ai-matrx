/** @jest-environment node */

/**
 * The CMS editor's writes honor an organization's writing-check BLOCK.
 *
 * `app/api/cms/pages/route.ts` writes the CMS database directly. For a page that
 * realizes a plan node it reads the organization's
 * `brand_voice.writing_check_severity` (ONE `platform.knob_resolve`, in the CMS
 * site's organization the access lookup already loaded); only at `block` does it
 * ask aidream's `POST /cms/publish-check`:
 *
 *   publish            must-fix → 422 with the list; clean → publishes
 *   update (live)      the same, judged on the edit
 *   rollback           NEVER gated; report-only: must-fix comes back as a notice
 *   warn / off         one setting read, no server call, nothing slowed down
 *   check can't run    publishes with the notice "Writing check didn't run"
 *   server 403 / 404   refused with that status, never "unreachable"
 */

import { NextRequest } from "next/server";

const ORG = "5dc930e9-bd65-44a1-8369-af773f6e1a5b";

type Op = [string, ...unknown[]];
const ops: Op[] = [];
let severity: unknown = "block";
let page: Record<string, unknown> = {};

function builder(table: string) {
  const b: Record<string, unknown> = {};
  const chain = (name: string) => (...args: unknown[]) => {
    ops.push([`${table}.${name}`, ...args]);
    return b;
  };
  for (const m of ["select", "eq", "is", "order", "in", "update"]) b[m] = chain(m);
  const row = { data: page, error: null };
  b.single = async () => row;
  b.maybeSingle = async () => row;
  return b;
}

const cmsDb = {
  from: (table: string) => builder(table),
  rpc: async (fn: string, args: unknown) => {
    ops.push([`rpc.${fn}`, args]);
    return { data: fn === "version_restore" ? 7 : true, error: null };
  },
};

const mainDb = {
  auth: { getSession: async () => ({ data: { session: { access_token: "jwt" } } }) },
  schema: (name: string) => ({
    from: (table: string) => builder(`main.${name}.${table}`),
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
    page: {
      id: "page-1",
      client_id: "site-1",
      title: "Services",
      plan_node_id: page.plan_node_id ?? null,
      is_published: page.is_published ?? null,
    },
    site: { id: "site-1", organization_id: ORG },
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
jest.mock("@/app/api/cms/_lib/validateContent", () => ({
  ...jest.requireActual("@/app/api/cms/_lib/validateContent"),
  validateContent: async () => ({ allowed: true, skipped: false, findings: [] }),
}));

process.env.NEXT_PUBLIC_SUPABASE_HTML_URL = "https://html.test.invalid";
process.env.SUPABASE_HTML_SECRET_KEY = "test-secret-not-a-real-key";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { POST } = require("@/app/api/cms/pages/route") as {
  POST: (r: NextRequest) => Promise<Response>;
};

const LIFT = {
  allowed_terms_setting: "brand_voice.writing_check_allowed_terms",
  rules_setting: "brand_voice.writing_check_rules",
  rule_ids: ["deslop-throat-clearing"],
  severity_setting: "brand_voice.writing_check_severity",
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
  notice: null,
  settings_problems: [],
  lift: LIFT,
};
const ALLOWED = { ...MUST_FIX, allowed: true, must_fix: [], message: null };

function call(body: Record<string, unknown>) {
  return POST(
    new NextRequest("https://www.aimatrx.com/api/cms/pages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}
const publish = () => call({ action: "publish", pageId: "page-1" });
const save = (fields: Record<string, unknown>) => call({ action: "update", pageId: "page-1", ...fields });
const rollback = () => call({ action: "rollback", pageId: "page-1", versionNumber: 3 });

let fetchSpy: jest.SpyInstance;
function serverAnswers(body: unknown, status = 200) {
  fetchSpy = jest.spyOn(global, "fetch").mockResolvedValue(
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }),
  );
}
const published = () => ops.some(([n]) => n === "rpc.publish_page_draft");
const updated = () => ops.some(([n]) => n === "client_pages.update");
const checkCalls = () => fetchSpy.mock.calls.filter(([url]) => String(url).endsWith("/cms/publish-check"));
const settingReads = () => ops.filter(([n]) => n === "main.platform.knob_resolve");

beforeEach(() => {
  ops.length = 0;
  jest.restoreAllMocks();
  page = { id: "page-1", plan_node_id: "node-1", title: "Services", client_id: "site-1", is_published: false };
});

describe("publish", () => {
  it("block + must-fix: refuses with the plain list, publishes nothing", async () => {
    severity = "block";
    serverAnswers(MUST_FIX);
    const response = await publish();
    const json = (await response.json()) as Record<string, unknown>;
    expect(response.status).toBe(422);
    expect(json.code).toBe("cms_writing_check_blocked");
    expect(String(json.error)).toContain('meta_description: "Here\'s the thing". Cut the warm-up');
    expect(String(json.error)).toContain("Or change your Brand voice settings.");
    expect(json.lift).toEqual(LIFT);
    expect(published()).toBe(false);
    const [, init] = checkCalls()[0];
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({ page_id: "page-1" });
    expect(settingReads()).toEqual([
      ["main.platform.knob_resolve", { p_feature: "brand_voice", p_key: "writing_check_severity", p_organization_id: ORG }],
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

  it.each(["warn", "off"])("%s: one setting read, no server call, no extra select", async (level) => {
    severity = level;
    serverAnswers(MUST_FIX);
    const response = await publish();
    expect(response.status).toBe(200);
    expect(checkCalls()).toHaveLength(0);
    expect(published()).toBe(true);
    expect(settingReads()).toHaveLength(1);
    // The only page read is the post-publish reload; the gate added none.
    expect(ops.filter(([n]) => n === "client_pages.select")).toHaveLength(1);
    expect(ops.some(([n]) => String(n).startsWith("main.plan"))).toBe(false);
  });

  it('a stored "Block" is block; a null setting is loud and read as warn', async () => {
    severity = "Block";
    serverAnswers(MUST_FIX);
    expect((await publish()).status).toBe(422);
    severity = null;
    const loud = jest.spyOn(console, "error").mockImplementation(() => undefined);
    fetchSpy.mockClear();
    expect((await publish()).status).toBe(200);
    expect(checkCalls()).toHaveLength(0);
    expect(loud.mock.calls.some(([m]) => String(m).includes("is not one of"))).toBe(true);
  });

  it("a page outside the plan costs nothing", async () => {
    severity = "block";
    page = { ...page, plan_node_id: null };
    serverAnswers(MUST_FIX);
    const response = await publish();
    expect(response.status).toBe(200);
    expect(settingReads()).toHaveLength(0);
    expect(checkCalls()).toHaveLength(0);
  });

  it("at block an unreachable check publishes WITH the notice the person sees", async () => {
    severity = "block";
    fetchSpy = jest.spyOn(global, "fetch").mockRejectedValue(new Error("down"));
    jest.spyOn(console, "error").mockImplementation(() => undefined);
    const response = await publish();
    const json = (await response.json()) as { notices?: string[] };
    expect(response.status).toBe(200);
    expect(json.notices).toEqual(["Writing check didn't run"]);
    expect(published()).toBe(true);
  });

  it.each([
    [403, "You can't publish this page."],
    [404, "This page wasn't found."],
  ])("server %s refuses with that status, never 'unreachable'", async (status, message) => {
    severity = "block";
    serverAnswers({ detail: "no" }, status);
    const response = await publish();
    const json = (await response.json()) as Record<string, unknown>;
    expect(response.status).toBe(status);
    expect(json.error).toBe(message);
    expect(json.code).toBe("cms_writing_check_refused");
    expect(published()).toBe(false);
  });

  it("a 401 is labelled as a sign-in failure and the person is told the check didn't run", async () => {
    severity = "block";
    serverAnswers({ detail: "expired" }, 401);
    const loud = jest.spyOn(console, "error").mockImplementation(() => undefined);
    const response = await publish();
    const json = (await response.json()) as { notices?: string[] };
    expect(json.notices).toEqual(["Writing check didn't run"]);
    expect(loud.mock.calls.some(([m]) => String(m).includes("401"))).toBe(true);
  });
});

describe("a save to a published SEO page (update)", () => {
  it("block: sends the edit (title and excerpt included) and is refused on must-fix", async () => {
    severity = "block";
    page = { ...page, is_published: true };
    serverAnswers(MUST_FIX);
    const response = await save({ metaDescription: "Here's the thing.", title: "New title", excerpt: "Short." });
    expect(response.status).toBe(422);
    expect(updated()).toBe(false);
    const [, init] = checkCalls()[0];
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({
      page_id: "page-1",
      live_edit: { meta_description: "Here's the thing.", title: "New title", excerpt: "Short." },
    });
  });

  it("warn: never calls the server and adds no select", async () => {
    severity = "warn";
    page = { ...page, is_published: true };
    serverAnswers(MUST_FIX);
    const response = await save({ metaDescription: "Here's the thing." });
    expect(response.status).toBe(200);
    expect(checkCalls()).toHaveLength(0);
    expect(updated()).toBe(true);
    expect(ops.filter(([n]) => n === "client_pages.select")).toHaveLength(1);
  });

  it("a save to an unpublished page is not a publish", async () => {
    severity = "block";
    serverAnswers(MUST_FIX);
    const response = await save({ metaDescription: "Here's the thing." });
    expect(response.status).toBe(200);
    expect(checkCalls()).toHaveLength(0);
  });
});

describe("rollback (never gated, report-only)", () => {
  it("block + must-fix: restores anyway and says what is now live", async () => {
    severity = "block";
    page = { ...page, is_published: true };
    serverAnswers(MUST_FIX);
    const response = await rollback();
    const json = (await response.json()) as { notices?: string[] };
    expect(response.status).toBe(200);
    expect(ops.some(([n]) => n === "rpc.version_restore")).toBe(true);
    expect(json.notices).toEqual(["Writing check: 1 must-fix item now live"]);
    const [, init] = checkCalls()[0];
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({ page_id: "page-1", live_edit: {} });
  });

  it("warn: no server call, no notice", async () => {
    severity = "warn";
    page = { ...page, is_published: true };
    serverAnswers(MUST_FIX);
    const json = (await (await rollback()).json()) as { notices?: string[] };
    expect(checkCalls()).toHaveLength(0);
    expect(json.notices).toEqual([]);
  });
});
