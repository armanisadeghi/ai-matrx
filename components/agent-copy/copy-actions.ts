/**
 * Which CopyButtons segments to render. Pass data for the ones you want;
 * `hide` knocks any of them out even when the data is present (cards that
 * share a payload builder with a header that also exports).
 */
export type CopyActionId = "copy" | "ai" | "export";

export interface CopyActionVisibility {
  copy: boolean;
  ai: boolean;
  export: boolean;
  count: number;
}

export function resolveCopyActions(input: {
  hide?: CopyActionId[];
  hasCopy: boolean;
  hasAi: boolean;
  hasExport: boolean;
}): CopyActionVisibility {
  const hide = new Set(input.hide);
  const copy = input.hasCopy && !hide.has("copy");
  const ai = input.hasAi && !hide.has("ai");
  const exp = input.hasExport && !hide.has("export");
  return {
    copy,
    ai,
    export: exp,
    count: Number(copy) + Number(ai) + Number(exp),
  };
}
