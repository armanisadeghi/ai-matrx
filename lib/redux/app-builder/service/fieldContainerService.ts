import { requireUserId } from "@/utils/auth/getUserId";
import { supabase } from "@/utils/supabase/client";
import { graveyardDb } from "@/utils/supabase/graveyardDb";
import type { Database, Json } from "@/types/database.types";

import { ContainerBuilder } from "../types";
import { FieldDefinition } from "@/types/customAppTypes";

export type ComponentGroupRow =
  Database["graveyard"]["Tables"]["component_groups"]["Row"];

type ComponentGroupInsert =
  Database["graveyard"]["Tables"]["component_groups"]["Insert"];

/**
 * Converts a ContainerBuilder to the database format
 */
export const componentGroupToDBFormat = async (
  group: ContainerBuilder,
): Promise<ComponentGroupInsert> => {
  const userId = requireUserId();

  return {
    ...(group.id ? { id: group.id } : {}),
    label: group.label || "",
    short_label: group.shortLabel ?? null,
    description: group.description ?? null,
    hide_description:
      group.hideDescription !== undefined ? group.hideDescription : false,
    help_text: group.helpText ?? null,
    fields: (group.fields ?? []) as Json,
    user_id: userId,
    is_public: group.isPublic !== undefined ? group.isPublic : false,
    public_read: group.publicRead !== undefined ? group.publicRead : false,
  };
};

/**
 * Converts a database record to a ContainerBuilder
 */
export const dbToComponentGroup = (
  dbRecord: ComponentGroupRow,
): ContainerBuilder => {
  let processedFields: FieldDefinition[] = [];

  const rawFields = dbRecord.fields;
  if (Array.isArray(rawFields)) {
    processedFields = rawFields.map((field: unknown) => {
      if (
        field &&
        typeof field === "object" &&
        "label" in field &&
        "component" in field
      ) {
        const { isDirty, isLocal, ...cleanField } = field as FieldDefinition & {
          isDirty?: unknown;
          isLocal?: unknown;
        };
        return cleanField as FieldDefinition;
      }
      return field as FieldDefinition;
    });
  }

  return {
    id: dbRecord.id,
    label: dbRecord.label,
    shortLabel: dbRecord.short_label ?? undefined,
    description: dbRecord.description ?? undefined,
    hideDescription: dbRecord.hide_description ?? undefined,
    helpText: dbRecord.help_text ?? undefined,
    fields: processedFields,
    isPublic: dbRecord.is_public ?? undefined,
    authenticatedRead: undefined,
    publicRead: dbRecord.public_read ?? undefined,
  };
};
/**
 * Fetches all component groups for the current user
 */
export const getAllComponentGroups = async (): Promise<ContainerBuilder[]> => {
  const userId = requireUserId();

  const { data, error } = await graveyardDb(supabase)
    .from("component_groups")
    .select("*")
    .eq("user_id", userId);

  if (error) {
    console.error("Error fetching component groups:", error);
    throw error;
  }

  return (data || []).map(dbToComponentGroup);
};

/**
 * Fetches a specific component group by ID
 */
export const getComponentGroupById = async (
  id: string,
): Promise<ContainerBuilder | null> => {
  const { data, error } = await graveyardDb(supabase)
    .from("component_groups")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return null;
    }
    console.error("Error fetching component group:", error);
    throw error;
  }

  return data ? dbToComponentGroup(data) : null;
};

/**
 * Creates a new component group with fields
 */
export const createComponentGroup = async (
  group: ContainerBuilder,
): Promise<ContainerBuilder> => {
  try {
    if (group.fields && group.fields.length > 0) {
      const fieldIds = group.fields
        .map((field) => field.id)
        .filter(Boolean) as string[];

      if (fieldIds.length > 0) {
        const { data: createdId, error: rpcError } = await supabase.rpc(
          "create_component_group",
          {
            p_label: group.label,
            p_short_label: group.shortLabel || undefined,
            p_description: group.description || undefined,
            p_hide_description: group.hideDescription || false,
            p_help_text: group.helpText || undefined,
            p_field_ids: fieldIds,
          },
        );

        if (rpcError) {
          console.error("Error creating group with fields:", rpcError);
          throw rpcError;
        }

        const newGroup = await getComponentGroupById(createdId);
        if (!newGroup) {
          throw new Error("Failed to retrieve newly created group");
        }

        return newGroup;
      }
    }

    const dbData = await componentGroupToDBFormat(group);
    const { fields, ...restData } = dbData;

    const { data, error } = await graveyardDb(supabase)
      .from("component_groups")
      .insert(restData)
      .select()
      .single();

    if (error) {
      console.error(
        "Error creating component group:",
        error.message,
        error.details,
        error.hint,
      );
      throw error;
    }

    if (!data) {
      throw new Error("No data returned from insert operation");
    }

    return dbToComponentGroup(data);
  } catch (err) {
    console.error("Exception in createComponentGroup:", err);
    throw err;
  }
};

