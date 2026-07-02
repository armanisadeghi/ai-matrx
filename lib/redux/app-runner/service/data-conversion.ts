import { AppletLayoutOption, AppLayoutOptions, CustomAppConfig, CustomAppletConfig, KnownMethod } from "@/types/customAppTypes"; // Adjust import based on your types file
import { RuntimeCompiledRecipe, RuntimeBrokerDefinition } from "../types";

const KNOWN_ACTION_TYPES = ["button", "link", "redux", "none"] as const;
type KnownActionType = (typeof KNOWN_ACTION_TYPES)[number];

const KNOWN_METHODS = ["renderChat", "changeApplet", "renderModal", "renderSampleApplet", "none"] as const satisfies readonly KnownMethod[];

const KNOWN_APPLET_LAYOUT_TYPES = [
    "horizontal", "vertical", "stepper", "flat", "open", "oneColumn", "twoColumn", "threeColumn",
    "fourColumn", "tabs", "accordion", "minimalist", "floatingCard", "sidebar", "carousel",
    "cardStack", "contextual", "chat", "mapBased", "fullWidthSidebar", "stepper-field", "flat-accordion",
] as const satisfies readonly AppletLayoutOption[];

const KNOWN_APP_LAYOUT_TYPES = [
    "tabbedApplets", "singleDropdown", "multiDropdown", "singleDropdownWithSearch", "icons",
] as const satisfies readonly AppLayoutOptions[];


/**
 * Interface for the combined app config and applets output
 */
export interface AppWithApplets {
    appConfig: CustomAppConfig;
    applets: CustomAppletConfig[];
    compiledRecipes: Record<string, RuntimeCompiledRecipe>;
}

/**
 * Transforms a raw broker object to a consistent RuntimeBrokerDefinition format
 * Handles both snake_case and camelCase properties
 */
function transformBroker(broker: unknown): RuntimeBrokerDefinition {
    if (!broker || typeof broker !== "object") {
        return {
            id: "",
            name: "",
            dataType: "",
            defaultValue: null,
        };
    }
    const b = broker as Record<string, unknown>;

    return {
        id: typeof b.id === "string" ? b.id : "",
        name: typeof b.name === "string" ? b.name : "",
        // Handle dataType in either snake_case or camelCase
        dataType: typeof b.dataType === "string" ? b.dataType : typeof b.data_type === "string" ? b.data_type : "",
        // Handle defaultValue in either snake_case or camelCase
        defaultValue:
            b.defaultValue !== undefined ? b.defaultValue : b.default_value !== undefined ? b.default_value : null,
    };
}

/**
 * Transforms a raw compiled recipes object to a structured Record of RuntimeCompiledRecipe objects
 */
function transformCompiledRecipes(rawCompiledRecipes: unknown): Record<string, RuntimeCompiledRecipe> {
    if (!rawCompiledRecipes || typeof rawCompiledRecipes !== "object") {
        return {};
    }
    const recipesRecord = rawCompiledRecipes as Record<string, unknown>;

    const result: Record<string, RuntimeCompiledRecipe> = {};

    // Iterate through each applet ID and its associated recipe
    Object.keys(recipesRecord).forEach((appletId) => {
        const rawRecipe = recipesRecord[appletId];

        if (!rawRecipe || typeof rawRecipe !== "object") {
            return;
        }
        const recipe = rawRecipe as Record<string, unknown>;

        // Extract and transform brokers
        const rawBrokers = recipe.brokers;
        const transformedBrokers: Record<string, RuntimeBrokerDefinition> = {};

        // Handle brokers being either an array or an object
        if (Array.isArray(rawBrokers)) {
            // If brokers is an array, transform each broker and use its ID as the key
            rawBrokers.forEach((broker: unknown) => {
                if (broker && typeof broker === "object" && "id" in broker && typeof (broker as Record<string, unknown>).id === "string") {
                    transformedBrokers[(broker as Record<string, unknown>).id as string] = transformBroker(broker);
                }
            });
        } else if (rawBrokers && typeof rawBrokers === "object") {
            // If brokers is already an object with keys, transform each broker
            const brokersRecord = rawBrokers as Record<string, unknown>;
            Object.keys(brokersRecord).forEach((brokerId) => {
                transformedBrokers[brokerId] = transformBroker(brokersRecord[brokerId]);
            });
        }

        result[appletId] = {
            id: typeof recipe.id === "string" ? recipe.id : "",
            recipe_id: typeof recipe.recipe_id === "string" ? recipe.recipe_id : "",
            version: typeof recipe.version === "number" ? recipe.version : 0,
            brokers: transformedBrokers,
        };
    });

    return result;
}

/**
 * Safely transforms raw app config and applets data into a structure containing CustomAppRuntimeConfig and CustomApplet array.
 * @param rawConfig - The raw configuration object from the API or data source (RPC returns Json — genuinely open ingress, validated field-by-field below)
 * @returns An AppWithApplets object containing transformed app config and applets
 */
