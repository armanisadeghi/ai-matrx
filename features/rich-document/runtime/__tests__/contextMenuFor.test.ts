/**
 * ALC-15 verifier finding 1: content a person can act on had NO right-click /
 * long-press menu unless its host opted in (a note's preview at phone width
 * opened nothing), so the bar offered actions the content itself would not.
 * Break it names: content with a visible action surface gets no menu → red.
 */
import { contextMenuFor } from "../contextMenuFor";

it.each([
  ["a bar", undefined, "bar", true],
  ["a mini bar (the phone note preview)", undefined, "mini-bar", true],
  ["a ⋯ only", undefined, "icon-only", true],
  ["an explicit opt-out", false, "bar", false],
  ["no actions at all", undefined, "none", false],
  ["a remote surface (its bar lives elsewhere, the host decides)", undefined, "remote", false],
  ["an explicit opt-in with no bar", true, "none", true],
] as const)("%s", (_name, prop, variant, expected) => {
  expect(Boolean(contextMenuFor(prop, variant))).toBe(expected);
});

it("keeps a host's extra / exclude options", () => {
  expect(contextMenuFor({ exclude: ["print"] }, "bar")).toEqual({ exclude: ["print"] });
});
