import { supabase } from "@/utils/supabase/client";
import { fromDeprecatedTable } from "@/utils/supabase/deprecated-tables";
import type { Database } from "@/types/database.types";

type FetchWithFkArgs = Database["public"]["Functions"]["fetch_with_fk"]["Args"];
type FetchWithIfkArgs = Database["public"]["Functions"]["fetch_with_ifk"]["Args"];
type FetchAllFkIfkArgs = Database["public"]["Functions"]["fetch_all_fk_ifk"]["Args"];
type FetchCustomRelsArgs = Database["public"]["Functions"]["fetch_custom_rels"]["Args"];

export const fetchWithFk = async (args: FetchWithFkArgs): Promise<unknown> => {
  try {
    // Generic handler — fetch_with_fk returns Json directly
    const { data, error } = await supabase.rpc("fetch_with_fk", args);
    if (error) {
      throw error;
    }
    return data as unknown;
  } catch (error: unknown) {
    console.error("Error in fetchWithFk:", error);
    return null;
  }
};

export const fetchWithIfk = async (args: FetchWithIfkArgs): Promise<unknown> => {
  try {
    // Generic handler — fetch_with_ifk returns Json directly
    const { data, error } = await supabase.rpc("fetch_with_ifk", args);
    if (error) {
      throw error;
    }
    return data as unknown;
  } catch (error: unknown) {
    console.error("Error in fetchWithIfk:", error);
    return null;
  }
};

export const fetchWithFkIfk = async (args: FetchAllFkIfkArgs): Promise<unknown> => {
  try {
    // Generic handler — fetch_all_fk_ifk returns Json directly
    const { data, error } = await supabase.rpc("fetch_all_fk_ifk", args);
    if (error) {
      throw error;
    }
    return data as unknown;
  } catch (error: unknown) {
    console.error("Error in fetchWithFkIfk:", error);
    return null;
  }
};

export const fetchCustomRels = async (args: FetchCustomRelsArgs): Promise<unknown> => {
  try {
    // Generic handler — fetch_custom_rels returns Json directly
    const { data, error } = await supabase.rpc("fetch_custom_rels", args);
    if (error) {
      throw error;
    }
    return data as unknown;
  } catch (error: unknown) {
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
): Promise<RegisteredFunctionWithRelsType[] | null> => {
  try {
    // `view_registered_function` is a deprecated table (fromDeprecatedTable shim,
    // typed `any` by design there) — the row shape is asserted honestly here via
    // the interface above, which documents what callers actually rely on.
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
    return data as RegisteredFunctionWithRelsType[] | null;
  } catch (error: unknown) {
    console.error("Error in getRegisteredFunctionView:", error);
    return null;
  }
};
