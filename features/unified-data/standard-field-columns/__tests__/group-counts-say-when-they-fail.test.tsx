/**
 * @jest-environment jsdom
 */
// A group's whole-result count that could not be read is SAID (failed → the header says the
// number is this page's), never the page's number passed off silently; a read count is used.
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { useServerGroupCounts, type ServerGroupCounts } from "../useServerGroupCounts";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

it("a read count is the group's; a failed one is reported as failed", async () => {
  let out: ServerGroupCounts | null = null;
  const values = [true, "westside", null];
  function Probe() {
    out = useServerGroupCounts("cf:x", values, "q1", async (_id, value) => {
      if (value === "westside") throw new Error("503");
      return value === true ? 7 : 2;
    });
    return null;
  }
  const spy = jest.spyOn(console, "error").mockImplementation(() => {});
  const root = createRoot(document.createElement("div"));
  await act(async () => {
    root.render(<Probe />);
    await new Promise((r) => setTimeout(r, 20));
  });
  expect(out!.groupFacts({ value: true })).toEqual({ count: 7 });
  expect(out!.groupFacts({ value: null })).toEqual({ count: 2 });
  expect(out!.groupFacts({ value: "westside" })).toBeUndefined();
  expect(out!.failed("westside")).toBe(true);
  expect(out!.failed(true)).toBe(false);
  spy.mockRestore();
  act(() => root.unmount());
});
