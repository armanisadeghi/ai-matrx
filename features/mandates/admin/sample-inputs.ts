import type { AgentSampleRow } from "@/features/agents/samples/service";
import type { ServedInput } from "@/features/workflow-runtime/served-form/served-input";
import { isJsonObject, type JsonObject } from "@/types/json";
import {
  parseConsumptionMapWithDrops,
  sourceChannel,
} from "../provision-shapes";

/** Samples store either mandate inputs or holder variables. Never guess across those contracts. */
export function sampleInputsForMandate(
  sample: Pick<AgentSampleRow, "variables" | "mandate_id">,
  mandateId: string,
  fields: readonly ServedInput[],
  rawMap: unknown,
): { values: JsonObject; skipped: string[] } {
  if (sample.mandate_id && sample.mandate_id !== mandateId)
    throw new Error(
      "This sample belongs to a different mandate. Its provision inputs cannot be reused automatically.",
    );
  const variables = isJsonObject(sample.variables) ? sample.variables : {};
  const editable = new Set(
    fields.filter((field) => !field.pinned).map((field) => field.name),
  );
  const values: JsonObject = {};
  const skipped: string[] = [];
  const parsed = parseConsumptionMapWithDrops(rawMap);
  if (parsed.dropped.length)
    throw new Error(
      "The saved provision mapping could not be read completely. Fix the mapping before filling a sample.",
    );
  for (const [name, value] of Object.entries(variables)) {
    let destination: string | undefined;
    if (sample.mandate_id === mandateId) destination = name;
    else {
      const sources = parsed.map[name] ?? [];
      if (
        sources.length === 1 &&
        sources[0].mapType === "offered_value" &&
        sourceChannel(sources[0]) === "variable"
      )
        destination = sources[0].target;
      else if (
        (!sources.length ||
          (sources.length === 1 &&
            sources[0].mapType === "prompt_user" &&
            sourceChannel(sources[0]) === "variable")) &&
        fields.some(
          (field) =>
            field.name === name &&
            ["holder", "variable", "binding_prompt"].includes(field.origin),
        )
      )
        destination = name;
      else if (sources.some((source) => source.mapType === "offered_value"))
        throw new Error(
          "This sample uses a combined or context mapping that cannot be reversed automatically. Use the sample preview to enter the provision values.",
        );
    }
    if (!destination || !editable.has(destination)) {
      skipped.push(name);
      continue;
    }
    if (
      destination in values &&
      JSON.stringify(values[destination]) !== JSON.stringify(value)
    )
      throw new Error(
        "Two sample variables provide different values for one provision input. Resolve the conflict before filling.",
      );
    values[destination] = value;
  }
  return { values, skipped };
}
