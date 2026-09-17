/** @jest-environment node */
//
// 🚨 A MAP-VALUED KNOB IS MERGED, NEVER REPLACED, AND NEVER MERGED INTO A GUESS.
//
// The defect this pins (Bugbot, frontend PR 228, commit 4cbd9e45): the Detail
// primitive's per-record-type setting lives in ONE json map
// (`ui.detail.presentation_by_type` = `{"file":"docked","task":"page"}`) and
// `platform.knob_override_set` REPLACES the whole value — it offers no merge and
// no precondition. The caller read the current map with `.catch(() => undefined)`
// and merged into `{}`, so one transient `knob_resolve` miss wrote a ONE-ENTRY
// map over every other type the person had set, silently, and a second tab
// saving a different type did the same to the first.
//
// Only `@/utils/supabase/client` is mocked, because the thing under test is what
// leaves the browser and in what order: the read that must succeed before the
// write, and the merge that must carry everything the ladder currently answers.
// The real `effectiveKnobs` cache runs, because the 60s TTL is half the defect —
// merging into a cached map re-writes a minute-old map.

import { createClient } from "@/utils/supabase/client";

import { ensureEffectiveKnob, invalidateEffectiveKnob } from "./effectiveKnobs";
import { setUserKnobMapEntry } from "./service";

jest.mock("@/utils/supabase/client", () => ({ createClient: jest.fn() }));

const ORG = "11111111-1111-4111-8111-111111111111";
const USER = "22222222-2222-4222-8222-222222222222";
const KEY = { feature: "ui.detail", key: "presentation_by_type" };

type Call = { fn: string; args: Record<string, unknown> };

/**
 * A fake settings ladder: it HOLDS the value, so a dropped entry is a real
 * absence at the end of the test rather than an argument we chose to assert on.
 */
function fakeLadder(initial: unknown) {
  const state = { value: initial, resolveError: null as string | null };
  const calls: Call[] = [];
  const rpc = (fn: string, args: Record<string, unknown>) => {
    calls.push({ fn, args });
    if (fn === "knob_resolve") {
      return Promise.resolve(
        state.resolveError
          ? { data: null, error: { message: state.resolveError } }
          : { data: state.value, error: null },
      );
    }
    if (fn === "knob_override_set") {
      state.value = args.p_value;
      return Promise.resolve({ data: { ok: true }, error: null });
    }
    throw new Error(`unexpected rpc ${fn}`);
  };
  jest.mocked(createClient).mockReturnValue({
    rpc,
    schema: () => ({ rpc }),
  } as unknown as ReturnType<typeof createClient>);
  return { state, calls, writes: () => calls.filter((c) => c.fn === "knob_override_set") };
}

const save = (entryKey: string, entryValue: unknown) =>
  setUserKnobMapEntry({ ...KEY, entryKey, entryValue, userId: USER, organizationId: ORG });

beforeEach(() => {
  jest.clearAllMocks();
  invalidateEffectiveKnob();
});

it("REFUSES the write when the current map cannot be read, and says so", async () => {
  const ladder = fakeLadder({ task: "page" });
  ladder.state.resolveError = "knob ui.detail.presentation_by_type is not registered";

  const result = await save("file", "docked");

  expect(result.ok).toBe(false);
  if (result.ok) throw new Error("unreachable");
  expect(result.reason).toContain("Nothing was saved");
  expect(result.reason).toContain("could not be read");
  // The whole defect in one assertion: no write left the browser, so the
  // person's other choices are still on the server.
  expect(ladder.writes()).toHaveLength(0);
  expect(ladder.state.value).toEqual({ task: "page" });
});

it("keeps every other entry when two different types are saved in turn", async () => {
  const ladder = fakeLadder({});

  const first = await save("file", "docked");
  const second = await save("task", "page");

  expect(first.ok).toBe(true);
  expect(second.ok).toBe(true);
  expect(ladder.state.value).toEqual({ file: "docked", task: "page" });
  expect(ladder.writes()).toHaveLength(2);
});

it("re-reads the ladder before merging, so it cannot clobber another tab's save", async () => {
  const ladder = fakeLadder({ note: "window" });
  // A mounted reader resolved this key a moment ago (the opener warms it on
  // every hover), so the 60s cache is WARM and holds that answer.
  await ensureEffectiveKnob(ORG, USER, "ui.detail.presentation_by_type");

  // Another tab — or another device — saves a different type. Nothing tells
  // this tab, and its cached map is now a minute out of date.
  ladder.state.value = { note: "window", task: "page" };

  const result = await save("file", "docked");

  expect(result.ok).toBe(true);
  // Merging into the CACHED map would have written {note, file} and silently
  // dropped the other tab's `task`.
  expect(ladder.state.value).toEqual({ note: "window", task: "page", file: "docked" });
});

it("refuses rather than overwrite a value that is not a map of entries", async () => {
  const ladder = fakeLadder("docked");

  const result = await save("file", "window");

  expect(result.ok).toBe(false);
  if (result.ok) throw new Error("unreachable");
  expect(result.reason).toContain("not a");
  expect(ladder.writes()).toHaveLength(0);
  expect(ladder.state.value).toBe("docked");
});

it("treats an unset value as an empty map — nothing exists to lose", async () => {
  const ladder = fakeLadder(null);

  const result = await save("file", "docked");

  expect(result).toEqual({ ok: true, map: { file: "docked" } });
  expect(ladder.state.value).toEqual({ file: "docked" });
});

it("writes at the person's own rung, through the platform door, once", async () => {
  const ladder = fakeLadder({});

  await save("file", "docked");

  expect(ladder.writes()).toHaveLength(1);
  expect(ladder.writes()[0].args).toMatchObject({
    p_feature: "ui.detail",
    p_key: "presentation_by_type",
    p_scope_kind: "user",
    p_scope_id: USER,
    p_organization_id: ORG,
    p_value: { file: "docked" },
  });
  // The read comes FIRST, always: a write before it would be the defect.
  expect(ladder.calls[0].fn).toBe("knob_resolve");
});
