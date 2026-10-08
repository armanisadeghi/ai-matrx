/**
 * Round 38 (D4): a first-pass database block suspends on its seed (`useAwaitedBlockSeed`) and, when the seed
 * lands, the page's seed state records it as "landed" while the block is still suspended. The retry used to
 * take the "landed" shortcut and skip use(), which React reports as "This library called use() to suspend in
 * a previous render but did not call use() when it finished" (4 of 10 reloads of an admin page, live) and
 * which can throw the first pass off its hydration. The retry must read the seed through use() again.
 */
import { act, createElement, Suspense } from "react";
import { createRoot } from "react-dom/client";

import { SpaceSeedProvider, useAwaitedBlockSeed, type BlockSeed } from "../space-seed-context";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Probe({ id }: { id: string }) {
  const seed = useAwaitedBlockSeed(id);
  return createElement("span", null, seed ? "seeded" : "no seed");
}

it("a block that suspended on its seed reads it through use() again when it lands", async () => {
  const errors: string[] = [];
  const spy = jest.spyOn(console, "error").mockImplementation((...args: unknown[]) => void errors.push(args.map(String).join(" ")));
  let resolve!: (seed: BlockSeed | null) => void;
  const promise = new Promise<BlockSeed | null>((r) => (resolve = r));
  const host = document.createElement("div");
  const root = createRoot(host);
  await act(async () => {
    root.render(
      createElement(SpaceSeedProvider, { seeds: { b1: promise } }, createElement(Suspense, { fallback: "waiting" }, createElement(Probe, { id: "b1" }))),
    );
  });
  expect(host.textContent).toBe("waiting");
  await act(async () => {
    resolve({ records: null } as unknown as BlockSeed);
    await promise;
  });
  expect(host.textContent).toBe("seeded");
  expect(errors.filter((e) => /did not call use\(\)/.test(e))).toEqual([]);
  await act(async () => root.unmount());
  spy.mockRestore();
});
