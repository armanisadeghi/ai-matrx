/**
 * kind-emissions — THE EMISSION CONTRACT (SPEC-workflow-ui-contract §3) plus
 * the declared result contract it dedupes against (§2.4).
 *
 * Proving on the `sharp` bake-off first, per R12: contracts land on a proving
 * ground browser-proven BEFORE the shipped `RunStage` adopts them. Nothing here
 * imports from `components/run/` — the dependency points the other way at
 * adoption, when `RunEmissions` + `RunDeliverables` are REPLACED by these
 * (never kept beside them).
 */

export {
  routeEmission,
  splitByPresentation,
  isShowcase,
  deliverableClaims,
  suppressClaimedEmissions,
  emissionsByDeliverable,
  type EmissionRoute,
  type RoutableEmission,
  type ClaimingDeliverable,
  type PresentationSplit,
} from "./emission-routing";

export {
  parseResultSchema,
  showcaseDeliverables,
  panelDeliverables,
  type DeclaredDeliverable,
  type DeclaredResultSchema,
} from "./result-schema";

export {
  useResultSchema,
  resultSchemaOrNull,
  type ResultSchemaState,
} from "./useResultSchema";

export {
  EmissionRender,
  emissionKey,
  asEmitMode,
  type RenderableEmission,
  type EmissionRenderProps,
} from "./EmissionRender";

export { ShowcaseSlot, type ShowcaseSlotProps } from "./ShowcaseSlot";
export { DeliveredStream, type DeliveredStreamProps } from "./DeliveredStream";
