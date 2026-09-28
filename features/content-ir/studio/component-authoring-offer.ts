/**
 * The Component Artisan launch — what `content_ir.component_authoring` offers,
 * by the names the provision declares (aidream client_mandates.py).
 *
 * Until 2026-09-28 the two "Build the component with an agent" buttons
 * (ShapeRenderStatusStrip, ShapeActivationControl) launched the Artisan with
 * the KIND CREATOR's vocabulary only (`task_brief`, `kind_schema`), so the
 * Artisan — whose prompt is built from `{{kind}}`, `{{design_brief}}` and
 * `{{component_key}}` — ran with all three blank and had to ask which Shape it
 * was building for. This composer keeps those two values exactly as before and
 * adds the Artisan's own three (deliberately — this IS a change to what the
 * Artisan receives: it now knows the Shape) plus the provision's mapped-only
 * facts, which no current Holder declares.
 */

import type { ContentIrComponentAuthoringOffer } from "@/types/python-generated/provision-offers";
import { composeKindAgentIntent, type KindAgentSeed } from "./kind-agent-intents";
import type { Json } from "@/types/database.types";

export type ComponentAuthoringValues = Omit<
  Partial<ContentIrComponentAuthoringOffer>,
  "__kind"
>;

export interface ComponentAuthoringInput {
  kind: string;
  label: string;
  emittedJsonSchema?: Json | null;
  /** Key of an existing, non-generic component the Artisan should refine. */
  componentKey?: string | null;
  /** The render problems the page is showing for this Shape right now. */
  renderProblems?: readonly string[];
  /** Component keys registered for this Shape. */
  componentCandidates?: readonly string[];
  /** The activation gate's reasons, when it refused. */
  activationReasons?: readonly string[];
}

/** The seed the Artisan buttons hand `useKindAgentLaunch`. */
export function composeComponentAuthoringIntent(
  input: ComponentAuthoringInput,
): KindAgentSeed & { variables: Record<string, string> } {
  const base = composeKindAgentIntent({
    kind: input.kind,
    label: input.label,
    part: "component",
    emittedJsonSchema: input.emittedJsonSchema,
  });
  const offer = componentAuthoringValues(input, base.variables.task_brief ?? "");
  // `useKindAgentLaunch` carries string variables; lists travel one per line.
  const extra: Record<string, string> = {};
  for (const [name, value] of Object.entries(offer)) {
    if (value === undefined || value === null) continue;
    extra[name] = Array.isArray(value) ? value.join("\n") : String(value);
  }
  return {
    draftText: base.draftText,
    // The pre-existing values ride unchanged and win on any name clash.
    variables: { ...extra, ...base.variables },
  };
}

/** Pure: the declared values this position holds, absent keys omitted. */
export function componentAuthoringValues(
  input: ComponentAuthoringInput,
  designBrief: string,
): ComponentAuthoringValues {
  const values: ComponentAuthoringValues = { kind: input.kind };
  if (input.componentKey) values.component_key = input.componentKey;
  if (designBrief.trim()) values.design_brief = designBrief;
  if (input.label) values.kind_label = input.label;
  if (input.renderProblems?.length) values.render_problems = [...input.renderProblems];
  if (input.componentCandidates?.length)
    values.component_candidates = [...input.componentCandidates];
  if (input.activationReasons?.length)
    values.activation_verdict = input.activationReasons.join("\n");
  return values;
}
