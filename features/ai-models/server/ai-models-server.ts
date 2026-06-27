import { cache } from "react";
import { createClient } from "@/utils/supabase/server";

async function _fetchAIModelsFromDB() {
  const supabase = await createClient();

  // Fetch all non-deprecated AI models
  const { data: models, error } = await supabase
    .schema("ai")
    .from("model")
    .select("*")
    .eq("is_deprecated", false)
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
