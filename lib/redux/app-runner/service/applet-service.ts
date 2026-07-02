import { createClient } from "@/utils/supabase/client";
import { AppWithApplets, transformAppWithApplets } from "./data-conversion";

/**
 * Fetches and transforms app config and applets by slug.
 * @param slug - The slug of the app (e.g., 'travel-manager')
 * @returns A Promise resolving to the transformed AppWithApplets
 * @throws Error if the fetch or transformation fails
 */
export async function fetchAppConfigBySlug(
  slug: string,
): Promise<AppWithApplets> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("get_custom_app_with_applets", {
      p_slug: slug,
    });

    if (error) {
      throw new Error(`Failed to fetch app config by slug: ${error.message}`);
    }

    if (!data) {
      throw new Error("No app config data returned for the provided slug");
    }

    return transformAppWithApplets(data);
  } catch (err) {
    throw new Error(
      `Error fetching app config by slug: ${err instanceof Error ? err.message : "Unknown error"}`,
    );
  }
}

/**
 * Fetches and transforms app config and applets by ID.
 * @param id - The ID of the app (e.g., '12b995eb-5baa-4754-87e1-8d27b0a9ff9c')
 * @returns A Promise resolving to the transformed AppWithApplets
 * @throws Error if the fetch or transformation fails
 */
export async function fetchAppConfigById(id: string): Promise<AppWithApplets> {
  try {
    const supabase = createClient();

    const { data, error } = await supabase.rpc("get_custom_app_with_applets", {
      p_id: id,
    });

    if (error) {
      throw new Error(`Failed to fetch app config by ID: ${error.message}`);
    }

    if (!data) {
      throw new Error("No app config data returned for the provided ID");
    }

    return transformAppWithApplets(data);
  } catch (err) {
    throw new Error(
      `Error fetching app config by ID: ${err instanceof Error ? err.message : "Unknown error"}`,
    );
  }
}

/**
 * Fetches and transforms app config and applets using either a slug or an ID.
 * Prefers slug if both are provided.
 * @param params - Object containing optional slug and/or id
 * @returns A Promise resolving to the transformed AppWithApplets
 * @throws Error if neither slug nor id is provided, or if the fetch fails
 */
export async function fetchAppConfig({
  slug,
  id,
}: {
  slug?: string;
  id?: string;
}): Promise<AppWithApplets> {
  if (!slug && !id) {
    throw new Error("Either slug or id must be provided to fetch app config");
  }

  // Prefer slug if both are provided, as it's the most common use case
  if (slug) {
    return fetchAppConfigBySlug(slug);
  }

  // Fallback to ID if slug is not provided — the guard above guarantees
  // `id` is set here (slug was falsy, and at least one of the two is required).
  if (!id) {
    throw new Error("Either slug or id must be provided to fetch app config");
  }
  return fetchAppConfigById(id);
}
