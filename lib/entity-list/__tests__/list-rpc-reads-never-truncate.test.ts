/**
 * A list's facet and count reads can never come back silently short.
 *
 * The API caps every response at 1,000 rows. Facet RPCs return one row per
 * (facet, value): transcripts reached 1,394 rows for admin (Visibility, owner,
 * organization and draft facets vanished), agents' System lane 1,421. Every
 * such read goes through `readListRpc`, which pages past the cap under a stable
 * order and refuses — loudly — a read it cannot prove complete.
 *
 * Part 1 proves the reader. Part 2 is the class guard: any facet/count RPC
 * called around the reader fails here, by file and function name.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const platformRpc = jest.fn();
jest.mock("@/utils/supabase/client", () => ({
  supabase: { rpc: jest.fn(), schema: jest.fn(() => ({ rpc: (...a: unknown[]) => platformRpc(...a) })) },
}));

import { LIST_RPC_PAGE_ROWS, readListRpc, type ListRpcClient } from "../readListRpc";

type Row = { kind: string; value: string; total: number };

/** A server double: answers ranges of `rows` and caps every response at `cap` rows. */
function server(rows: Row[], opts: { cap?: number; withCount?: boolean; shuffleUnordered?: boolean } = {}) {
  const cap = opts.cap ?? LIST_RPC_PAGE_ROWS;
  const calls: { ordered: string[]; from: number; to: number }[] = [];
  const client: ListRpcClient = {
    rpc: () => {
      const ordered: string[] = [];
      const builder = {
        order: (column: string) => {
          ordered.push(column);
          return builder;
        },
        range: (from: number, to: number) => {
          calls.push({ ordered: [...ordered], from, to });
          let source = rows;
          if (ordered.length) {
            source = [...rows].sort((a, b) => a.kind.localeCompare(b.kind) || a.value.localeCompare(b.value));
          } else if (opts.shuffleUnordered && from > 0) {
            source = [...rows].reverse(); // an unordered function may answer any order per request
          }
          const page = source.slice(from, Math.min(to + 1, from + cap));
          return Promise.resolve({
            data: page,
            error: null,
            count: opts.withCount === false ? null : rows.length,
          });
        },
      };
      return builder;
    },
  };
  return { client, calls };
}

const rowsOf = (n: number, kind = "tag"): Row[] =>
  Array.from({ length: n }, (_, i) => ({ kind, value: `v${String(i).padStart(5, "0")}`, total: 1 }));

