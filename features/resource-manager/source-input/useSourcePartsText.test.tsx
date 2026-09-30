/**
 * A3-F: finding a word inside a Source's parts downloaded the Source's WHOLE text
 * into the browser (`/sources/resolve`, no limit — 400k+ characters for a long PDF)
 * and kept it in a module-level cache. The server now answers with part ids only
 * (`POST /sources/parts/search`); the browser asks once the person pauses typing,
 * only for words, and says so plainly when the text could not be searched.
 */
const searchSourceParts = jest.fn();
jest.mock("./sourceSetApi", () => ({
  searchSourceParts: (...args: unknown[]) => searchSourceParts(...args),
}));

import { createSourceRef } from "@ai-matrx/agents/sources";
import { renderHook } from "@/test-utils/renderHook";
import { useSourcePartsSearch } from "./useSourcePartsText";

const ref = createSourceRef("file", "0b8d1a52-2f0c-4a57-9d2c-3a6f0e8f1c11", {
  representation: "clean",
  include_segments: ["c-10"],
});

it("the pointer under test carries picked parts", () => expect(ref.include_segments).toEqual(["c-10"]));

beforeEach(() => {
  jest.useFakeTimers();
  searchSourceParts.mockReset();
});
afterEach(() => jest.useRealTimers());

async function settle(handle: { act: (fn: () => void | Promise<void>) => Promise<void> }) {
  await handle.act(async () => {
    jest.advanceTimersByTime(300);
  });
  await handle.act(async () => {
    await Promise.resolve();
  });
}

it("asks the server for the ids of parts holding the words, after typing pauses", async () => {
  searchSourceParts.mockResolvedValue({ segment_ids: ["c-22"], truncated: false });
  const hook = await renderHook(() => useSourcePartsSearch(ref, "  Thylakoid  Membrane "));
  expect(hook.current.reading).toBe(true);
  expect(searchSourceParts).not.toHaveBeenCalled();

  await settle(hook);
  expect(searchSourceParts).toHaveBeenCalledTimes(1);
  const [sentRef, query] = searchSourceParts.mock.calls[0]!;
  // The whole Source in the chosen form — picked parts never narrow a search.
  expect(sentRef).toMatchObject({ resource_id: ref.resource_id, representation: "clean" });
  expect(sentRef.include_segments).toBeUndefined();
  expect(query).toBe("thylakoid membrane");
  expect([...(hook.current.matches ?? [])]).toEqual(["c-22"]);
  expect(hook.current.reading).toBe(false);
  expect(hook.current.error).toBeNull();
  await hook.unmount();
});

it("never asks for a page or a range", async () => {
  const hook = await renderHook(() => useSourcePartsSearch(ref, "3-10"));
  await settle(hook);
  expect(searchSourceParts).not.toHaveBeenCalled();
  expect(hook.current.reading).toBe(false);
  await hook.unmount();
});

it("says plainly when the text could not be searched", async () => {
  searchSourceParts.mockRejectedValue(new Error("network"));
  const hook = await renderHook(() => useSourcePartsSearch(ref, "photosynthesis"));
  await settle(hook);
  expect(hook.current.error).toMatch(/Only part titles and opening words are searched/);
  expect(hook.current.matches).toBeUndefined();
  await hook.unmount();
});

it("passes on the server's reason when the Source cannot be searched", async () => {
  searchSourceParts.mockResolvedValue({
    segment_ids: [],
    unavailable: "no_access",
    detail: "You do not have access to this Source. Ask its owner to share it, or remove it.",
  });
  const hook = await renderHook(() => useSourcePartsSearch(ref, "photosynthesis"));
  await settle(hook);
  expect(hook.current.error).toMatch(/do not have access/);
  await hook.unmount();
});
