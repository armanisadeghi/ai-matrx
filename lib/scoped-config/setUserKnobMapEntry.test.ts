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
// 🚨 AND THE BASE IS THE PERSON'S OWN RUNG, NOT THE EFFECTIVE LADDER (NEW-3,
// VERIFY-U-P1-R2). Merging into the EFFECTIVE map (organization → user) and
// writing the result at the USER rung copies the organization's exceptions into
// the person's own row, where they stop tracking the organization for ever: the
// org later changes `contract` and that person still resolves the old value, on
// every type, with nothing on any screen saying why. "Organizations decide" is
// the law that breaks. The write reads the user rung SPECIFICALLY, refuses when
// that read fails, and leaves every organization exception to the ladder.
//
// Only `@/utils/supabase/client` is mocked, because the thing under test is what
// leaves the browser and in what order: the read that must succeed before the
// write, and the merge that must carry the person's other entries.

import { createClient } from "@/utils/supabase/client";

import { ensureEffectiveKnob, invalidateEffectiveKnob } from "./effectiveKnobs";
import { setUserKnobMapEntry } from "./service";

jest.mock("@/utils/supabase/client", () => ({ createClient: jest.fn() }));

const ORG = "11111111-1111-4111-8111-111111111111";
const USER = "22222222-2222-4222-8222-222222222222";
const KEY = { feature: "ui.detail", key: "presentation_by_type" };

type Call = { fn: string; args: Record<string, unknown> };

/**
 * A fake settings ladder that HOLDS both rungs, so a dropped entry is a real
 * absence at the end of a test rather than an argument we chose to assert on:
 *
 *   `org`  — the organization's own map (its exceptions for everyone).
 *   `user` — the person's own override row, which is what the write may replace.
 *
 * `knob_resolve` answers the EFFECTIVE value (user rung wins key by key here,
 * which is the most generous reading of the ladder — enough to prove the write
 * does not read it), and `platform.knob_override` answers the per-rung rows.
 */
