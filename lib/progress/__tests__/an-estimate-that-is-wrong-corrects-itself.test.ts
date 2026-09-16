/**
 * AN ESTIMATE THAT HAS BEEN OVERTAKEN CORRECTS ITSELF — a forcing function.
 *
 * Cold walk, 2026-09-16:
 *
 *   #7 — the Quick Build dialog said "Building — this takes about a minute."
 *        and then held that sentence, word for word, while step 2 ran for
 *        roughly three minutes. The promise was never updated and never
 *        explained. The only honest reading left on the screen was "stuck".
 *
 *   #5 — the Conductor's "Build with me" streamed two tool blocks and then sat
 *        for over two minutes with nothing in the viewport saying working,
 *        done or stuck; the Stop control existed but had scrolled out of view.
 *        Only leaving the page and reading a counter elsewhere proved the run
 *        had in fact finished.
 *
 * Both are one law: a screen is absent or honest, never dead and never lying.
 * What this holds down:
 *
 *   1. Before the usual time, the estimate says the usual time.
 *   2. After it, the sentence CHANGES: it says this one is taking longer, says
 *      how long it has actually been, and says nothing has failed — which is
 *      the only question a waiting person actually has.
 *   3. The Build reads a live clock, so the sentence can change at all. A
 *      correct sentence computed once at launch is the original bug.
 *   4. The live-turn state is pinned where it cannot scroll away, and carries
 *      a Stop — and that Stop is the SAME `cancelExecution` the composer
 *      dispatches, never a second implementation of stopping.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describeDuration, estimateSentence } from "../estimateSentence";

const REPO_ROOT = join(__dirname, "..", "..", "..");
const read = (relative: string) =>
  readFileSync(join(REPO_ROOT, relative), "utf8");

const MINUTE = 60_000;

describe("the sentence a person reads while they wait", () => {
  const build = (elapsedMs: number) =>
    estimateSentence({
      elapsedMs,
      usualMs: MINUTE,
      doing: "Building",
      keepsGoingWithoutYou: true,
    });

  it("promises the usual time while the promise still holds", () => {
    expect(build(10_000)).toBe("Building — this usually takes about a minute.");
  });

  it("does not cry wolf the instant the estimate ticks over", () => {
    expect(build(MINUTE + 5_000)).toContain("usually takes");
  });

  it("CHANGES once it has really been overtaken — the whole defect", () => {
    const atThreeMinutes = build(3 * MINUTE);
    expect(atThreeMinutes).not.toBe(build(10_000));
    expect(atThreeMinutes).toContain("longer than usual");
  });

  it("says how long it has actually been, in plain words", () => {
    expect(build(3 * MINUTE)).toContain("after 3 minutes");
    expect(build(2 * MINUTE)).toContain("after 2 minutes");
  });

  it("answers the only question a waiting person has: is this broken?", () => {
    expect(build(3 * MINUTE)).toContain("Nothing has failed");
  });

  it("says you may walk away when the work survives you", () => {
    expect(build(3 * MINUTE)).toContain("keeps going without you");
    expect(
      estimateSentence({
        elapsedMs: 3 * MINUTE,
        usualMs: MINUTE,
        doing: "Checking every rule",
      }),
    ).not.toContain("keeps going without you");
  });

  it("speaks in minutes, never in seconds or tildes", () => {
    expect(describeDuration(MINUTE)).toBe("about a minute");
    expect(describeDuration(3 * MINUTE)).toBe("about 3 minutes");
    expect(describeDuration(3 * MINUTE)).not.toMatch(/[~s]\d|\d+s/);
  });
});

describe("the Build's estimate can actually change", () => {
  const source = read("features/masterwork/build/useBuildRun.ts");

  it("no longer hardcodes the promise it used to break", () => {
    // Quoted in the fix's own comment, so the check is on the CODE: no string
    // literal reaches the description any more.
    const code = source.replace(/\/\*[\s\S]*?\*\//g, "");
    expect(code).not.toContain("this takes about a minute.");
    expect(source).toContain("description: run.rejoinedTarget");
  });

  it("reads a live clock while the run is active", () => {
    // Without an elapsed input the sentence is computed once and is exactly
    // as stale as the string it replaced.
    expect(source).toContain("estimateSentence");
    expect(source).toContain("elapsedMs");
    expect(source).toMatch(/setInterval/);
  });
});

describe("the live-turn state cannot scroll away", () => {
  const column = read(
    "features/agents/components/shared/AgentConversationColumn.tsx",
  );
  const bar = read("features/agents/components/shared/LiveTurnBar.tsx");

  it("is pinned in the region above the composer, not inside the transcript", () => {
    const barAt = column.indexOf("<LiveTurnBar");
    const inputAt = column.indexOf("<SmartAgentInput");
    const scrollAt = column.indexOf("ref={scrollRef}");
    expect(barAt).toBeGreaterThan(-1);
    // Below the scroll area, above the composer: the only always-visible slot.
    expect(barAt).toBeGreaterThan(scrollAt);
    expect(barAt).toBeLessThan(inputAt);
  });

  it("only appears while a turn is actually live", () => {
    expect(column).toContain("{isLiveRequest && <LiveTurnBar");
  });

  it("carries a Stop that is THE stop, not a second implementation of one", () => {
    expect(bar).toContain("cancelExecution");
    const composer = read(
      "features/agents/components/inputs/smart-input/SingleRowActionButtons.tsx",
    );
    expect(composer).toContain("cancelExecution");
  });

  it("says what is happening in plain words a non-technical person reads", () => {
    expect(bar).toContain('label = "Working…"');
  });
});
