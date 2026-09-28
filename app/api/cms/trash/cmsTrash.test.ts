/** @jest-environment node */

/**
 * The CMS Trash source's server half (lane CMS-TRASH, 2026-09-27).
 *
 *   - BEFORE CMS 0041 the route answers `{ live: false }` and reads no rows at all.
 *   - The rows listed are exactly the ones the existing CMS routes would let this caller archive,
 *     so every Restore shown is one the door accepts: a site needs the site's admin level; a page
 *     or component needs editor on a LIVE site; a page under an archived parent waits for it.
 *   - POST calls the migration's door and hands its `notices` back verbatim; a door's refusal
 *     reaches the person without the function-name prefix.
 *
 * RED against HEAD: neither `./route` nor `../_lib/cmsTrash` exists there.
 */

import { NextRequest } from "next/server";

const OWNER = "owner-1";
const TEAMMATE = "teammate-1";
const ORG = "org-1";

let columnPresent = false;
let member: { container_id: string; role: string }[] = [];
let caller = OWNER;
const ops: string[] = [];
let rpcResult: { data: unknown; error: { message: string; code?: string } | null } = { data: null, error: null };

const TABLES: Record<string, Record<string, unknown>[]> = {
  client_sites: [
    { id: "site-live", name: "Green Acres", slug: "green-acres", owner_user_id: OWNER, organization_id: ORG, visibility: "internal", deleted_at: null },
    { id: "site-gone", name: "Old Brand", slug: "old-brand", owner_user_id: OWNER, organization_id: ORG, visibility: "internal", deleted_at: "2026-09-25T10:00:00Z" },
  ],
  client_pages: [
    { id: "page-services", client_id: "site-live", parent_id: null, title: "Services", slug: "services", deleted_at: "2026-09-26T09:30:00Z" },
    { id: "page-child", client_id: "site-live", parent_id: "page-services", title: "Mowing", slug: "mowing", deleted_at: "2026-09-26T09:30:00Z" },
  ],
  client_components: [
    { id: "comp-header", client_id: "site-live", name: "Main header", component_type: "header", deleted_at: "2026-09-24T08:00:00Z" },
  ],
  client_activity_log: [],
};

function builder(table: string) {
  let filterId: string | null = null;
  let probe = false;
  const b: Record<string, unknown> = {};
  const chain = (name: string) => (...args: unknown[]) => {
    ops.push(`${table}.${name}`);
    if (name === "select" && String(args[0]) === "deleted_at") probe = true;
    if (name === "eq" && args[0] === "id") filterId = String(args[1]);
    return b;
  };
  for (const name of ["select", "eq", "or", "in", "not", "order", "is", "insert"]) b[name] = chain(name);
  const rows = () => (TABLES[table] ?? []).filter((r) => filterId === null || r.id === filterId);
  const settle = () => {
    if (probe && !columnPresent) return { data: null, error: { code: "42703", message: "column deleted_at does not exist" } };
    return { data: rows(), error: null };
  };
  b.limit = (...args: unknown[]) => {
    ops.push(`${table}.limit`);
    void args;
    return Promise.resolve(settle());
  };
  b.maybeSingle = () => Promise.resolve({ data: rows()[0] ?? null, error: null });
  b.then = (resolve: (v: unknown) => unknown) => resolve(settle());
  return b;
}

const db = {
  from: (table: string) => builder(table),
  rpc: jest.fn(async (fn: string, args: unknown) => {
    ops.push(`rpc.${fn}:${JSON.stringify(args)}`);
    return rpcResult;
  }),
};

jest.mock("@/utils/supabase/server", () => ({
  createClient: async () => ({ rpc: async () => ({ data: member, error: null }) }),
}));
jest.mock("@/utils/supabase/resolveUser", () => ({
  getClaimsUser: async () => ({ data: { user: { id: caller, email: "a@b.c" } }, error: null }),
}));
jest.mock("@/app/api/cms/_lib/cmsDb", () => ({ getCmsClient: () => db }));

import { GET, POST } from "./route";
import { __resetArchiveProbeForTests } from "../_lib/cmsArchive";
import { restoreRefusalMessage } from "../_lib/cmsTrash";

beforeEach(() => {
  __resetArchiveProbeForTests();
  ops.length = 0;
  columnPresent = true;
  member = [];
  caller = OWNER;
  rpcResult = { data: null, error: null };
});

const get = (qs = "") => GET(new NextRequest(`http://localhost/api/cms/trash${qs}`));
const post = (body: unknown) =>
  POST(new NextRequest("http://localhost/api/cms/trash", { method: "POST", body: JSON.stringify(body) }));

test("before the archive column exists: not live, and no row is read", async () => {
  columnPresent = false;
  const res = await get();
  expect(await res.json()).toEqual({ live: false, counts: [], items: [] });
  expect(ops.filter((o) => o.endsWith(".or") || o.endsWith(".in") || o.endsWith(".not"))).toEqual([]);
});

test("the owner sees the archived site, the top archived page and the component — not the sub-page", async () => {
  const body = await (await get()).json();
  expect(body.live).toBe(true);
  expect(body.items.map((i: { id: string }) => i.id)).toEqual(["page-services", "site-gone", "comp-header"]);
  expect(body.counts).toEqual([
    { artifact_kind: "cms_site", label: "Site", n: 1 },
    { artifact_kind: "cms_page", label: "Site page", n: 1 },
    { artifact_kind: "cms_component", label: "Site component", n: 1 },
  ]);
  expect(body.items[0]).toMatchObject({ entity_token: "cms_page", title: "Services", is_mine: true, organization_id: ORG });
});

test("an org member (editor) sees the pages and components but not the archived site (that needs admin)", async () => {
  caller = TEAMMATE;
  member = [{ container_id: ORG, role: "member" }];
  const body = await (await get()).json();
  expect(body.items.map((i: { id: string }) => i.id)).toEqual(["page-services", "comp-header"]);
  expect(body.items[0].is_mine).toBe(false);
});

test("a stranger sees nothing", async () => {
  caller = "stranger";
  const body = await (await get()).json();
  expect(body.items).toEqual([]);
});

test("restore calls the door and returns its notices verbatim", async () => {
  const notices = [
    { kind: "route_suffixed", entity: "page", id: "page-services", from: "/services", to: "/services-restored", message: 'Page "Services" was restored at /services-restored because a live page now uses /services.' },
  ];
  rpcResult = { data: { action: "restored", page_id: "page-services", notices }, error: null };
  const res = await post({ token: "cms_page", id: "page-services" });
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ action: "restored", notices });
  expect(ops).toContain('rpc.cms_restore_page:{"p_page_id":"page-services"}');
});

test("a stranger's restore is refused before the door is called", async () => {
  caller = "stranger";
  const res = await post({ token: "cms_site", id: "site-gone" });
  expect(res.status).toBe(403);
  expect(ops.some((o) => o.startsWith("rpc."))).toBe(false);
});

test("a door refusal reaches the person as a plain sentence", async () => {
  rpcResult = { data: null, error: { code: "P0001", message: "cms_restore_page: the site is archived. Restore the site first; that brings this page back with it." } };
  const res = await post({ token: "cms_page", id: "page-services" });
  expect(res.status).toBe(409);
  expect((await res.json()).error).toBe("The site is archived. Restore the site first; that brings this page back with it.");
  expect(restoreRefusalMessage("")).toBe("The restore was refused.");
});
