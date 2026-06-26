import { supabase } from "@/utils/supabase/client";
import { fromDeprecatedTable } from "@/utils/supabase/deprecated-tables";

export const fetchWithFk = async (args: any): Promise<unknown> => {
  try {
    // Generic handler — fetch_with_fk returns Json directly
    const { data, error } = await supabase.rpc("fetch_with_fk", args);
    if (error) {
      throw error;
    }
    return data as unknown;
  } catch (error: any) {
    console.error("Error in fetchWithFk:", error);
    return null;
  }
};

export const fetchWithIfk = async (args: any): Promise<unknown> => {
  try {
    // Generic handler — fetch_with_ifk returns Json directly
    const { data, error } = await supabase.rpc("fetch_with_ifk", args);
    if (error) {
      throw error;
    }
    return data as unknown;
  } catch (error: any) {
    console.error("Error in fetchWithIfk:", error);
    return null;
  }
};

export const fetchWithFkIfk = async (args: any): Promise<unknown> => {
  try {
    // Generic handler — fetch_all_fk_ifk returns Json directly
    const { data, error } = await supabase.rpc("fetch_all_fk_ifk", args);
    if (error) {
      throw error;
    }
    return data as unknown;
  } catch (error: any) {
    console.error("Error in fetchWithFkIfk:", error);
    return null;
  }
};

export const fetchCustomRels = async (args: any): Promise<unknown> => {
  try {
    // Generic handler — fetch_custom_rels returns Json directly
    const { data, error } = await supabase.rpc("fetch_custom_rels", args);
    if (error) {
      throw error;
    }
    return data as unknown;
  } catch (error: any) {
    console.error("Error in fetchCustomRels:", error);
    return null;
  }
};

interface RelatedItem {
  id: string;
  name: string;
}

interface RegisteredFunctionWithRelsType {
  id: string;
  class_name: string | null;
  description: string | null;
  module_path: string;
  name: string;
  return_broker: RelatedItem | null;
  args: RelatedItem[];
  system_functions: RelatedItem[];
}

export const getRegisteredFunctionView = async (
  startIndex: number,
  endIndex: number,
): Promise<any> => {
  try {
    const { data, error } = await fromDeprecatedTable(
      "view_registered_function",
      "lib/redux/api.ts:getRegisteredFunctionView",
    )
      .select("*")
      .order("id", { ascending: true })
      .range(startIndex, endIndex);
    if (error) {
      throw error;
    }
    return data;
  } catch (error: any) {
    console.error("Error in getRegisteredFunctionView:", error);
    return null;
  }
};