function fakeLadder(initialUser: unknown, initialOrg: Record<string, unknown> | null = null) {
  const state = {
    value: initialUser,
    org: initialOrg,
    resolveError: null as string | null,
    rungReadError: null as string | null,
  };
  const calls: Call[] = [];

  const rpc = (fn: string, args: Record<string, unknown>) => {
    calls.push({ fn, args });
    if (fn === "knob_resolve") {
      const effective =
        state.org && state.value !== null && typeof state.value === "object"
          ? { ...state.org, ...(state.value as Record<string, unknown>) }
          : (state.value ?? state.org);
      return Promise.resolve(
        state.resolveError
          ? { data: null, error: { message: state.resolveError } }
          : { data: effective, error: null },
      );
    }
    if (fn === "knob_override_set") {
      state.value = args.p_value === null ? null : args.p_value;
      return Promise.resolve({ data: { ok: true }, error: null });
    }
    throw new Error(`unexpected rpc ${fn}`);
  };

  /** `platform.knob_override` — the per-rung LIST read, thenable like PostgREST. */
  const from = (table: string) => {
    calls.push({ fn: `from:${table}`, args: {} });
    const result = () =>
      state.rungReadError
        ? { data: null, error: { message: state.rungReadError } }
        : {
            data:
              state.value === null || state.value === undefined
                ? []
                : [
                    {
                      scope_kind: "user",
                      scope_id: USER,
                      value: state.value,
                      updated_at: null,
                      updated_by: null,
                      set_note: null,
                    },
                  ],
            error: null,
          };
    const builder: Record<string, unknown> = {};
    for (const method of ["select", "eq", "in", "order", "limit"]) {
      builder[method] = () => builder;
    }
    builder.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result()).then(resolve);
    return builder;
  };

  jest.mocked(createClient).mockReturnValue({
    rpc,
    from,
    schema: () => ({ rpc, from }),
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
  ladder.state.rungReadError = "permission denied for table knob_override";

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

it("reads the person's own rung fresh, so it cannot clobber another tab's save", async () => {
  const ladder = fakeLadder({ note: "window" });
  // A mounted reader resolved this key a moment ago (the opener warms it on
  // every hover), so the 60s effective cache is WARM and holds that answer.
  await ensureEffectiveKnob(ORG, USER, "ui.detail.presentation_by_type");

  // Another tab — or another device — saves a different type. Nothing tells
  // this tab, and its cached map is now a minute out of date.
  ladder.state.value = { note: "window", task: "page" };

  const result = await save("file", "docked");

  expect(result.ok).toBe(true);
  // Merging into the CACHED answer would have written {note, file} and silently
  // dropped the other tab's `task`.
  expect(ladder.state.value).toEqual({ note: "window", task: "page", file: "docked" });
});

// 🚨 NEW-3 — THE ORGANIZATION'S EXCEPTIONS ARE NOT COPIED INTO THE PERSON.
it("carries only the person's own entries, never the organization's", async () => {
  const ladder = fakeLadder(null, { contract: "page", invoice: "page" });

  const result = await save("file", "docked");

  expect(result).toEqual({ ok: true, map: { file: "docked" }, changed: true });
  // The write holds ONE key. Had it merged the effective map, the org's
  // `contract` and `invoice` would now be frozen in this person's row and the
  // organization could never change them for her again.
  expect(ladder.writes()[0].args.p_value).toEqual({ file: "docked" });
  expect(ladder.state.value).toEqual({ file: "docked" });
});

it("merges the person's OWN other entries over the organization's", async () => {
  const ladder = fakeLadder({ note: "page" }, { contract: "page" });

  await save("file", "docked");

  expect(ladder.writes()[0].args.p_value).toEqual({ note: "page", file: "docked" });
});

// 🚨 NEW-2 — AN EXCEPTION CAN BE TAKEN BACK, THROUGH THE SAME PRIMITIVE.
describe("removing one entry", () => {
  const remove = (entryKey: string) =>
    setUserKnobMapEntry({ ...KEY, entryKey, userId: USER, organizationId: ORG });

  it("deletes just that key from the person's own map", async () => {
    const ladder = fakeLadder({ file: "docked", task: "page" });

    const result = await remove("file");

    expect(result).toEqual({ ok: true, map: { task: "page" }, changed: true });
    expect(ladder.writes()[0].args.p_value).toEqual({ task: "page" });
    expect(ladder.state.value).toEqual({ task: "page" });
  });

  it("clears the whole override row when it was the last entry, so the ladder answers again", async () => {
    const ladder = fakeLadder({ file: "docked" });

    const result = await remove("file");

    expect(result).toEqual({ ok: true, map: {}, changed: true });
    // `value: null` CLEARS at the door — "inherits" and "set to nothing" must
    // never blur, and an empty map at the user rung is not the same as no row.
    expect(ladder.writes()[0].args.p_value).toBeNull();
    expect(ladder.state.value).toBeNull();
  });

  it("is a no-op write the person can repeat: removing what is not there writes nothing", async () => {
    const ladder = fakeLadder({ task: "page" });

    const result = await remove("file");

    // `changed: false` is how the caller knows to say so instead of "saved".
    expect(result).toEqual({ ok: true, map: { task: "page" }, changed: false });
    expect(ladder.writes()).toHaveLength(0);
  });

  it("still refuses when the person's own map cannot be read", async () => {
    const ladder = fakeLadder({ file: "docked" });
    ladder.state.rungReadError = "permission denied for table knob_override";

    const result = await remove("file");

    expect(result.ok).toBe(false);
    expect(ladder.writes()).toHaveLength(0);
  });
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

  expect(result).toEqual({ ok: true, map: { file: "docked" }, changed: true });
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
  // The read comes FIRST, always: a write before it would be the defect. And it
  // is the person's OWN rung (`platform.knob_override`), never the effective
  // ladder — merging the ladder is NEW-3.
  expect(ladder.calls[0].fn).toBe("from:knob_override");
  expect(ladder.calls.some((c) => c.fn === "knob_resolve")).toBe(false);
});
