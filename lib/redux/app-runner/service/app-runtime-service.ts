import {
    AppLayoutOptions,
    BrokerMapping,
    AppletContainer,
    AppletLayoutOption,
    CustomAppConfig,
    CustomAppletConfig,
} from "@/types/customAppTypes";
import { fetchAppById as clientFetchAppById, fetchAppBySlug as clientFetchAppBySlug } from "@/utils/api/appFetcher";

// Type for the app configuration
interface DbResponseAppConfig {
    id: string;
    user_id: string;
    public_read: boolean;
    name: string;
    description: string | null;
    slug: string;
    main_app_icon: string | null;
    main_app_submit_icon: string | null;
    creator: string;
    primary_color: string | null;
    accent_color: string | null;
    applet_list: unknown; // Use a specific type if the structure is known
    extra_buttons: unknown; // Use a specific type if the structure is known
    layout_type: string | null;
    image_url: string | null;
}

// Type for an individual applet configuration
interface DbResponseAppletConfig {
    id: string;
    user_id: string;
    public_read: boolean;
    name: string;
    description: string | null;
    slug: string;
    applet_icon: string | null;
    applet_submit_text: string | null;
    creator: string;
    primary_color: string | null;
    accent_color: string | null;
    layout_type: string | null;
    containers: unknown; // Use a specific type if the structure is known
    data_source_config: unknown; // Use a specific type if the structure is known
    result_component_config: unknown; // Use a specific type if the structure is known
    next_step_config: unknown; // Use a specific type if the structure is known
    compiled_recipe_id: string | null;
    subcategory_id: string | null;
    image_url: string | null;
    app_id: string;
    broker_map: unknown; // Use a specific type if the structure is known
}

interface AppAndAppletConfigSuccess {
    app_config: DbResponseAppConfig;
    applets: DbResponseAppletConfig[];
}

interface AppAndAppletConfigError {
    error: string;
}

type AppAndAppletConfig = AppAndAppletConfigSuccess | AppAndAppletConfigError;

export async function fetchAppAndAppletConfig(id: string | null = null, slug: string | null = null): Promise<AppAndAppletConfig> {
    if (!id && !slug) {
        throw new Error("Either id or slug must be provided");
    }

    try {
        let data;
        if (id) {
            data = await clientFetchAppById(id);
        } else if (slug) {
            data = await clientFetchAppBySlug(slug);
        }

        if (!data) {
            throw new Error("No data returned from app fetch");
        }

        return data;
    } catch (error: any) {
        console.error("Error in fetchAppAndAppletConfig:", error);
        throw error;
    }
}

// Fetch app by ID
export async function fetchAppById(id: string): Promise<{
    appConfig: CustomAppConfig;
    applets: CustomAppletConfig[];
}> {
    if (!id) throw new Error("App ID is required");
    const rawData = await fetchAppAndAppletConfig(id, null);
    return transformAppWithApplets(rawData);
}

// Fetch app by slug
export async function fetchAppBySlug(slug: string): Promise<{
    appConfig: CustomAppConfig;
    applets: CustomAppletConfig[];
}> {
    if (!slug) throw new Error("App slug is required");
    const rawData = await fetchAppAndAppletConfig(null, slug);
    console.log("fetchAppBySlug rawData", rawData);
    return transformAppWithApplets(rawData);
}

// Transform and return app with applets config data
export async function fetchTransformedAppAndApplets(
    idOrSlug: string,
    isSlug: boolean = true
): Promise<{
    appConfig: CustomAppConfig;
    applets: CustomAppletConfig[];
}> {
    return isSlug ? fetchAppBySlug(idOrSlug) : fetchAppById(idOrSlug);
}

export function transformAppWithApplets(rawConfig: AppAndAppletConfig): {
    appConfig: CustomAppConfig;
    applets: CustomAppletConfig[];
} {
    // Handle error case
    if ("error" in rawConfig) {
        throw new Error(rawConfig.error);
    }

    const { app_config: config, applets: rawApplets } = rawConfig;

    // Transform applets into CustomAppletConfig structures
    const applets: CustomAppletConfig[] = rawApplets.map((applet) => {
        return {
            id: applet.id || "",
            name: applet.name || "Unnamed Applet",
            description: applet.description || undefined,
            slug: applet.slug || "",
            appletIcon: applet.applet_icon || undefined,
            appletSubmitText: applet.applet_submit_text || undefined,
            creator: applet.creator || undefined,
            primaryColor: applet.primary_color ?? undefined,
            accentColor: applet.accent_color ?? undefined,
            layoutType: (applet.layout_type as AppletLayoutOption) || undefined,
            containers: Array.isArray(applet.containers) ? (applet.containers as AppletContainer[]) : [],
            dataSourceConfig: applet.data_source_config,
            brokerMap: Array.isArray(applet.broker_map) ? (applet.broker_map as BrokerMapping[]) : undefined,
            resultComponentConfig: applet.result_component_config,
            nextStepConfig: applet.next_step_config,
            compiledRecipeId: applet.compiled_recipe_id || undefined,
            subcategoryId: applet.subcategory_id || undefined,
            imageUrl: applet.image_url || undefined,
            appId: applet.app_id,
            userId: applet.user_id || undefined,
        };
    });

    // Generate appletList from applets array
    const appletList = applets
        .filter(
            (applet): applet is CustomAppletConfig & { id: string; name: string; slug: string } =>
                applet.id !== "" && applet.name !== "Unnamed Applet" && applet.slug !== ""
        )
        .map((applet) => ({
            appletId: applet.id,
            label: applet.name,
            slug: applet.slug,
        }));

    // Transform app_config into CustomAppRuntimeConfig
    const appConfig: CustomAppConfig = {
        id: config.id || "",
        name: config.name || "Unnamed App",
        description: config.description || "",
        slug: config.slug || "",
        mainAppIcon: config.main_app_icon || undefined,
        mainAppSubmitIcon: config.main_app_submit_icon || undefined,
        creator: config.creator || undefined,
        primaryColor: config.primary_color ?? undefined,
        accentColor: config.accent_color ?? undefined,
        appletList: appletList.length > 0 ? appletList : undefined,
        extraButtons:
            config.extra_buttons !== null && Array.isArray(config.extra_buttons)
                ? config.extra_buttons
                      .filter(
                          (btn: any) =>
                              typeof btn?.label === "string" &&
                              typeof btn?.actionType === "string" &&
                              typeof btn?.knownMethod === "string" &&
                              btn.label.trim() !== "" &&
                              btn.actionType.trim() !== "" &&
                              btn.knownMethod.trim() !== ""
                      )
                      .map((btn: any) => ({
                          label: btn.label,
                          actionType: btn.actionType,
                          knownMethod: btn.knownMethod,
                      }))
                : undefined,
        layoutType: (config.layout_type as AppLayoutOptions) || undefined,
        imageUrl: config.image_url || undefined,
        userId: config.user_id || undefined,
    };

    return {
        appConfig,
        applets,
    };
}