export function transformAppWithApplets(rawConfig: unknown): AppWithApplets {
    const rawConfigObj =
        rawConfig && typeof rawConfig === "object" ? (rawConfig as Record<string, unknown>) : {};

    // Safely extract app_config, defaulting to empty object if undefined
    const configRaw = rawConfigObj.app_config;
    const config: Record<string, unknown> =
        configRaw && typeof configRaw === "object" ? (configRaw as Record<string, unknown>) : {};

    // Safely extract applets, defaulting to empty array if undefined
    const rawApplets: unknown[] = Array.isArray(rawConfigObj.applets) ? rawConfigObj.applets : [];

    // compiled_recipes may be absent — transformCompiledRecipes already
    // treats a non-object input (including undefined) as "no recipes".
    const rawCompiledRecipes = rawConfigObj.compiled_recipes;

    // Transform applets into CustomApplet structures
    const applets: CustomAppletConfig[] = rawApplets.map((rawApplet) => {
        const applet: Record<string, unknown> =
            rawApplet && typeof rawApplet === "object" ? (rawApplet as Record<string, unknown>) : {};
        return {
            id: typeof applet.id === "string" && applet.id.trim() !== "" ? applet.id : "",
            name: typeof applet.name === "string" && applet.name.trim() !== "" ? applet.name : "Unnamed Applet",
            description: typeof applet.description === "string" ? applet.description : undefined,
            slug: typeof applet.slug === "string" && applet.slug.trim() !== "" ? applet.slug : "",
            appletIcon: typeof applet.applet_icon === "string" ? applet.applet_icon : undefined,
            appletSubmitText: typeof applet.applet_submit_text === "string" ? applet.applet_submit_text : undefined,
            creator: typeof applet.creator === "string" ? applet.creator : undefined,
            primaryColor: typeof applet.primary_color === "string" ? applet.primary_color : undefined,
            accentColor: typeof applet.accent_color === "string" ? applet.accent_color : undefined,
            layoutType:
                typeof applet.layout_type === "string" &&
                (KNOWN_APPLET_LAYOUT_TYPES as readonly string[]).includes(applet.layout_type)
                    ? (applet.layout_type as AppletLayoutOption)
                    : undefined,
            containers: Array.isArray(applet.containers) ? (applet.containers as CustomAppletConfig["containers"]) : undefined,
            dataSourceConfig: applet.data_source_config !== undefined ? (applet.data_source_config as CustomAppletConfig["dataSourceConfig"]) : undefined,
            resultComponentConfig: applet.result_component_config !== undefined ? applet.result_component_config : undefined,
            nextStepConfig: applet.next_step_config !== undefined ? applet.next_step_config : undefined,
            compiledRecipeId: typeof applet.compiled_recipe_id === "string" ? applet.compiled_recipe_id : undefined,
            subcategoryId: typeof applet.subcategory_id === "string" ? applet.subcategory_id : undefined,
            imageUrl: typeof applet.image_url === "string" ? applet.image_url : undefined,
            brokerMap: typeof applet.broker_map === "object" ? (applet.broker_map as CustomAppletConfig["brokerMap"]) : undefined,
        };
    });

    // Generate appletList from applets array, ensuring valid id and name
    const appletList = applets
        .filter(
            (applet): applet is CustomAppletConfig & { id: string; name: string } =>
                typeof applet?.id === "string" && typeof applet?.name === "string" && applet.id.trim() !== "" && applet.name.trim() !== ""
        )
        .map((applet) => ({
            appletId: applet.id,
            label: applet.name,
            slug: applet.slug,
        }));

    // Construct the transformed app config
    const appConfig: CustomAppConfig = {
        id: typeof config.id === "string" && config.id.trim() !== "" ? config.id : "",
        name: typeof config.name === "string" && config.name.trim() !== "" ? config.name : "Unnamed App",
        description: typeof config.description === "string" ? config.description : "",
        slug: typeof config.slug === "string" && config.slug.trim() !== "" ? config.slug : "",
        mainAppIcon: typeof config.main_app_icon === "string" ? config.main_app_icon : undefined,
        mainAppSubmitIcon: typeof config.main_app_submit_icon === "string" ? config.main_app_submit_icon : undefined,
        creator: typeof config.creator === "string" ? config.creator : undefined,
        primaryColor: typeof config.primary_color === "string" ? config.primary_color : undefined,
        accentColor: typeof config.accent_color === "string" ? config.accent_color : undefined,
        appletList: appletList.length > 0 ? appletList : undefined,
        extraButtons: Array.isArray(config.extra_buttons)
            ? config.extra_buttons
                  .filter(
                      (btn: unknown): btn is { label: string; actionType: KnownActionType; knownMethod: KnownMethod } => {
                          if (!btn || typeof btn !== "object") return false;
                          const b = btn as Record<string, unknown>;
                          return (
                              typeof b.label === "string" &&
                              b.label.trim() !== "" &&
                              typeof b.actionType === "string" &&
                              (KNOWN_ACTION_TYPES as readonly string[]).includes(b.actionType) &&
                              typeof b.knownMethod === "string" &&
                              (KNOWN_METHODS as readonly string[]).includes(b.knownMethod)
                          );
                      }
                  )
                  .map((btn) => ({
                      label: btn.label,
                      actionType: btn.actionType,
                      knownMethod: btn.knownMethod,
                  }))
            : undefined,
        layoutType:
            typeof config.layout_type === "string" &&
            (KNOWN_APP_LAYOUT_TYPES as readonly string[]).includes(config.layout_type)
                ? (config.layout_type as AppLayoutOptions)
                : undefined,
        imageUrl: typeof config.image_url === "string" ? config.image_url : undefined,
    };

    // Transform compiled recipes
    const compiledRecipes = transformCompiledRecipes(rawCompiledRecipes);

    return {
        appConfig,
        applets,
        compiledRecipes,
    };
}
