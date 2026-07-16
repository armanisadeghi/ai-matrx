/**
 * REGRESSION GUARD: the settled-turn agent-work fold is ORDER-PRESERVING and
 * never swallows the reply.
 *
 * Companion to interleave-ordering.test.ts — that file guards the walkers'
 * flat order; this one guards the post-hoc fold that wraps runs of settled
 * process noise (thinking / generic tools / short asides) into one
 * "Worked for Ns" group.
 */

import {
  foldAgentWork,
  formatWorkDuration,
  type AgentWorkClass,
  type AgentWorkFold,
  type FoldAgentWorkAccessors,
} from "../foldAgentWork";

interface Item {
  id: string;
  cls: AgentWorkClass;
  steps?: number;
  span?: { start: number; end: number };
}

const accessors: FoldAgentWorkAccessors<Item> = {
  classify: (i) => i.cls,
  stepsOf: (i) => i.steps ?? 1,
  spanOf: (i) => i.span ?? null,
};

const work = (id: string, span?: Item["span"], steps?: number): Item => ({
  id,
  cls: "work",
  span,
  steps,
});
const text = (id: string): Item => ({ id, cls: "shortText" });
const visible = (id: string): Item => ({ id, cls: "visible" });

function flatten(out: Array<Item | AgentWorkFold<Item>>): string[] {
  return out.flatMap((x) =>
    "kind" in x && x.kind === "agent_work"
      ? x.items.map((i) => i.id)
      : [(x as Item).id],
  );
}

describe("foldAgentWork", () => {
  test("thinking -> tool -> aside -> tool folds into one group; intro and reply stay out", () => {
    const items = [
      text("intro"),
      work("think1"),
      work("tool1"),
      text("aside"),
      work("tool2"),
      text("reply"),
      visible("answer"),
    ];
    const out = foldAgentWork(items, accessors);
    // intro (leading shortText) and reply (trailing shortText) trimmed out.
    expect(out.map((x) => ("kind" in x && x.kind === "agent_work" ? "GROUP" : (x as Item).id))).toEqual([
      "intro",
      "GROUP",
      "reply",
      "answer",
    ]);
    const group = out[1] as AgentWorkFold<Item>;
    expect(group.items.map((i) => i.id)).toEqual([
      "think1",
      "tool1",
      "aside",
      "tool2",
    ]);
    expect(group.stepCount).toBe(4);
  });

  test("flattened output is ALWAYS identical to input (order law)", () => {
    const items = [
      visible("a"),
      work("b"),
      text("c"),
      work("d"),
      visible("e"),
      work("f"),
      work("g"),
      text("h"),
    ];
    expect(flatten(foldAgentWork(items, accessors))).toEqual(
      items.map((i) => i.id),
    );
  });

  test("a visible item (result-is-purpose tool, media, long text) breaks the run", () => {
    const items = [work("t1"), work("t2"), visible("search"), work("t3"), work("t4")];
    const out = foldAgentWork(items, accessors);
    expect(out).toHaveLength(3);
    expect((out[0] as AgentWorkFold<Item>).kind).toBe("agent_work");
    expect((out[1] as Item).id).toBe("search");
    expect((out[2] as AgentWorkFold<Item>).kind).toBe("agent_work");
  });

  test("a lone work item does not fold; short texts alone never fold", () => {
    expect(foldAgentWork([work("only")], accessors)).toEqual([work("only")]);
    const texts = [text("a"), text("b"), text("c")];
    expect(foldAgentWork(texts, accessors)).toEqual(texts);
  });

  test("duration spans min start to max end across the group's tools", () => {
    const out = foldAgentWork(
      [work("t1", { start: 1_000, end: 5_000 }), work("t2", { start: 4_000, end: 27_000 }), work("think")],
      accessors,
    );
    expect((out[0] as AgentWorkFold<Item>).durationMs).toBe(26_000);
  });

  test("no timestamps -> null duration (header falls back to step count)", () => {
    const out = foldAgentWork([work("a"), work("b")], accessors);
    expect((out[0] as AgentWorkFold<Item>).durationMs).toBeNull();
  });

  test("tool batches contribute their call count to stepCount", () => {
    const out = foldAgentWork(
      [work("batch", undefined, 5), work("think")],
      accessors,
    );
    expect((out[0] as AgentWorkFold<Item>).stepCount).toBe(6);
  });
});

describe("formatWorkDuration", () => {
  test.each([
    [400, "1s"],
    [26_000, "26s"],
    [60_000, "1m"],
    [72_000, "1m 12s"],
  ])("%dms -> %s", (ms, expected) => {
    expect(formatWorkDuration(ms)).toBe(expected);
  });
});