describe("readListRpc — the one reader of facet and count RPCs", () => {
  it("a result that fits one page is one request, in the server's own order", async () => {
    const rows = [
      { kind: "status", value: "zeta", total: 9 },
      { kind: "status", value: "alpha", total: 1 },
    ];
    const { client, calls } = server(rows);
    const res = await readListRpc<Row>("x_list_facets", {}, { order: ["kind", "value"], client });
    expect(res).toEqual({ data: rows, error: null });
    expect(calls).toEqual([{ ordered: [], from: 0, to: LIST_RPC_PAGE_ROWS - 1 }]);
  });

  it("the public schema is ONE request however many rows: 3,072 rows are not paged", async () => {
    const rows = rowsOf(3072, "org");
    platformRpc.mockReset();
    platformRpc.mockResolvedValue({ data: rows, error: null });
    const res = await readListRpc<Row>("agx_list_scope_counts", { p_archived: "active" }, { order: ["kind", "value"] });
    expect(res).toEqual({ data: rows, error: null });
    expect(platformRpc).toHaveBeenCalledTimes(1);
    expect(platformRpc).toHaveBeenCalledWith("list_rpc_once", { p_fn: "agx_list_scope_counts", p_args: { p_archived: "active" } });
  });

  it("an array argument (a text[] parameter) keeps the paged read: the one-call cast cannot bind it", async () => {
    platformRpc.mockReset();
    const { supabase } = jest.requireMock("@/utils/supabase/client") as { supabase: { rpc: jest.Mock } };
    const { client, calls } = server(rowsOf(3, "org"));
    supabase.rpc.mockImplementation((...a: unknown[]) => client.rpc(...(a as Parameters<typeof client.rpc>)));
    const res = await readListRpc<Row>("admin_run_history_facets", { p_kinds: ["agent"] }, { order: ["kind", "value"] });
    expect(res.error).toBeNull();
    expect(res.data).toHaveLength(3);
    expect(platformRpc).not.toHaveBeenCalled();
    expect(calls.length).toBeGreaterThan(0);
    supabase.rpc.mockReset();
  });

  it("the one-call reader's error and a non-list answer both reach the caller", async () => {
    platformRpc.mockReset();
    platformRpc.mockResolvedValueOnce({ data: null, error: { message: "denied", code: "42501" } });
    expect(await readListRpc<Row>("wfx_list_scope_counts", {}, { order: ["kind", "value"] })).toEqual({
      data: null,
      error: { message: "denied", code: "42501" },
    });
    platformRpc.mockResolvedValueOnce({ data: { not: "a list" }, error: null });
    const res = await readListRpc<Row>("wfx_list_facets", {}, { order: ["kind", "value"] });
    expect(res.data).toBeNull();
    expect(res.error?.code).toBe("incomplete_read");
  });

  it("past the 1,000-row cap it returns EVERY row — the facets after row 1,000 included", async () => {
    const rows = [...rowsOf(1392, "tag"), { kind: "shown_to", value: "internal", total: 687 }, { kind: "shown_to", value: "personal", total: 1 }];
    const { client, calls } = server(rows, { shuffleUnordered: true });
    const res = await readListRpc<Row>("trx_list_facets", {}, { order: ["kind", "value"], client });
    expect(res.error).toBeNull();
    expect(res.data).toHaveLength(1394);
    expect(new Set(res.data!.map((r) => `${r.kind}:${r.value}`)).size).toBe(1394);
    expect(res.data!.filter((r) => r.kind === "shown_to")).toHaveLength(2);
    // Every page after the probe is read under the caller's stable order.
    expect(calls.slice(1).every((c) => c.ordered.join() === "kind,value")).toBe(true);
  });

  it("a read it cannot prove complete is an error, never a short list", async () => {
    // The server caps at 500 while the reader pages by 1,000: rows 500–999 are never sent.
    const { client } = server(rowsOf(1500), { cap: 500 });
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    const res = await readListRpc<Row>("agx_list_facets", {}, { order: ["kind", "value"], client });
    expect(res.data).toBeNull();
    expect(res.error?.code).toBe("incomplete_read");
    expect(res.error?.message).toContain("agx_list_facets");
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("a full page with no total is an error, never trusted as complete", async () => {
    const { client } = server(rowsOf(1200), { withCount: false });
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    const res = await readListRpc<Row>("cvx_list_facets", {}, { order: ["kind", "value"], client });
    expect(res.data).toBeNull();
    expect(res.error?.code).toBe("incomplete_read");
    spy.mockRestore();
  });

  it("the API's own error reaches the caller with its code", async () => {
    const client: ListRpcClient = {
      rpc: () => {
        const builder = {
          order: () => builder,
          range: () => Promise.resolve({ data: null, error: { message: "boom", code: "57014" }, count: null }),
        };
        return builder;
      },
    };
    const res = await readListRpc<Row>("wfx_list_facets", {}, { order: ["kind", "value"], client });
    expect(res).toEqual({ data: null, error: { message: "boom", code: "57014" } });
  });
});

// ── Part 2: the class guard ────────────────────────────────────────────────

/** A list-surface facet or count RPC: one row per value or per lane. */
const LIST_RPC_NAME = /^[a-z0-9_]*(?:_facets|_list_counts|_scope_counts)$/;

/**
 * Functions with a facet-shaped name that return ONE value (a jsonb document with its own
 * `p_limit`), so the row cap cannot cut them. Each entry carries its reason.
 */
const ONE_VALUE_RPCS: Record<string, string> = {
  udt_column_facets: "returns one jsonb document; its p_limit bounds the values inside",
  cms_collection_column_facets: "returns one jsonb document; its p_limit bounds the values inside",
  admin_explore_conversation_facets: "returns one jsonb document (an object of facet lists), read as one value in cx-dashboard/explorer/service.ts",
  map_topic_facets: "returns one jsonb document for one topic",
};

const SCAN_DIRS = ["app", "components", "features", "hooks", "lib", "providers", "utils"];
const ROOT = process.env.LIST_RPC_GUARD_ROOT ?? path.resolve(__dirname, "../../..");

function sourceFiles(): string[] {
  const listed = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "--", ...SCAN_DIRS], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  }).split("\n");
  return listed.filter(
    (f) => /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f) && !f.includes("__tests__/") && fs.existsSync(path.join(ROOT, f)),
  );
}

/** Every `.rpc("name"` / `rpc("name"` whose name is a list facet/count RPC, outside the reader. */
function bareListRpcCalls(files: string[], root: string): string[] {
  const found: string[] = [];
  const call = /(?<![A-Za-z0-9_])rpc\(\s*(?:\n\s*)?["'`]([a-z0-9_]+)["'`]/g;
  for (const file of files) {
    if (file === "lib/entity-list/readListRpc.ts") continue;
    const source = fs.readFileSync(path.join(root, file), "utf8");
    for (const m of source.matchAll(call)) {
      const fn = m[1];
      if (!LIST_RPC_NAME.test(fn) || fn in ONE_VALUE_RPCS) continue;
      const line = source.slice(0, m.index).split("\n").length;
      found.push(`${file}:${line} ${fn}`);
    }
  }
  return found;
}

describe("every list facet/count RPC is read through readListRpc", () => {
  it("no facet or count RPC is called around the paging reader", () => {
    const offenders = bareListRpcCalls(sourceFiles(), ROOT);
    // Each line: a facet/count read that returns only the first 1,000 rows, silently.
    // Fix: `readListRpc(fn, args, { order: [...] })` from lib/entity-list/readListRpc.
    expect(offenders).toEqual([]);
  });

  it("the guard sees the call shapes it must catch (self-test)", () => {
    const dir = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "list-rpc-guard-"));
    fs.writeFileSync(
      path.join(dir, "a.ts"),
      [
        'await supabase.rpc("agx_list_facets", {});',
        'await EDU().rpc("fc_set_list_counts", {});',
        "await supabase.rpc(\n  \"ivw_list_scope_counts\" as never, {});",
        'await readListRpc("cvx_list_facets", {}, { order: ["kind", "value"] });',
        'await supabase.rpc("udt_column_facets", {});',
        'await supabase.rpc("agx_list_scoped", {});',
      ].join("\n"),
    );
    expect(bareListRpcCalls(["a.ts"], dir)).toEqual([
      "a.ts:1 agx_list_facets",
      "a.ts:2 fc_set_list_counts",
      "a.ts:3 ivw_list_scope_counts",
    ]);
  });
});
