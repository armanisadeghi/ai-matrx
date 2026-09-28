/**
 * Declared offer values of provision `tool_viz.component_generation`, sent by
 * name beside the four existing JSON variables. `useToolComponentAgent`
 * launches on the MANDATE door (`launchMandate`), where the server drops these
 * mapped-only names unless a binding's consumption map names one — so the
 * current Holder receives exactly what it did before. Every value comes from
 * the tool row and the test samples the admin already selected; absent facts
 * are omitted.
 */

import type { ToolVizComponentGenerationOffer } from "@/types/python-generated/provision-offers";

export type ToolComponentGenerationOfferValues = Pick<
  Partial<ToolVizComponentGenerationOffer>,
  | "tool_name"
  | "tool_description"
  | "tool_parameters"
  | "sample_arguments"
  | "sample_admin_comments"
  | "sample_succeeded"
>;

interface OfferTool {
  name: string;
  description?: string | null;
  parameters?: unknown;
}

interface OfferSample {
  arguments?: unknown;
  admin_comments?: string | null;
  is_success?: boolean | null;
}

const jsonBlock = (value: unknown) =>
  `\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\``;

export function buildToolComponentGenerationOffer(
  tool: OfferTool,
  samples: readonly OfferSample[],
): ToolComponentGenerationOfferValues {
  const out: ToolComponentGenerationOfferValues = {};
  if (tool.name?.trim()) out.tool_name = tool.name.trim();
  if (tool.description?.trim()) out.tool_description = tool.description.trim();
  if (tool.parameters != null) out.tool_parameters = jsonBlock(tool.parameters);

  const args = samples
    .map((s) => s.arguments)
    .filter((a) => a !== undefined && a !== null);
  if (args.length > 0) {
    out.sample_arguments =
      args.length === 1 ? jsonBlock(args[0]) : jsonBlock(args);
  }

  const comments = samples
    .map((s) => s.admin_comments?.trim())
    .filter((c): c is string => Boolean(c));
  if (comments.length > 0) out.sample_admin_comments = comments;

  // One truthful boolean only when every selected sample agrees.
  const verdicts = samples.map((s) => s.is_success);
  if (
    verdicts.length > 0 &&
    verdicts.every((v) => typeof v === "boolean" && v === verdicts[0])
  ) {
    out.sample_succeeded = verdicts[0] as boolean;
  }
  return out;
}
