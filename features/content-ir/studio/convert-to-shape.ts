import { humanizeKind } from "@/features/content-ir/kinds/kind-markdown-utils";
import { isJsonObject } from "@/types/json";

export interface ShapeSampleAnalysis {
  isValidJson: boolean;
  rootKind: string | null;
  suggestedName: string;
  errorMessage: string | null;
}

/** Inspect a JSON sample without claiming a kind from nested data. */
export function analyzeShapeSample(content: string): ShapeSampleAnalysis {
  let value: unknown;

  try {
    value = JSON.parse(content);
  } catch (error: unknown) {
    return {
      isValidJson: false,
      rootKind: null,
      suggestedName: "",
      errorMessage:
        error instanceof Error
          ? error.message
          : "The JSON could not be parsed.",
    };
  }

  const kindValue = isJsonObject(value) ? value.__kind : undefined;
  const rootKind =
    typeof kindValue === "string" && kindValue.trim() ? kindValue.trim() : null;

  return {
    isValidJson: true,
    rootKind,
    suggestedName: rootKind ? humanizeKind(rootKind) : "",
    errorMessage: null,
  };
}

/** Build only the human-authored draft; the JSON itself travels as a variable. */
export function buildConvertToShapeIntent(
  requestedName: string,
  rootKind: string | null,
): string {
  const name = requestedName.trim();

  if (rootKind) {
    return `Review the attached JSON sample and its existing __kind "${rootKind}". I want this Shape called "${name}". First inspect whether that Shape already exists and reuse or improve it instead of creating a duplicate. Then make sure its schema, sample, loading state, and output component render this data cleanly through the streaming Markdown system.`;
  }

  return `Create a reusable Shape called "${name}" from the attached JSON sample. Infer the correct __kind slug and schema from the real payload, then create or improve the output component so this data renders clearly through the streaming Markdown system.`;
}
