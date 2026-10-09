/**
 * Agent Factory R59: at ~800px the card's proof badge sat on top of the action buttons,
 * because it was pinned to the card's bottom-right corner and the bar runs the whole width.
 * The badge may never be pinned to the card's own bottom edge; it lives inside the body,
 * in padding reserved for it (so it also arrives without moving anything).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(join(__dirname, "..", "AgentCard.tsx"), "utf8");

describe("AgentCard proof badge", () => {
  it("is never given absolute bottom-corner classes of its own", () => {
    const usage = source.match(/<AgentProofBadge[^>]*>/g) ?? [];
    expect(usage.length).toBe(1);
    expect(usage[0]).not.toMatch(/absolute|bottom-|right-\d/);
  });

  it("sits in a strip inside the body, whose bottom padding is reserved for it", () => {
    const body = source.match(/<div className="([^"]*group\/entity-ref[^"]*)"/);
    expect(body?.[1]).toMatch(/\brelative\b/);
    expect(body?.[1]).toMatch(/\bpb-\d/);
    expect(source).toMatch(/absolute inset-x-0 bottom-\S+ flex justify-center">\s*<AgentProofBadge/);
  });
});
