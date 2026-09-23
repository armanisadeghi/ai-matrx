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
import { readVideoSecondPrice } from "@/features/agents/components/run/useVideoSecondPrice";

test("a variable bound to the control wins over the literal setting", () => {
  const defs = [{ name: "clip_length", control: { key: "duration_seconds" } }];
  expect(resolvedControl("duration_seconds", { duration_seconds: 4 }, defs, { clip_length: "8" })).toBe("8");
  expect(resolvedControl("duration_seconds", { duration_seconds: 4 }, defs, { clip_length: "" })).toBe(4);
  expect(resolvedControl("aspect_ratio", { aspect_ratio: "9:16" }, defs, {})).toBe("9:16");
});

test("the estimate is price per second times the resolved duration, labelled as an estimate", () => {
  const e = estimateVideoJob("8", 0.4);
  expect(e.usd).toBeCloseTo(3.2);
  expect(describeEstimate(e)).toBe("≈ $3.20 ($0.40/s × 8 s)");
});

test("an unknown price or duration is said, never invented", () => {
  expect(describeEstimate(estimateVideoJob(undefined, 0.4))).toMatch(/duration set by the model/);
  expect(describeEstimate(estimateVideoJob(8, null))).toMatch(/no catalog price/);
});

test("only a per-second video price is read from the offering pricing", () => {
  expect(readVideoSecondPrice([{ usage_basis: "video_second_output", output_price: 0.4 }])).toBe(0.4);
  expect(readVideoSecondPrice([{ usage_basis: "video_unit_output", output_price: 1.6 }])).toBeNull();
  expect(readVideoSecondPrice(null)).toBeNull();
});

test("elapsed reads m:ss", () => {
  expect(formatElapsed(72_000)).toBe("1:12");
  expect(formatElapsed(-5)).toBe("0:00");
});
