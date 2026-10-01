// /transcripts and the Knowledge library show the SAME length for one transcript.
// The library prints the Source's last segment end as a clock (12:44, floored);
// the transcript list prints its duration_seconds compact — it must floor too, or
// a 764.6s YouTube transcript reads "12m 45s" here and "12:44" there.
import { formatDurationMs } from "@ai-matrx/kit/format";
import { formatDuration } from "./types";
import { transcriptDurationSeconds } from "../format";

describe("formatDuration", () => {
  it("floors like the library clock, so both screens agree", () => {
    for (const seconds of [764.6, 89.08, 59.99, 3599.9]) {
      const clock = formatDurationMs(seconds * 1000); // library: "m:ss", floored
      const [m, s] = clock.split(":").map(Number);
      const compact = formatDuration(seconds);
      if (m === 0) expect(compact).toBe(`${s}s`);
      else expect(compact).toBe(`${m}m ${String(s).padStart(2, "0")}s`);
    }
  });

  it("an unknown length is a dash, never 0s", () => {
    expect(formatDuration(null)).toBe("—");
    expect(formatDuration(0)).toBe("—");
  });
});

describe("transcriptDurationSeconds — the client twin of transcripts.duration_seconds", () => {
  it("a YouTube transcript with no stored length reads its last segment's end", () => {
    expect(
      transcriptDurationSeconds({
        metadata: {},
        segments: [{ start: 0, end: 4.2 }, { start: 760, end: 764.6 }],
      }),
    ).toBe(764.6);
  });

  it("the stored recording length wins; ms and seconds-only segments work; nothing known is null", () => {
    expect(transcriptDurationSeconds({ metadata: { duration: 60 }, segments: [{ seconds: 58 }] })).toBe(60);
    expect(transcriptDurationSeconds({ metadata: {}, segments: [{ start_ms: 1000, end_ms: 89080 }] })).toBe(89.08);
    expect(transcriptDurationSeconds({ metadata: {}, segments: [{ seconds: 58 }] })).toBe(58);
    expect(transcriptDurationSeconds({ metadata: {}, segments: [] })).toBeNull();
  });
});
