import { isUuidShape } from "@ai-matrx/kit/uuid";

export type IntakeAssetRouteTarget =
  | { kind: "asset"; assetId: string }
  | { kind: "redirect"; href: "/commerce/intake/v2" }
  | { kind: "not-found" };

/**
 * Classify the dynamic asset segment before it can reach UUID-backed reads.
 * `v2` is the capture-surface version route, not an asset identity.
 */
export function resolveIntakeAssetRouteTarget(
  segment: string,
): IntakeAssetRouteTarget {
  if (segment === "v2") {
    return { kind: "redirect", href: "/commerce/intake/v2" };
  }
  if (!isUuidShape(segment)) {
    return { kind: "not-found" };
  }
  return { kind: "asset", assetId: segment };
}
