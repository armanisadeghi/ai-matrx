// A STALLED SECTION NEVER FREEZES THE RUN (2026-09-30).
//
// Live: a 4-card deck from an 87k-character transcript sat on "Making 4 cards"
// for over 20 minutes. Each section's agent call was awaited with no end-to-end
// bound: the documented 120s ceiling only covered extraction AFTER the stream
// ended, so a section whose server never answered (requests held ~3 min before
// any response, then cut by a server restart) kept the whole run waiting
// forever, and the person saw nothing move.
//
// The law these tests hold: every section attempt has a deadline; a stalled or
// failed section is retried once; a section that still fails is reported the
// moment it fails; and the run always ends.
import { knobInt } from "@/lib/knobs/featureKnobs";
import { runAgentExtraction } from "../runAgentExtraction";
import { segmentedGenerate } from "../segmentedGenerate";
import type { ConvertContext, ConvertProgress } from "../types";

jest.mock("@/lib/knobs/featureKnobs", () => ({ knobInt: jest.fn() }));
jest.mock("../runAgentExtraction", () => ({ runAgentExtraction: jest.fn() }));

const VALUES: Record<string, number> = {
  segment_target_chars: 100,
  max_segments: 20,
  max_items_total: 50,
  min_items_total: 2,
  items_per_segment_deck: 2,
  segment_concurrency: 4,
};

beforeEach(() => {
  jest.mocked(knobInt).mockImplementation(async (_f, key) => {
    const v = VALUES[key];
    if (v === undefined) throw new Error(`Unexpected knob: ${key}`);
    return v;
  });
  jest.mocked(runAgentExtraction).mockReset();
});

/** Four headed sections, each bigger than half a segment so none pack together. */
const FOUR_SECTIONS = Array.from(
  { length: 4 },
  (_, i) => `## Section ${i + 1}\n${"diffusion across a membrane ".repeat(3)}END${i + 1}`,
).join("\n\n");

const sectionOf = (vars: Record<string, string>) => /END(\d)/.exec(vars.text ?? "")?.[1] ?? "?";

const cards = (n: string) => ({
  value: [{ q: `section ${n} question about osmosis gradient ${n}` }],
  requestId: `req-${n}`,
  conversationId: `conv-${n}`,
});

function run(seen: ConvertProgress[], timeoutMs = 60) {
  const ctx = {
    dispatch: jest.fn(),
    store: {},
    orgId: "org",
    onProgress: (p: ConvertProgress) => seen.push({ ...p }),
  } as unknown as ConvertContext;
  return segmentedGenerate<{ q: string }>({
    ctx,
    source: { text: FOUR_SECTIONS } as never,
    targetKind: "deck",
    options: { count: 4 } as never,
    mandateKey: "flashcards.generate_from_source" as never,
    surfaceKey: "test",
    sourceFeature: "education-flashcards" as never,
    variables: (segment) => ({ text: segment.text }),
    extract: (v) => v as { q: string }[],
    identity: (x) => x.q,
    timeoutMs,
  });
}

/** Resolves with "still running" if the run has not ended within `ms`. */
const within = <T,>(p: Promise<T>, ms: number) =>
  Promise.race([p, new Promise<"still running">((r) => setTimeout(() => r("still running"), ms))]);

describe("a stalled section never freezes the run", () => {
  it("ends the run when one section's call never returns", async () => {
    jest.mocked(runAgentExtraction).mockImplementation(async (_d, _s, opts) => {
      const n = sectionOf(opts.variables);
      if (n === "3") return new Promise(() => {}) as never; // the server never answers
      return cards(n) as never;
    });
    const seen: ConvertProgress[] = [];
    const result = await within(run(seen), 2_000);
    expect(result).not.toBe("still running");
    if (result === "still running") return;
    expect(result.missedCount).toBe(1);
    expect(result.items).toHaveLength(3);
    expect(result.gapNote).toContain("1 section could not be covered");
  });

  it("retries a stalled section once and keeps its cards when the retry answers", async () => {
    const attempts: Record<string, number> = {};
    jest.mocked(runAgentExtraction).mockImplementation(async (_d, _s, opts) => {
      const n = sectionOf(opts.variables);
      attempts[n] = (attempts[n] ?? 0) + 1;
      if (n === "2" && attempts[n] === 1) return new Promise(() => {}) as never;
      return cards(n) as never;
    });
    const seen: ConvertProgress[] = [];
    const result = await within(run(seen), 2_000);
    expect(result).not.toBe("still running");
    if (result === "still running") return;
    expect(attempts["2"]).toBe(2);
    expect(result.missedCount).toBe(0);
    expect(result.items).toHaveLength(4);
    // The person saw the retry, not a frozen line.
    expect(seen.some((p) => (p.retrying ?? 0) > 0)).toBe(true);
  });

  it("retries a section that failed fast (a server crash) instead of shipping a gap", async () => {
    const attempts: Record<string, number> = {};
    jest.mocked(runAgentExtraction).mockImplementation(async (_d, _s, opts) => {
      const n = sectionOf(opts.variables);
      attempts[n] = (attempts[n] ?? 0) + 1;
      if (n === "4" && attempts[n] === 1) {
        throw new Error("Postgres cancelled this statement to break a lock collision (55P03)");
      }
      return cards(n) as never;
    });
    const result = await run([]);
    expect(attempts["4"]).toBe(2);
    expect(result.missedCount).toBe(0);
    expect(result.items).toHaveLength(4);
  });

  it("asks the stalled call to stop when its deadline passes", async () => {
    const signals: AbortSignal[] = [];
    jest.mocked(runAgentExtraction).mockImplementation(async (_d, _s, opts) => {
      if (opts.signal) signals.push(opts.signal);
      return new Promise(() => {}) as never;
    });
    const result = await within(run([], 30), 2_000);
    expect(result).not.toBe("still running");
    // Every attempt (4 sections x 2 attempts) was handed a signal and aborted.
    expect(signals).toHaveLength(8);
    for (const s of signals) expect(s.aborted).toBe(true);
  });

  it("reports progress from the start and each failure the moment it happens", async () => {
    jest.mocked(runAgentExtraction).mockImplementation(async (_d, _s, opts) => {
      const n = sectionOf(opts.variables);
      if (n === "1") throw new Error("agent failed");
      // The other sections answer well after section 1 has failed twice.
      await new Promise((r) => setTimeout(r, 40));
      return cards(n) as never;
    });
    const seen: ConvertProgress[] = [];
    const result = await run(seen, 500);
    expect(seen[0]).toMatchObject({ done: 0, total: 4, items: 0 });
    const failedAt = seen.findIndex((p) => (p.failed ?? 0) === 1);
    const firstSuccess = seen.findIndex((p) => p.items > 0);
    expect(failedAt).toBeGreaterThan(-1);
    expect(failedAt).toBeLessThan(firstSuccess);
    expect(seen[seen.length - 1]).toMatchObject({ done: 4, total: 4, failed: 1 });
    expect(result.missedCount).toBe(1);
  });
});
