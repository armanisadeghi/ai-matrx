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

// The same rule holds at the Redux boundary (fetchModelById → normalizeModel)
// and in the agent-settings parser — the live registry never sees a renamed
// image output_format.
import { normalizeModel, normalizePromptSettings } from "@/features/ai-models/utils/model-normalizer";
import { parseModelControls } from "@/lib/redux/slices/agent-settings/internal-utils";

test("the registry boundary keeps an image model's output_format", () => {
  const normalized = normalizeModel(gptImage2) as unknown as {
    controls: Record<string, unknown>;
  };
  expect(normalized.controls).toHaveProperty("output_format");
  expect(normalized.controls).not.toHaveProperty("response_format");
  const legacy = normalizeModel(legacyTextModel) as unknown as {
    controls: Record<string, unknown>;
  };
  expect(legacy.controls).toHaveProperty("response_format");
  expect(legacy.controls).not.toHaveProperty("output_format");
});

test("the agent-settings parser keeps an image model's output_format", () => {
  const parsed = parseModelControls(
    (gptImage2 as unknown as { controls: Record<string, unknown> }).controls,
  ) as unknown as Record<string, unknown>;
  expect(parsed).toHaveProperty("output_format");
  expect(parsed).not.toHaveProperty("response_format");
});

test("a stored file format stays output_format; a stored text format is a response format", () => {
  expect(normalizePromptSettings({ output_format: "png" })).toEqual({ output_format: "png" });
  expect(normalizePromptSettings({ output_format: "json_object" })).toEqual({
    response_format: { type: "json_object" },
  });
});
