/**
 * Streaming never shows raw markup (owner's words): a reasoning span whose
 * closer has not arrived yet (`The planner writes a <thinking> short scrat`)
 * is held back as pending, never printed as a literal tag — verify-RC-B3
 * round 3 B1 (/chat 313204e4… showed the raw tag for ~80 ms).
 */
import { preprocessProse } from "@/components/rich-content/prose/prose-prepare";
import { healStreamingMarkdown } from "@/components/markdown-core/stream-heal";

/** The live render pipeline for a text block: prose prep, then the streaming heal. */
const live = (text: string) => healStreamingMarkdown(preprocessProse(text));

describe("an open reasoning span while streaming", () => {
  test.each([
    "The planner writes a <thinking> short scrat",
    "The planner writes a <think>",
    "The planner writes a <reasoning> weigh the two routes",
  ])("%s → the tag never shows", (text) => {
    const out = live(text);
    expect(out).not.toMatch(/thinking|think&gt;|reasoning|&lt;/);
    expect(out).toContain("The planner writes a");
  });
  test("once the closer arrives the aside shows as italics", () => {
    expect(live("The planner writes a <thinking> short note </thinking> and")).toContain("<i>short note</i>");
  });
  test("a tag mentioned inside inline code is code, not a pending span", () => {
    expect(live("Search the log for `<thinking>` blocks")).toContain("`<thinking>`");
  });
});
