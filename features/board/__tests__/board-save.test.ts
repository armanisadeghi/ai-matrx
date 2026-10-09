// saveBoardDocument — what a board save sends and reads back, through a
// recording stand-in for the Supabase query builder and for `fetch`.
//  - the camera is never written (it is each viewer's own view), so a pan in
//    one tab can never turn another tab's edit into a conflict;
//  - a save reads back only `version` (it used to select the whole board);
//  - a version moved only by another tab's CAMERA write (an older client) is a
//    phantom and is rebased, not a conflict;
//  - the urgent save (page hidden / closing) goes out as a keepalive PATCH to
//    the same PostgREST row, with the same version guard.

type Call = { op: string; args: unknown[] };

const calls: Call[][] = [];
const replies: { data: unknown; error: unknown }[] = [];

function builder(): Record<string, unknown> {
  const chain: Call[] = [];
  calls.push(chain);
  const proxy: Record<string, unknown> = {};
  for (const op of ["from", "update", "select", "eq", "is", "insert"]) {
    proxy[op] = (...args: unknown[]) => {
      chain.push({ op, args });
      return proxy;
    };
  }
  proxy.maybeSingle = () => Promise.resolve(replies.shift() ?? { data: null, error: null });
  return proxy;
}

jest.mock("@/utils/supabase/client", () => ({
  supabase: { schema: () => ({ from: (...a: unknown[]) => (builder().from as (...x: unknown[]) => unknown)(...a) }) },
}));
jest.mock("@/lib/organizations/ensureOrgId", () => ({ ensureOrgId: jest.fn() }));

import { parseBoardDocument } from "../board/document";
import { documentColumns, documentFingerprint, saveBoardDocument } from "../persistence/boardsService";

const doc = parseBoardDocument({
  camera: { x: 10, y: 20, z: 0.8 },
  nodes: [{ id: "n1", rect: { x: 1, y: 2, w: 3, h: 4 }, title: "Note", source: { kind: "text", markdown: "hi" } }],
  edges: [],
}).doc;
const { nodes, edges } = documentColumns(doc);
const base = documentFingerprint({ nodes, edges });

beforeEach(() => {
  calls.length = 0;
  replies.length = 0;
});

describe("saveBoardDocument", () => {
  it("writes only the board's content (never the camera) and reads back only the version", async () => {
    replies.push({ data: { version: 8 }, error: null });
    const saved = await saveBoardDocument("b1", doc, { expectedVersion: 7, baseFingerprint: base });
    const update = calls[0].find((c) => c.op === "update");
    expect(update?.args[0]).toEqual({ nodes, edges, version: 8 });
    expect(update?.args[0]).not.toHaveProperty("camera");
    expect(calls[0].find((c) => c.op === "select")?.args[0]).toBe("version");
    expect(calls[0]).toContainEqual({ op: "eq", args: ["version", 7] });
    expect(saved).toEqual({ version: 8, fingerprint: base });
  });

  it("another tab moving only its camera is not a conflict: the save is rebased and lands", async () => {
    replies.push({ data: null, error: null }); // CAS missed: version moved to 9 elsewhere
    replies.push({ data: { version: 9, nodes, edges, camera: { x: 999, y: 0, z: 2 } }, error: null });
    replies.push({ data: { version: 10 }, error: null });
    const saved = await saveBoardDocument("b1", doc, { expectedVersion: 7, baseFingerprint: base });
    expect(saved.version).toBe(10);
  });

  it("content changed elsewhere is a conflict, never an overwrite", async () => {
    replies.push({ data: null, error: null });
    replies.push({ data: { version: 9, nodes: [], edges: [] }, error: null });
    await expect(
      saveBoardDocument("b1", doc, { expectedVersion: 7, baseFingerprint: base }),
    ).rejects.toMatchObject({ code: "conflict" });
  });

  it("with the tab's base, content another tab changed is MERGED and saved, never refused", async () => {
    const theirsNodes = [
      ...(nodes as unknown[]),
      { id: "n2", rect: { x: 9, y: 9, w: 3, h: 4 }, title: "Theirs", source: { kind: "text", markdown: "yo" } },
    ];
    replies.push({ data: null, error: null }); // CAS missed
    replies.push({ data: { version: 9, nodes: theirsNodes, edges: [] }, error: null }); // what is stored now
    replies.push({ data: { version: 10 }, error: null }); // the merged write lands
    const ours = parseBoardDocument({
      camera: { x: 0, y: 0, z: 1 },
      nodes: [
        ...(nodes as unknown[]),
        { id: "n3", rect: { x: 5, y: 5, w: 3, h: 4 }, title: "Ours", source: { kind: "text", markdown: "me" } },
      ],
      edges: [],
    }).doc;
    const saved = await saveBoardDocument("b1", ours, { expectedVersion: 7, baseFingerprint: base, base: doc });
    expect(saved.version).toBe(10);
    expect(saved.merged?.conflicts).toBe(0);
    expect(saved.merged?.doc.nodes.map((n) => n.id).sort()).toEqual(["n1", "n2", "n3"]);
    const writes = calls.flat().filter((c) => c.op === "update");
    const written = writes[writes.length - 1].args[0] as { nodes: { id: string }[] };
    expect(written.nodes.map((n) => n.id).sort()).toEqual(["n1", "n2", "n3"]);
  });

  it("the urgent save is a keepalive PATCH to the same guarded row, as the person", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://db.example.test";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "pk_test";
    const fetchMock = jest.fn(async () => new Response(JSON.stringify([{ version: 8 }]), { status: 200 }));
    const realFetch = globalThis.fetch;
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    try {
      const saved = await saveBoardDocument(
        "b1",
        doc,
        { expectedVersion: 7, baseFingerprint: base },
        { keepalive: { accessToken: "token-1" } },
      );
      expect(saved.version).toBe(8);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
      expect(url).toBe(
        "https://db.example.test/rest/v1/boards?id=eq.b1&version=eq.7&deleted_at=is.null&select=version",
      );
      expect(init.method).toBe("PATCH");
      expect(init.keepalive).toBe(true);
      expect(init.headers).toMatchObject({
        Authorization: "Bearer token-1",
        apikey: "pk_test",
        "Content-Profile": "projects",
        "Accept-Profile": "projects",
      });
      expect(JSON.parse(String(init.body))).toEqual({ nodes, edges, version: 8 });
      expect(calls).toHaveLength(0); // the Supabase client was not used for the write
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});
