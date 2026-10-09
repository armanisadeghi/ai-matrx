// A meeting's board is a SAVED board: the viewer's own boards row
// linked by settings.meeting_id. These cases drive the real service against a
// recorded fake of the table, and fail when the link, the seed or the
// one-at-a-time rule breaks.

type Call = { op: string; args: unknown[] };
const calls: Call[] = [];
let existing: unknown[] = [];

function chain(result: () => unknown) {
  const c: Record<string, unknown> = {};
  for (const op of ["select", "eq", "is", "contains", "order", "limit", "insert", "single"]) {
    c[op] = (...args: unknown[]) => {
      calls.push({ op, args });
      return c;
    };
  }
  c.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
    Promise.resolve(result()).then(resolve, reject);
  return c;
}

const row = (over: Record<string, unknown>) => ({
  id: "b1",
  organization_id: "org1",
  title: "Weekly sync",
  description: null,
  camera: { x: 0, y: 0, z: 0.6 },
  nodes: [],
  edges: [],
  settings: {},
  version: 1,
  created_by: "u1",
  created_at: "2026-10-01T00:00:00Z",
  updated_at: "2026-10-01T00:00:00Z",
  last_opened_at: null,
  ...over,
});

jest.mock("@/utils/supabase/client", () => ({ supabase: {} }));
jest.mock("@/utils/supabase/projectsDb", () => ({
  projectsDb: () => ({
    from: () => {
      let inserting: Record<string, unknown> | null = null;
      const c = chain(() =>
        inserting ? { data: row({ id: "new", ...inserting }), error: null } : { data: existing, error: null },
      );
      const insert = c.insert as (...a: unknown[]) => unknown;
      c.insert = (values: Record<string, unknown>) => {
        inserting = values;
        return insert(values);
      };
      return c;
    },
  }),
}));
jest.mock("@/utils/auth/getUserId", () => ({ requireUserId: () => "u1" }));
jest.mock("@/lib/organizations/ensureOrgId", () => ({
  ensureOrgId: jest.fn(async (organizationId: string | null) => organizationId ?? "picked"),
}));
jest.mock("@/lib/organizations/orgBootstrapGate", () => ({ whenOrgBootstrapResolved: async () => undefined }));
jest.mock("@/features/trash/service", () => ({ restoreFromTrash: jest.fn() }));

import { getMeetingBoard, meetingIdOfSettings, settingsForCopy } from "../persistence/boardsService";
import { meetingNotesDocument } from "../items/meeting-items.logic";
import { meetingPartOf } from "../items/meeting-items.logic";

beforeEach(() => {
  calls.length = 0;
  existing = [];
});

describe("getMeetingBoard", () => {
  it("opens the person's existing board for that meeting, found by settings.meeting_id", async () => {
    existing = [row({ id: "b7", settings: { meeting_id: "m1" } })];
    const board = await getMeetingBoard({ meetingId: "m1", title: "Weekly sync", organizationId: "org1", seed: meetingNotesDocument("m1") });
    expect(board.id).toBe("b7");
    expect(calls).toContainEqual({ op: "contains", args: ["settings", { meeting_id: "m1" }] });
    expect(calls).toContainEqual({ op: "eq", args: ["created_by", "u1"] });
    expect(calls.some((c) => c.op === "insert")).toBe(false);
  });

  it("creates it, linked and seeded with the meeting's notes, when there is none", async () => {
    const board = await getMeetingBoard({ meetingId: "m1", title: "Weekly sync", organizationId: "org1", seed: meetingNotesDocument("m1") });
    const insert = calls.find((c) => c.op === "insert")?.args[0] as Record<string, unknown>;
    expect(insert.settings).toEqual({ meeting_id: "m1" });
    expect(insert.organization_id).toBe("org1");
    expect(insert.title).toBe("Weekly sync");
    expect(meetingIdOfSettings(insert.settings as never)).toBe("m1");
    // The new board opens on the five parts of THIS meeting inside its frame.
    expect(board.doc.groups.map((g) => g.title)).toEqual(["Meeting notes"]);
    expect(board.doc.nodes.map((n) => meetingPartOf(n.source)?.meetingId)).toEqual(["m1", "m1", "m1", "m1", "m1"]);
  });

  it("two opens at once make ONE board", async () => {
    const seed = meetingNotesDocument("m1");
    const [a, b] = await Promise.all([
      getMeetingBoard({ meetingId: "m1", title: "Weekly sync", organizationId: "org1", seed }),
      getMeetingBoard({ meetingId: "m1", title: "Weekly sync", organizationId: "org1", seed }),
    ]);
    expect(a).toBe(b);
    expect(calls.filter((c) => c.op === "insert")).toHaveLength(1);
  });

  it("a copy of a meeting's board is an ordinary board", () => {
    expect(settingsForCopy({ meeting_id: "m1", home: true, theme: "dark" })).toEqual({ theme: "dark" });
  });
});
