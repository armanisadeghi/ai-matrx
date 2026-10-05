/**
 * THE standard level's decision for a JSON region (the first-key rule,
 * `jsonKindSignal`), pure so the frame judge asks the same question the
 * renderer answers (`StandardBlock`, and every XML card's prose through it):
 *  - `kind`   → the region renders as its kind (`value` parsed);
 *  - `loader` → could still be a kind, mid-stream;
 *  - `broken` → a settled region naming a kind that will not parse;
 *  - null     → not a kind region (the caller draws it as JSON — correct).
 */

import {
  firstKindSlug,
  jsonKindSignal,
  withoutLeadingJsonComments,
} from "@/features/content-ir/surfaces/json-kind-signal";

export type StandardKindRegionState =
  | { state: "kind"; value: unknown }
  | { state: "loader" }
  | { state: "broken"; slug: string | null }
  | null;

export function standardKindRegionState(
  content: string,
  isStreaming?: boolean,
): StandardKindRegionState {
  const trimmed = withoutLeadingJsonComments(content).trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return null;
  const signal = jsonKindSignal(trimmed);
  if (signal === "not_kind") return null;
  if (signal === "undecided") return isStreaming ? { state: "loader" } : null;
  try {
    return { state: "kind", value: JSON.parse(trimmed) };
  } catch {
    if (isStreaming) return { state: "loader" };
    return { state: "broken", slug: firstKindSlug(trimmed) };
  }
}
