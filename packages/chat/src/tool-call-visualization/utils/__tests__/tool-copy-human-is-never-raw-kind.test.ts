/**
 * The Copy button's `human` flavor for a tool result: a kind copies as its
 * markdown, never raw `{"__kind":…}`. The json/agent flavor (the bundle data)
 * keeps `__kind` — it is data.
 */
import { resultToHuman } from "../human-copy";
import {
  buildToolEntryBundle,
  toolEntriesSummaryToHuman,
  toolEntryBundleToHuman,
} from "../toolEntryBundle";
import type { ToolLifecycleEntry } from "../../../agents/types/request.types";

const KIND = { __kind: "checklist", title: "Packing", items: [{ text: "Passport" }] };
const entry = (result: unknown) =>
  ({
    callId: "c1",
    toolName: "make_list",
    displayName: "Make list",
    status: "completed",
    arguments: { topic: "trip" },
    result,
    events: [],
  }) as unknown as ToolLifecycleEntry;

describe("tool result human copy", () => {
  it("fixture sentinel: the old human copy (JSON.stringify) leaked the kind", () => {
    expect(JSON.stringify(KIND, null, 2)).toContain("__kind");
  });
  it("an object result carrying a kind copies as markdown", () => {
    const human = resultToHuman(KIND);
    expect(human).not.toContain("__kind");
    expect(human).toContain("Passport");
  });
  it("a string result of kind JSON (fenced or bare) copies as markdown", () => {
    for (const s of [JSON.stringify(KIND), `Done:\n\`\`\`json\n${JSON.stringify(KIND)}\n\`\`\``]) {
      expect(resultToHuman(s)).not.toContain("__kind");
      expect(resultToHuman(s)).toContain("Passport");
    }
  });
  it("a kind nested inside a plain object copies as markdown", () => {
    const human = resultToHuman({ ok: true, answer: KIND });
    expect(human).not.toContain("__kind");
    expect(human).toContain("Passport");
  });
  it("kindless results are unchanged", () => {
    expect(resultToHuman("plain")).toBe("plain");
    expect(resultToHuman({ a: 1 })).toBe(JSON.stringify({ a: 1 }, null, 2));
  });
  it("the entry bundle and the all-tools summary copy human without __kind; the data bundle keeps it", () => {
    expect(toolEntryBundleToHuman(entry(KIND))).not.toContain("__kind");
    expect(toolEntryBundleToHuman(entry(KIND))).toContain("Passport");
    expect(toolEntriesSummaryToHuman([entry(KIND), entry({ a: 1 })])).not.toContain("__kind");
    expect(JSON.stringify(buildToolEntryBundle(entry(KIND)))).toContain("__kind");
  });
  it("a kindless bundle copy is byte for byte the old JSON", () => {
    const e = entry({ a: 1 });
    expect(toolEntryBundleToHuman(e)).toBe(JSON.stringify(buildToolEntryBundle(e), null, 2));
  });
});
