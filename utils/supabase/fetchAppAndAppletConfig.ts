// utils/supabase/fetchAppAndAppletConfig.ts

import { createClient } from "@/utils/supabase/server";
import type { Json } from "@/types/database.types";
import {
  CustomAppConfig,
  CustomAppletConfig,
  AppLayoutOptions,
  AppletLayoutOption,
  AppletContainer,
  AppletSourceConfig,
} from "@/types/customAppTypes";
import type { BrokerMapping } from "@/types/customAppTypes";

/** Normalized `fetch_app_and_applet_config` RPC payload (DB returns `Json`). */
export interface AppAndAppletRpcPayload {
  app_config: Record<string, unknown> & { name: string };
  applets?: Array<
    Record<string, unknown> & {
      id: string;
      slug: string;
      name: string;
      description?: string | null;
      image_url?: string | null;
    }
  >;
}

function parseAppAndAppletRpcPayload(
  raw: Json | null | undefined,
): AppAndAppletRpcPayload | null {
  if (
    raw === null ||
    raw === undefined ||
    typeof raw !== "object" ||
    Array.isArray(raw)
  ) {
    return null;
  }
  const root = raw as Record<string, unknown>;
  const app_config = root.app_config;
  if (
    !app_config ||
    typeof app_config !== "object" ||
    Array.isArray(app_config)
  ) {
    return null;
  }
  const ac = app_config as Record<string, unknown>;
  if (typeof ac.name !== "string") {
    return null;
  }
  return root as unknown as AppAndAppletRpcPayload;
}

function isAppletSourceConfig(value: Json | null): value is AppletSourceConfig {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseAppletSourceConfig(
  raw: Json | null,
): AppletSourceConfig | undefined {
  return isAppletSourceConfig(raw) ? raw : undefined;
}

export async function fetchAppAndAppletConfig(
  id: string | null = null,
  slug: string | null = null,
): Promise<AppAndAppletRpcPayload | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fetch_app_and_applet_config", {
    p_id: id ?? undefined,
    p_slug: slug ?? undefined,
  });

  if (error) {
    console.error("Error fetching app and applet config:", error);
    throw new Error("Failed to fetch app and applet configuration");
  }

  return parseAppAndAppletRpcPayload(data ?? null);
}

export async function fetchAppBySlug(slug: string): Promise<CustomAppConfig> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("custom_app_configs")
    .select("*")
    .eq("slug", slug)
    .single();

  console.log("============================================");
  console.log("fetchAppBySlug Fetched Data:", data);
  console.log("============================================");

  if (error) {
    console.error("Error fetching app by slug:", error);
    throw new Error("Failed to fetch app configuration");
  }

  // Transform data to CustomAppRuntimeConfig
  const transformedData: CustomAppConfig = {
    id: data.id,
    name: data.name,
    description: data.description ?? "",
    slug: data.slug,
    mainAppIcon: data.main_app_icon ?? undefined,
    mainAppSubmitIcon: data.main_app_submit_icon ?? undefined,
    creator: data.creator ?? undefined,
    primaryColor: data.primary_color ?? undefined,
    accentColor: data.accent_color ?? undefined,
    appletList: (data.applet_list ?? []) as CustomAppConfig["appletList"],
    extraButtons: (data.extra_buttons ?? []) as CustomAppConfig["extraButtons"],
    layoutType: data.layout_type as AppLayoutOptions, // Cast to AppLayoutOptions
    imageUrl: data.image_url ?? undefined,
  };

  return transformedData;
}

// Fetch an applet by slug and transform to CustomApplet
export async function fetchAppletBySlug(
  slug: string,
): Promise<CustomAppletConfig> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("custom_applet_configs")
    .select("*")
    .eq("slug", slug)
    .single();

  console.log("============================================");
  console.log("fetchAppletBySlug Fetched Data:", data);
  console.log("============================================");

  if (error) {
    console.error("Error fetching applet by slug:", error);
    throw new Error("Failed to fetch applet configuration");
  }

  const transformedData: CustomAppletConfig = {
    id: data.id,
    name: data.name,
    description: data.description ?? undefined,
    slug: data.slug,
    userId: data.user_id,
    publicRead: data.public_read,
    appletIcon: data.applet_icon ?? undefined,
    appletSubmitText: data.applet_submit_text ?? undefined,
    creator: data.creator ?? undefined,
    primaryColor: data.primary_color ?? undefined,
    accentColor: data.accent_color ?? undefined,
    layoutType: data.layout_type as AppletLayoutOption,
    containers: data.containers as AppletContainer[],
    dataSourceConfig: parseAppletSourceConfig(data.data_source_config),
    brokerMap: data.broker_map as BrokerMapping[],
    resultComponentConfig: data.result_component_config,
    nextStepConfig: data.next_step_config,
    compiledRecipeId: data.compiled_recipe_id ?? undefined,
    subcategoryId: data.subcategory_id ?? undefined,
    imageUrl: data.image_url ?? undefined,
    appId: data.app_id ?? undefined,
  };

  return transformedData;
}
