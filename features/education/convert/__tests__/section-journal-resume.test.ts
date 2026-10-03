// A SECTION THAT RAN ON THE SERVER IS NEVER PAID FOR TWICE (2026-10-03).
//
// Live: a 6-output kit from four Sources ran 14 minutes in the tab; the tab
// closed and five of six aids were lost. The agent calls had finished on the
// server — only the tab's merge and save died. The study kit now keeps a
// receipt book (`sectionJournal.ts`): each section's conversation id. A retry
// over the SAME plan reads finished sections back from the server instead of
// running them, and runs only what never answered.
//
// The SUT is the real `segmentedGenerate`; the agent runner and the
// server read-back are the seams (the read-back is what a reload reaches).
import { knobInt } from "@/lib/knobs/featureKnobs";
import { runAgentExtraction } from "../runAgentExtraction";
import { recoverSectionValue } from "../sectionJournal";
import { segmentedGenerate } from "../segmentedGenerate";
import type { SectionJournal } from "../sectionJournal";
import type { ConvertContext } from "../types";

jest.mock("@/lib/knobs/featureKnobs", () => ({ knobInt: jest.fn() }));
jest.mock("../runAgentExtraction", () => ({ runAgentExtraction: jest.fn() }));
jest.mock("../sectionJournal", () => ({
  ...jest.requireActual("../sectionJournal"),
  recoverSectionValue: jest.fn(),
}));

const VALUES: Record<string, number> = {
  segment_target_chars: 100,
  max_segments: 20,
  max_items_total: 50,
  min_items_total: 2,
  items_per_segment_deck: 1,
  segment_concurrency: 4,
};

const FOUR_SECTIONS = Array.from(
  { length: 4 },
  (_, i) => `## Section ${i + 1}\n${"diffusion across a membrane ".repeat(3)}END${i + 1}`,
).join("\n\n");

const sectionOf = (vars: Record<string, string>) => /END(\d)/.exec(vars.text ?? "")?.[1] ?? "?";

/** A journal kept in memory, as the kit keeps it in its run marker. */
function memoryJournal(initial: Record<string, Record<string, string>> = {}) {
  const book: Record<string, Record<string, string>> = structuredClone(initial);
  const journal: SectionJournal = {
    recorded: (planKey) => book[planKey] ?? {},
    started: (planKey, segmentId, conversationId) => {
      book[planKey] = { ...(book[planKey] ?? {}), [segmentId]: conversationId };
    },
  };
  return { journal, book };
}

function generate(sections?: SectionJournal) {
  const ctx = { dispatch: jest.fn(), store: {}, orgId: "org", sections } as unknown as ConvertContext;
  return segmentedGenerate<{ q: string }>({
    ctx,
    source: { text: FOUR_SECTIONS } as never,
    targetKind: "deck",
    // Four headed sections, folded to exactly four passes (the stalled-section shape).
    options: { count: 4 } as never,
    mandateKey: "flashcards.generate_from_source" as never,
    surfaceKey: "test",
    sourceFeature: "education-flashcards" as never,
    variables: (segment) => ({ text: segment.text }),
    extract: (v) => v as { q: string }[],
    identity: (x) => x.q,
    timeoutMs: 200,
  });
}

beforeEach(() => {
  jest.mocked(knobInt).mockImplementation(async (_f, key) => {
    const v = VALUES[key];
    if (v === undefined) throw new Error(`Unexpected knob: ${key}`);
    return v;
  });
  jest.mocked(runAgentExtraction).mockReset();
  jest.mocked(recoverSectionValue).mockReset();
});

describe("a continued output reads finished sections back instead of running them", () => {
  it("records every section's conversation as it starts", async () => {
    jest.mocked(runAgentExtraction).mockImplementation(async (_d, _s, opts) => {
      const n = sectionOf(opts.variables);
      opts.onConversationCreated?.(`conv-${n}`);
      return { value: [{ q: `osmosis question ${n}` }], requestId: `r${n}`, conversationId: `conv-${n}` } as never;
    });
    const { journal, book } = memoryJournal();
    await generate(journal);
    const [planKey] = Object.keys(book);
    expect(planKey).toMatch(/^deck:/);
    expect(Object.values(book[planKey]).sort()).toEqual(["conv-1", "conv-2", "conv-3", "conv-4"]);
  });

  it("runs only the sections that never answered, and still ships all four", async () => {
    // First attempt: every section starts; the page dies before any is merged.
    jest.mocked(runAgentExtraction).mockImplementation(async (_d, _s, opts) => {
      const n = sectionOf(opts.variables);
      opts.onConversationCreated?.(`conv-${n}`);
      return { value: [{ q: `osmosis question ${n}` }], requestId: `r${n}`, conversationId: `conv-${n}` } as never;
    });
    const first = memoryJournal();
    await generate(first.journal);

    // The retry: sections 1-3 finished on the server; section 4's run failed.
    jest.mocked(runAgentExtraction).mockClear();
    jest.mocked(recoverSectionValue).mockImplementation(async (conversationId) =>
      conversationId === "conv-4" ? null : [{ q: `osmosis question ${conversationId.slice(5)}` }],
    );
    const retry = memoryJournal(first.book);
    const result = await generate(retry.journal);

    const ranAgain = jest.mocked(runAgentExtraction).mock.calls.map(([, , o]) => sectionOf(o.variables));
    expect(ranAgain).toEqual(["4"]);
    expect(result.items.map((i) => i.q).sort()).toEqual([
      "osmosis question 1",
      "osmosis question 2",
      "osmosis question 3",
      "osmosis question 4",
    ]);
    expect(result.missedCount).toBe(0);
  });

  it("never reuses a section recorded for different material", async () => {
    jest.mocked(runAgentExtraction).mockImplementation(async (_d, _s, opts) => {
      const n = sectionOf(opts.variables);
      return { value: [{ q: `q ${n}` }], requestId: `r${n}`, conversationId: `c${n}` } as never;
    });
    const stale = memoryJournal({ "deck:othertext:4:4": { s1: "conv-x" } });
    await generate(stale.journal);
    expect(recoverSectionValue).not.toHaveBeenCalled();
    expect(runAgentExtraction).toHaveBeenCalledTimes(4);
  });

  it("reads a timed-out section back from the server instead of paying for it again", async () => {
    // Section 2's stream never reaches the tab (the call finished on the server).
    jest.mocked(runAgentExtraction).mockImplementation(async (_d, _s, opts) => {
      const n = sectionOf(opts.variables);
      opts.onConversationCreated?.(`conv-${n}`);
      if (n === "2") return new Promise(() => {}) as never;
      return { value: [{ q: `osmosis question ${n}` }], requestId: `r${n}`, conversationId: `conv-${n}` } as never;
    });
    jest.mocked(recoverSectionValue).mockImplementation(async (conversationId) =>
      conversationId === "conv-2" ? [{ q: "osmosis question 2" }] : null,
    );
    const result = await generate(memoryJournal().journal);
    const calls = jest.mocked(runAgentExtraction).mock.calls.map(([, , o]) => sectionOf(o.variables));
    expect(calls.filter((c) => c === "2")).toHaveLength(1);
    expect(result.items.map((i) => i.q)).toContain("osmosis question 2");
    expect(result.missedCount).toBe(0);
  });
});
