/**
 * Declared offer values of provision `content_ir.kind_authoring`
 * (mandate `content_ir.kind_creator`), sent by name BESIDE the composed seed.
 *
 * Deliberately separate from `kind-agent-intents.ts`: those composers are
 * shared with the component-authoring launch, whose payload must not change.
 * Only the kind_authoring call sites (ConvertToShapeWindow, KindFixItBar,
 * KindComponentFixBadge) spread this in.
 *
 * Those sites open the run window on the AGENT door (`initialAgentId`), whose
 * variable plumbing is string-only (`initialVariableValues: Record<string,
 * string>`), so the boolean `kind_is_active` travels as "true"/"false". The
 * live default Holder (agent 4f4ffd49…) neither declares nor references any of
 * these names (checked 2026-09-28), so it receives nothing new. An absent fact
 * omits its key.
 */

import type { ContentIrKindAuthoringOffer } from "@/types/python-generated/provision-offers";

export type KindAuthoringPart =
  | "component"
  | "skill"
  | "example"
  | "content_block"
  | "surface"
  | "edit";

export function buildKindAuthoringOffer(input: {
  kindSlug?: string | null;
  kindLabel?: string | null;
  authoringPart?: KindAuthoringPart | null;
  authorNote?: string | null;
  referenceKind?: string | null;
  renderGapState?: string | null;
  /** Only when the kind is actually registered. */
  kindIsActive?: boolean | null;
}): Record<string, string> {
  const out: Record<string, string> = {};
  const put = (key: keyof ContentIrKindAuthoringOffer, value: string | null | undefined) => {
    if (typeof value === "string" && value.trim()) out[key] = value.trim();
  };
  put("kind_slug", input.kindSlug);
  put("kind_label", input.kindLabel);
  put("authoring_part", input.authoringPart);
  put("author_note", input.authorNote);
  put("reference_kind", input.referenceKind);
  put("render_gap_state", input.renderGapState);
  if (typeof input.kindIsActive === "boolean") {
    out.kind_is_active = input.kindIsActive ? "true" : "false";
  }
  return out;
}
