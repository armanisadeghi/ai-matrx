// features/spaces/state/template-plan.ts — what "Use template" does with the built-in sample (I2).

/**
 * The built-in sample as a template. "Add the sample" opens the one sample page (made or brought up to
 * date); "Use template" always opens a NEW page (Notion): the sample page itself when it was just made,
 * else a copy of it with its sub-pages.
 */
export function sampleTemplatePlan(asTemplate: boolean, existedBefore: string | null, rootId: string): { kind: "open"; id: string } | { kind: "copy"; of: string } {
  if (asTemplate && existedBefore) return { kind: "copy", of: rootId };
  return { kind: "open", id: rootId };
}
