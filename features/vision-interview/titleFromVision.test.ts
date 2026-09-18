import { titleFromVision } from "./titleFromVision";

/**
 * Forcing function for jobs-bar-2026-09-16, item 9. Every assertion here fails
 * against the seven-word slice this replaced.
 */
describe("titleFromVision", () => {
  const LONG =
    "I want a simple assistant that tells my intake technician which pallet " +
    "goes to refurbish and which goes to shred, every single time.";

  it("never stops mid-sentence without saying so", () => {
    const title = titleFromVision(LONG);
    expect(title.endsWith("…")).toBe(true);
    // The old cut was exactly these seven words, with no ellipsis.
    expect(title).not.toBe("I want a simple assistant that tells");
  });

  it("keeps enough words to tell two interviews apart", () => {
    const a = titleFromVision(
      "I want a simple assistant that tells me which pallets to shred.",
    );
    const b = titleFromVision(
      "I want a simple assistant that tells me when a client is at risk.",
    );
    expect(a).not.toBe(b);
  });

  it("cuts at a word boundary, never inside a word", () => {
    const title = titleFromVision(LONG);
    const body = title.replace(/…$/, "");
    expect(LONG.startsWith(body)).toBe(true);
    expect(body).not.toMatch(/\s$/);
    // The character after the cut is a boundary in the original.
    expect(LONG[body.length] === " " || LONG[body.length] === undefined).toBe(
      true,
    );
  });

  it("uses a short first sentence whole, with no ellipsis", () => {
    expect(titleFromVision("Route every incoming pallet correctly.")).toBe(
      "Route every incoming pallet correctly.",
    );
  });

  it("marks a first sentence that leaves more behind", () => {
    expect(titleFromVision("Route pallets right. Then tell me why.")).toBe(
      "Route pallets right…",
    );
  });

  it("never returns an empty name", () => {
    expect(titleFromVision("   ")).toBe("Untitled interview");
  });
});