/**
 * Updates an existing component group (without modifying its fields)
 */
export const updateComponentGroup = async (
  id: string,
  group: ContainerBuilder,
): Promise<ContainerBuilder> => {
  const dbData = await componentGroupToDBFormat(group);

  console.log("updateComponentGroup dbData", JSON.stringify(dbData, null, 2));

  try {
    const { data, error } = await graveyardDb(supabase)
      .from("component_groups")
      .update(dbData)
      .eq("id", id)
      .select()
      .single();
    console.log("updateComponentGroup data", JSON.stringify(data, null, 2));

    if (error) {
      console.error(
        "Error updating component group:",
        error.message,
        error.details,
        error.hint,
      );
      throw error;
    }

    if (!data) {
      throw new Error("No data returned from update operation");
    }

    return dbToComponentGroup(data);
  } catch (err) {
    console.error("Exception in updateComponentGroup:", err);
    throw err;
  }
};

/**
 * Deletes a component group
 */
export const deleteComponentGroup = async (id: string): Promise<void> => {
  const { error } = await graveyardDb(supabase)
    .from("component_groups")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("Error deleting component group:", error);
    throw error;
  }
};

/**
 * Adds a field to a component group
 */
export const addFieldToGroup = async (
  groupId: string,
  fieldId: string,
): Promise<boolean> => {
  try {
    const { data, error } = await supabase.rpc("add_field_to_group", {
      p_group_id: groupId,
      p_field_id: fieldId,
    });

    if (error) {
      console.error("Error adding field to group:", error);
      throw error;
    }

    return !!data;
  } catch (err) {
    console.error("Exception in addFieldToGroup:", err);
    throw err;
  }
};

/**
 * Adds or refreshes a single field in a component group
 * Now returns the updated component group instead of a boolean
 */
export const addOrRefreshFieldInGroup = async (
  groupId: string,
  fieldId: string,
): Promise<ContainerBuilder> => {
  try {
    const { data, error } = await supabase.rpc("refresh_field_in_group", {
      p_group_id: groupId,
      p_field_id: fieldId,
    });

    if (error) {
      console.error("Error refreshing field in group:", error);
      throw error;
    }

    if (!data) {
      throw new Error("No data returned from refresh_field_in_group operation");
    }

    // refresh_field_in_group returns Json — cast through unknown for safety
    return dbToComponentGroup(data as unknown as ComponentGroupRow);
  } catch (err) {
    console.error("Exception in addOrRefreshFieldInGroup:", err);
    throw err;
  }
};
/**
 * Refreshes all fields in a component group
 */
export const refreshAllFieldsInGroup = async (
  groupId: string,
): Promise<boolean> => {
  try {
    const { data, error } = await supabase.rpc("refresh_all_fields_in_group", {
      p_group_id: groupId,
    });

    if (error) {
      console.error("Error refreshing all fields in group:", error);
      throw error;
    }

    return !!data;
  } catch (err) {
    console.error("Exception in refreshAllFieldsInGroup:", err);
    throw err;
  }
};

/**
 * Removes a field from a component group
 */
export const removeFieldFromGroup = async (
  groupId: string,
  fieldId: string,
): Promise<boolean> => {
  try {
    const { data, error } = await supabase.rpc("remove_field_from_group", {
      p_group_id: groupId,
      p_field_id: fieldId,
    });

    if (error) {
      console.error("Error removing field from group:", error);
      throw error;
    }

    return !!data;
  } catch (err) {
    console.error("Exception in removeFieldFromGroup:", err);
    throw err;
  }
};

/**
 * Duplicates a component group
 */
export const duplicateComponentGroup = async (
  id: string,
): Promise<ContainerBuilder> => {
  const group = await getComponentGroupById(id);

  if (!group) {
    throw new Error(`Component group with id ${id} not found`);
  }

  const newGroup = {
    ...group,
    id: "",
    label: `${group.label} (Copy)`,
  };

  return await createComponentGroup(newGroup);
};

/**
 * Fetches public component groups
 */
export const getPublicComponentGroups = async (): Promise<
  ContainerBuilder[]
> => {
  const { data, error } = await graveyardDb(supabase)
    .from("component_groups")
    .select("*")
    .eq("is_public", true);

  if (error) {
    console.error("Error fetching public component groups:", error);
    throw error;
  }

  return (data || []).map(dbToComponentGroup);
};

/**
 * Make a component group public or private
 */
export const setComponentGroupPublic = async (
  id: string,
  isPublic: boolean,
): Promise<void> => {
  const { error } = await graveyardDb(supabase)
    .from("component_groups")
    .update({ is_public: isPublic })
    .eq("id", id);

  if (error) {
    console.error("Error updating component group visibility:", error);
    throw error;
  }
};
