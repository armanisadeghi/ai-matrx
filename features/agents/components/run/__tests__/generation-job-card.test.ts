/**
 * The video job card's facts are honest: a variable-bound duration (the run
 * form's answer) wins over the literal setting, the estimate is price × the
 * resolved seconds and says it is one, and when either half is unknown the
 * card says the cost arrives with the video instead of inventing a number.
 */

jest.mock("@/utils/supabase/client", () => ({ supabase: {} }));
jest.mock("@/lib/diagnostics/errorCaptureStore", () => ({ captureError: jest.fn() }));

import {
  describeEstimate,
  estimateVideoJob,
  formatElapsed,
  resolvedControl,
} from "@/features/agents/components/run/GenerationJobCard";
import { readVideoSecondPoints } from "@/features/agents/components/run/useVideoSecondPoints";

test("a variable bound to the control wins over the literal setting", () => {
  const defs = [{ name: "clip_length", control: { key: "duration_seconds" } }];
  expect(resolvedControl("duration_seconds", { duration_seconds: 4 }, defs, { clip_length: "8" })).toBe("8");
  expect(resolvedControl("duration_seconds", { duration_seconds: 4 }, defs, { clip_length: "" })).toBe(4);
  expect(resolvedControl("aspect_ratio", { aspect_ratio: "9:16" }, defs, {})).toBe("9:16");
});

test("the estimate is points per second times the resolved duration, in points for everyone", () => {
  const e = estimateVideoJob("8", 8000); // $0.40/s = 8,000 points/s
  expect(e.points).toBe(64_000);
  expect(describeEstimate(e)).toBe("≈ 64,000 points (8,000 points/s × 8 s)");
  expect(describeEstimate(e)).not.toContain("$");
});

test("dollars appear only when the admin unit is passed", () => {
  expect(describeEstimate(estimateVideoJob("8", 8000), "usd")).toBe("≈ $3.20 ($0.40/s × 8 s)");
});

test("an unknown price or duration is said, never invented", () => {
  expect(describeEstimate(estimateVideoJob(undefined, 8000))).toMatch(/duration set by the model/);
  expect(describeEstimate(estimateVideoJob(8, null))).toBe("Cost shows when the video lands");
});

test("only a per-second points price is read from the member-readable catalog view", () => {
  expect(readVideoSecondPoints({ usage_basis: "video_second_output", points_per_million_output: 8000 })).toBe(8000);
  expect(readVideoSecondPoints({ usage_basis: "video_unit_output", points_per_million_output: 32000 })).toBeNull();
  expect(readVideoSecondPoints(null)).toBeNull();
});

test("elapsed reads m:ss", () => {
  expect(formatElapsed(72_000)).toBe("1:12");
  expect(formatElapsed(-5)).toBe("0:00");
});
