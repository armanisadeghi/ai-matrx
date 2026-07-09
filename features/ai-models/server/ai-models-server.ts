import { cache } from "react";
import { createClient } from "@/utils/supabase/server";

async function _fetchAIModelsFromDB() {
  const supabase = await createClient();

  // Only routable models: a model_definition without an available ai.offering
  // is selectable-looking but uncallable (resolve_call_profile raises).
  const { data: offeringRows, error: offeringError } = await supabase
    .schema("ai")
    .from("model_offering")
    .select("model_id");
  if (offeringError) {
    console.error("Error fetching model offerings:", offeringError);
    throw offeringError;
  }
  const routableIds = [
    ...new Set(
      (offeringRows ?? [])
        .map((r) => r.model_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  ];
  if (routableIds.length === 0) {
    return [];
  }

  const { data: models, error } = await supabase
    .schema("ai")
    .from("model_definition")
    .select("*")
    .eq("is_deprecated", false)
    .in("id", routableIds)
    .order("common_name", { ascending: true });

  if (error) {
    console.error("Error fetching AI models from database:", error);
    throw error;
  }

  return models || [];
}

/**
 * Fetches AI models directly from Supabase (Server-side only)
 * Uses React cache() for request deduplication
 * This avoids HTTP requests to ourselves in serverless environments
 * Works reliably in both development and production
 */
export const fetchAIModels = cache(async () => {
  try {
    return await _fetchAIModelsFromDB();
  } catch (error) {
    console.error("Error fetching AI models:", error);
    // Return empty array as fallback to prevent page crashes
    return [];
  }
});
