/**
 * @jest-environment jsdom
 *
 * The pending-write primitive (GATES-TAIL-2): a key is pending exactly while its write is in
 * flight, a second run for a pending key is skipped (no second write), and a refusal is toasted
 * in words — never the raw error.
 */
import React, { act } from "react";
import { createRoot } from "react-dom/client";

const toastError = jest.fn();
jest.mock("@/lib/toast", () => ({ toast: { error: (...a: unknown[]) => toastError(...a) } }));

import { usePendingWrites, type PendingWrites } from "../usePendingWrites";
import { describeWriteFailure } from "../writeFailure";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function mount() {
  let latest!: PendingWrites;
  function Probe() {
    latest = usePendingWrites();
    return null;
  }
  const root = createRoot(document.createElement("div"));
  act(() => root.render(<Probe />));
  return { h: () => latest, unmount: () => act(() => root.unmount()) };
}

beforeEach(() => toastError.mockReset());

it("is pending while in flight, skips a second run, and clears once it lands", async () => {
  const v = mount();
  let answer!: (x: string) => void;
  const write = jest.fn(() => new Promise<string>((r) => { answer = r; }));
  let first!: Promise<unknown>;
  act(() => { first = v.h().run("row-1", write, { action: "turn this on" }); });
  expect(v.h().isPending("row-1")).toBe(true);
  expect(v.h().isPending("row-2")).toBe(false);
  let second!: unknown;
  await act(async () => { second = await v.h().run("row-1", write, { action: "turn this on" }); });
  expect(second).toEqual({ ok: false, skipped: true });
  expect(write).toHaveBeenCalledTimes(1);
  await act(async () => { answer("done"); await first; });
  expect(await first).toEqual({ ok: true, value: "done" });
  expect(v.h().isPending("row-1")).toBe(false);
  v.unmount();
});

it("a refusal is toasted in words and the key is released", async () => {
  const v = mount();
  const refusal = Object.assign(new Error("permission denied for table binding"), { code: "42501" });
  let result!: unknown;
  await act(async () => {
    result = await v.h().run("row-1", () => Promise.reject(refusal), { action: "turn this on", remedy: "Try again." });
  });
  expect(result).toMatchObject({ ok: false });
  expect(v.h().isPending("row-1")).toBe(false);
  expect(toastError).toHaveBeenCalledWith("Could not turn this on.", {
    description: "You do not have permission to do this. Try again.",
  });
  v.unmount();
});

describe("describeWriteFailure words the database's refusals", () => {
  const say = (err: unknown) => describeWriteFailure(err, { action: "save it", remedy: "Try again." }).description;
  it.each([
    [{ code: "23505", message: 'duplicate key value violates unique constraint "x_key"' }, /already exists/],
    [{ code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" }, /no longer there/],
    [{ code: "57014", message: "canceling statement due to statement timeout" }, /too long/],
    [{ code: "XX000", message: "internal error" }, /database refused/],
    ["new row violates row-level security policy", /Something went wrong/],
    ["That name is taken", /That name is taken\./],
  ])("%j", (err, want) => {
    expect(say(err)).toMatch(want);
    expect(say(err)).not.toMatch(/violates|JSON object|canceling statement|x_key/);
  });
});
