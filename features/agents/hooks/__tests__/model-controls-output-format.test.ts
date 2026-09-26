/**
 * `output_format` means two different things in the catalog: on a text model
 * (legacy rows) it is the TEXT response format (text / json_object /
 * json_schema) and is read as `response_format`; on an image model such as
 * GPT Image 2 it is the image FILE format (png / jpeg / webp), a real
 * LLMParams field of its own. Remapping the image one to `response_format`
 * showed GPT Image 2 a "Response Format" row whose choices stored nothing (or
 * `{ type: "png" }`), and made a stored `output_format` read as unknown.
 */

import {
  getModelDefaults,
  resolveModelControls,
} from "@/features/agents/hooks/useModelControls";
import type { AIModelRecord } from "@/features/ai-models/redux/modelRegistrySlice";

function model(id: string, controls: Record<string, unknown>): AIModelRecord {
  return { id, name: id, controls } as unknown as AIModelRecord;
}

const gptImage2 = model("gpt-image-2", {
  output_format: { enum: ["png", "jpeg", "webp"], type: "enum" },
  quality: { enum: ["auto", "low", "medium", "high"], type: "enum", default: "auto" },
});
const legacyTextModel = model("legacy-text", {
  output_format: { enum: ["text", "json_object", "json_schema"], default: "text" },
});

test("an image model's output_format stays output_format (the file format)", () => {
  const { normalizedControls } = resolveModelControls([gptImage2], "gpt-image-2");
  expect(normalizedControls?.response_format).toBeUndefined();
  expect(normalizedControls?.output_format?.enum).toEqual(["png", "jpeg", "webp"]);
  expect(normalizedControls?.quality?.default).toBe("auto");
});

test("a legacy text model's output_format is still read as response_format", () => {
  const { normalizedControls } = resolveModelControls([legacyTextModel], "legacy-text");
  expect(normalizedControls?.response_format?.enum).toEqual([
    "text",
    "json_object",
    "json_schema",
  ]);
  expect(normalizedControls?.output_format).toBeUndefined();
});

test("model defaults never turn an image file format into a response format", () => {
  expect(getModelDefaults(gptImage2)).not.toHaveProperty("response_format");
  expect(getModelDefaults(gptImage2).output_format).toBe("png");
  expect(getModelDefaults(legacyTextModel)).not.toHaveProperty("output_format");
});
