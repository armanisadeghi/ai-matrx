/**
 * A block INSIDE the chat transcript never traps the transcript's scroll.
 *
 * `overscroll-behavior: contain` on a nested scroller stops scroll chaining —
 * and Chrome applies it even when that scroller has nothing to scroll. An
 * expanded tool card (max-h 26rem) fills a phone screen, so a finger landing
 * on it could not move the conversation: a reopened conversation "could not
 * scroll past 2 tool calls" and its final message was unreachable (phone run
 * PB-08 #2, 2026-10-01, measured: wheel on the card → transcript scrollTop
 * stayed 0; without the class → 1000).
 *
 * Menus, pickers and modals may contain (they are their own surface); a block
 * rendered in the transcript may not. Mutation: put `overscroll-contain` back
 * on ToolCallVisualization's body — this goes RED.
 */
import { execSync } from "node:child_process";

const TRANSCRIPT_BLOCK_ROOTS = [
  "features/tool-call-visualization",
  "components/mardown-display/chat-markdown",
];

it("no transcript block sets overscroll-contain", () => {
  const out = execSync(
    `git grep -n "overscroll-contain" -- ${TRANSCRIPT_BLOCK_ROOTS.map((r) => `'${r}/*.tsx'`).join(" ")} || true`,
    { encoding: "utf8" },
  ).trim();
  expect(out).toBe("");
});
