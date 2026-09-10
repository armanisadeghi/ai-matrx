import type { PlanView } from "../hooks/usePlanWorkspaceParams";

/**
 * The site pipeline's eight doors. Each stage lands on the surface that owns
 * that work; Setup stages carry the stage key so the long setup workspace can
 * focus its exact section after navigation.
 */
const SITE_PIPELINE_DESTINATIONS: Record<string, PlanView> = {
  research: "setup",
  plan: "tree",
  seo_strategy: "setup",
  content: "table",
  design: "setup",
  development: "table",
  draft: "table",
  live: "map",
};

export function sitePipelineDestination(stageKey: string): PlanView {
  return SITE_PIPELINE_DESTINATIONS[stageKey] ?? "setup";
}
