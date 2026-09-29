/** @jest-environment jsdom */
//
// Opening the Notes picker ("+" → Notes, the Source input's "A note") must not
// download every note. It used to `select *` over all of them — every body —
// just to draw the list (Arman, 2026-09-29: "it took a long time … fetch the
// last 10 most active plus some counts"). This drives the REAL picker, hook
// and notes service against a recording Supabase double and asserts what
// crosses the wire: on open, a bounded recent read with no body column plus
// the database's folder counts; search goes to the database; the body is read
// only for the note that is picked.

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("@/lib/redux/hooks", () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: () => "org-1",
}));
jest.mock("@/lib/scoped-config/effectiveKnobs", () => ({
  useEffectiveKnob: (_org: string, _user: string, ref: { key: string }) =>
    ref.key === "notes_recent_count" ? 10 : 50,
}));
jest.mock("@/lib/knobs/featureKnobs", () => ({ knobInt: jest.fn() }));
jest.mock("@/utils/auth/getUserId", () => ({ requireUserId: () => "user-1" }));
jest.mock("@/lib/list-scope", () => ({
  defaultListFilter: async () => ({ ownerOnly: false, apply: <Q,>(q: Q) => q }),
  resolveListScope: async () => "organization",
}));
jest.mock("@/features/notes/service/noteContextAssociations", () => ({
  hydrateNoteContextLinks: jest.fn(async (rows: unknown[]) => rows),
  syncNoteContextLinks: jest.fn(),
}));
jest.mock("@/lib/toast", () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

interface Call {
  select?: string;
  limit?: number;
  or: string[];
  eq: Array<[string, unknown]>;
}
const calls: Call[] = [];
const rpcCalls: Array<{ fn: string; args: unknown }> = [];

const recentRows = Array.from({ length: 10 }, (_, i) => ({
  id: `n${i}`,
  label: `Recent note ${i}`,
  folder_name: "Draft",
  tags: [],
  updated_at: "2026-09-29T00:00:00Z",
  content_preview: `preview ${i}`,
}));
const oldNote = {
  id: "old-1",
  label: "Zebra migration plan",
  folder_name: "Business",
  tags: [],
  updated_at: "2025-01-01T00:00:00Z",
  content_preview: "zebra…",
};

function chain() {
  const call: Call = { or: [], eq: [] };
  calls.push(call);
  const result = () => {
    const id = call.eq.find(([c]) => c === "id")?.[1];
    if (call.select === "*" && id) {
      return { data: { ...oldNote, id, content: "THE FULL BODY" }, error: null };
    }
    if (call.or.some((f) => f.includes("zebra"))) return { data: [oldNote], error: null };
    return { data: recentRows, error: null };
  };
  const c: Record<string, unknown> = {
    select: (cols: string) => ((call.select = cols), c),
    is: () => c,
    eq: (col: string, v: unknown) => (call.eq.push([col, v]), c),
    or: (f: string) => (call.or.push(f), c),
    order: () => c,
    limit: (n: number) => ((call.limit = n), c),
    maybeSingle: async () => result(),
    then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
      Promise.resolve(result()).then(res, rej),
  };
  return c;
}

jest.mock("@/utils/supabase/client", () => ({
  supabase: {
    schema: () => ({
      from: () => chain(),
      rpc: async (fn: string, args: unknown) => {
        rpcCalls.push({ fn, args });
        return {
          data: [
            { folder_name: "Business", note_count: 4 },
            { folder_name: "Draft", note_count: 58 },
          ],
          error: null,
        };
      },
    }),
  },
}));

import { NotesResourcePicker } from "../NotesResourcePicker";

const BODY_COLUMN = /(^|[\s,])(content|\*)([\s,]|$)/;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  calls.length = 0;
  rpcCalls.length = 0;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function flush() {
  for (let i = 0; i < 5; i++) await act(async () => undefined);
}

test("opening reads the recent few without bodies and the folder counts from the database", async () => {
  await act(async () => {
    root.render(<NotesResourcePicker onBack={() => undefined} onSelect={() => undefined} />);
  });
  await flush();

  const reads = calls.filter((c) => c.select !== undefined);
  expect(reads.length).toBeGreaterThan(0);
  for (const r of reads) expect(r.select).not.toMatch(BODY_COLUMN);
  expect(reads.every((r) => r.limit === 10)).toBe(true);
  expect(rpcCalls.map((c) => c.fn)).toEqual(["note_folder_counts"]);
  expect(container.textContent).toContain("Recent note 0");
  expect(container.textContent).toContain("Draft");
  expect(container.textContent).toContain("58");
});

test("search asks the database, and picking reads that one note's body", async () => {
  jest.useFakeTimers();
  const onSelect = jest.fn();
  await act(async () => {
    root.render(<NotesResourcePicker onBack={() => undefined} onSelect={onSelect} />);
  });
  await flush();

  const input = container.querySelector("input") as HTMLInputElement;
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    setter.call(input, "zebra");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => {
    jest.advanceTimersByTime(400);
  });
  await flush();
  jest.useRealTimers();

  const search = calls.find((c) => c.or.some((f) => f.includes("zebra")));
  expect(search?.or[0]).toMatch(/label\.ilike.*content\.ilike/);
  expect(search?.select).not.toMatch(BODY_COLUMN);
  expect(container.textContent).toContain("Zebra migration plan");

  const row = Array.from(container.querySelectorAll("button")).find((b) =>
    b.textContent?.includes("Zebra migration plan"),
  )!;
  await act(async () => row.click());
  await flush();

  const bodyReads = calls.filter((c) => c.select === "*");
  expect(bodyReads).toHaveLength(1);
  expect(bodyReads[0].eq).toContainEqual(["id", "old-1"]);
  expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: "old-1", content: "THE FULL BODY" }));
});
