import { supabase } from "@/utils/supabase/client";

export type RecipeInfo = {
    id: string;
    name: string;
    description?: string;
    version: number;
    status: string;
    post_result_options?: Record<string, unknown>;
    tags?: {
        tags: string[];
    };
};

export interface NeededBroker {
    id: string;
    name: string;
    required: boolean;
    dataType: string;
    defaultValue: string;
    fieldComponentId?: string;
}

export type RecipeSimpleMessage = {
    content: string;
    role: "user" | "assistant" | "system" | "tool" | string;
    type: "text" | "image" | "audio" | "video" | "file" | string;
}

export interface RecipeConfig {
    sourceType: "recipe";
    id: string;
    name: string;
    compiledId: string;
    version: number;
    neededBrokers?: NeededBroker[];
    postResultOptions?: Record<string, unknown>;
    settings?: Record<string, unknown>;
    messages?: RecipeSimpleMessage[];
}

interface RecipeDefaultArgOverrides {
    recipe_id?: string;
    version?: number;
    latest_version?: boolean;
}

interface RecipeDefaultDependencies {
    source_broker_id: string;
    target_broker_id?: undefined;
}

export interface RecipeNodeDefaults {
    recipe_name?: string;
    needed_brokers?: NeededBroker[];
    arg_overrides?: RecipeDefaultArgOverrides;
    default_dependencies?: RecipeDefaultDependencies[];
}

export interface InitialConfig {
    recipeId?: string;
    version?: number;
    latestVersion?: boolean;
}

const convertDbResponseForSourceConfigs = (data: any): RecipeConfig => {
    if (!data) {
        throw new Error("No data provided to convertDbResponseForSourceConfigs");
    }

    const compiled_id = data.id;
    const recipe_id = data.recipe_id;
    const version = data.version;
    const compiled_data = data.compiled_recipe;

    if (!compiled_data) {
        throw new Error("No compiled_recipe data found");
    }

    const raw_brokers = compiled_data.brokers || [];
    const post_result_options = compiled_data.post_result_options || {};
    const settings = (compiled_data.settings && compiled_data.settings.length > 0) 
        ? compiled_data.settings[0] 
        : {};

    // Extract messages safely
    const raw_messages = compiled_data.messages || [];
    const messages: RecipeSimpleMessage[] = raw_messages.map((message: any) => ({
        content: message?.content || "",
        role: message?.role || "user",
        type: message?.type || "text"
    }));

    const needed_brokers = raw_brokers.map((broker: any) => {
        return {
            id: broker?.id || "",
            name: broker?.name || "Name Missing",
            required: broker?.required ?? true,
            dataType: broker?.data_type || null,
            defaultValue: broker?.default_value || null,
            fieldComponentId: broker?.field_component_id || null,
        };
    });

    return {
        sourceType: "recipe" as const,
        id: recipe_id,
        name: compiled_data.name,
        compiledId: compiled_id,
        version: version,
        neededBrokers: needed_brokers,
        postResultOptions: post_result_options,
        settings: settings,
        messages: messages,
    };
};

/**
 * Fetches a specific compiled recipe by recipe ID and version.
 * compiled_recipe may be absent (table deleted/moved) — returns null on any error.
 */
export const getCompiledRecipeByVersionWithNeededBrokers = async (
    recipeId: string,
    version?: number
): Promise<RecipeConfig | null> => {
    try {
        let query = supabase.from("compiled_recipe").select("*").eq("recipe_id", recipeId);

        if (version) {
            query = query.eq("version", version);
        } else {
            query = query.order("version", { ascending: false }).limit(1);
        }

        const { data, error } = await query;

        console.log("fetching recipe with id and version", recipeId, version);

        if (error) {
            console.warn("[recipe-service] compiled_recipe query error (table may be absent):", error);
            return null;
        }

        if (!data || data.length === 0) {
            console.warn(`No compiled recipe found for recipe ID: ${recipeId}${version ? ` version: ${version}` : ''}`);
            return null;
        }

        return convertDbResponseForSourceConfigs(data[0]);
    } catch (err) {
        console.warn("[recipe-service] getCompiledRecipeByVersionWithNeededBrokers caught:", err);
        return null;
    }
};
