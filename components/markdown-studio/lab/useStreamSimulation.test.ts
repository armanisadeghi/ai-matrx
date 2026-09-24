import { progressForText, waitBeforeChunk, type StreamSimProgress } from "./useStreamSimulation";
import { generateChunks } from "./stream-chunks";

const done = (text: string): StreamSimProgress => ({
  isRunning: false,
  progress: 100,
  chunksProcessed: 735,
  totalChunks: 735,
  elapsedMs: 59914,
  msPerChunk: 81.5,
  targetDelayMs: 30,
  text,
});

describe("stream simulation readout (RC-B1 verify D4)", () => {
  it("never shows a previous buffer's run against new content", () => {
    const last = done("old sample");
    expect(progressForText(last, "old sample")).toBe(last);
    const shown = progressForText(last, "a freshly loaded note");
    expect(shown.totalChunks).toBe(0);
    expect(shown.progress).toBe(0);
  });

  it("schedules chunks against the clock so render cost does not add to the delay", () => {
    // Render of chunk 0 took 50 ms; chunk 1 is due at t0 + 2*30 = 60 → wait 10, not 30.
    expect(waitBeforeChunk(1, 30, 0, 50)).toBe(10);
    // Rendering slower than the delay: no extra wait at all.
    expect(waitBeforeChunk(5, 30, 0, 400)).toBe(0);
    // On schedule: the full remaining delay.
    expect(waitBeforeChunk(3, 30, 0, 90)).toBe(30);
  });

  it("every chunk strategy joins back to the exact text", () => {
    const text = 'Line one\n\n  indented {"a": [1, "two"]}\nlast';
    for (const strategy of ["random", "char-by-char", "word", "line", "mid-json"] as const) {
      expect(generateChunks(text, { strategy, minChunkSize: 1, maxChunkSize: 7 }).join("")).toBe(text);
    }
  });
});
