import type {
  AppletSourceConfig,
  RecipeSourceConfig,
} from "@/types/customAppTypes";

export type RecipeAppletSourceConfig = AppletSourceConfig & {
  sourceType: "recipe";
  config: RecipeSourceConfig;
};

export function isRecipeAppletSourceConfig(
  value: AppletSourceConfig | null | undefined,
): value is RecipeAppletSourceConfig {
  return (
    value?.sourceType === "recipe" &&
    value.config !== undefined &&
    "compiledId" in value.config &&
    "version" in value.config &&
    "neededBrokers" in value.config
  );
}
