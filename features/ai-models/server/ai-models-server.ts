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

  const [modelsRes, providersRes] = await Promise.all([
    supabase
      .schema("ai")
      .from("model_definition")
      .select("*")
      .eq("is_deprecated", false)
      .in("id", routableIds)
      .order("common_name", { ascending: true }),
    // Resolve `maker` from the model_provider FK — the free-text `provider`
    // column is dropping and must never be read.
    supabase.schema("ai").from("provider").select("id, name"),
  ]);

  if (modelsRes.error) {
    console.error("Error fetching AI models from database:", modelsRes.error);
    throw modelsRes.error;
  }
  if (providersRes.error) {
    console.error("Error fetching AI providers:", providersRes.error);
    throw providersRes.error;
  }

  const makerById = new Map(
    (providersRes.data ?? []).map((p) => [p.id, p.name ?? null]),
  );
  return (modelsRes.data ?? []).map((m) => ({
    ...m,
    maker: m.model_provider ? (makerById.get(m.model_provider) ?? null) : null,
  }));
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
