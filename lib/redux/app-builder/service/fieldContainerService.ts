import { requireUserId } from "@/utils/auth/getUserId";
import { supabase } from "@/utils/supabase/client";
import { graveyardDb } from "@/utils/supabase/graveyardDb";
import type { Database, Json } from "@/types/database.types";

import { ContainerBuilder, FieldBuilder } from "../types";
import type { FieldDefinition } from "@/types/customAppTypes";
import { dbToFieldDefinition } from "./fieldComponentService";

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
 * The add_field_to_group / refresh_field_in_group / refresh_all_fields_in_group /
 * remove_field_from_group / create_component_group RPC family was retired with the
 * graveyard-schema move. A group's `fields` JSON is now composed client-side from
 * graveyard.field_components library rows via the helpers below.
 */

const toFieldDefinition = (builder: FieldBuilder): FieldDefinition => {
  const { isPublic, authenticatedRead, publicRead, isDirty, isLocal, ...field } =
    builder;
  return field;
};

/** Loads field definitions from the field_components library, keyed by id. */
const fetchFieldDefinitionsByIds = async (
  fieldIds: string[],
): Promise<Map<string, FieldDefinition>> => {
  if (fieldIds.length === 0) return new Map();

  const { data, error } = await graveyardDb(supabase)
    .from("field_components")
    .select("*")
    .in("id", fieldIds);

  if (error) {
    console.error("Error fetching field components for group:", error);
    throw error;
  }

  return new Map(
    (data ?? []).map((row) => [row.id, toFieldDefinition(dbToFieldDefinition(row))]),
  );
};

const requireFieldDefinition = (
  defs: Map<string, FieldDefinition>,
  fieldId: string,
): FieldDefinition => {
  const def = defs.get(fieldId);
  if (!def) {
    throw new Error(
      `Field component ${fieldId} not found in the field_components library`,
    );
  }
  return def;
};

const requireComponentGroup = async (
  groupId: string,
): Promise<ContainerBuilder> => {
  const group = await getComponentGroupById(groupId);
  if (!group) {
    throw new Error(`Component group ${groupId} not found`);
  }
  return group;
};

/** Persists a group's fields JSON and returns the updated group. */
const updateGroupFields = async (
  groupId: string,
  fields: FieldDefinition[],
): Promise<ContainerBuilder> => {
  const { data, error } = await graveyardDb(supabase)
    .from("component_groups")
    .update({ fields })
    .eq("id", groupId)
    .select()
    .single();

  if (error) {
    console.error("Error updating component group fields:", error);
    throw error;
  }

  return dbToComponentGroup(data);
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
    const fieldIds = (group.fields ?? [])
      .map((field) => field.id)
      .filter((id): id is string => Boolean(id));
    const defs = await fetchFieldDefinitionsByIds(fieldIds);
    const fields = fieldIds.map((id) => requireFieldDefinition(defs, id));

    const dbData = await componentGroupToDBFormat({ ...group, fields });

    const { data, error } = await graveyardDb(supabase)
      .from("component_groups")
      .insert(dbData)
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
    await addOrRefreshFieldInGroup(groupId, fieldId);
    return true;
  } catch (err) {
    console.error("Exception in addFieldToGroup:", err);
    throw err;
  }
};

/**
 * Adds or refreshes a single field in a component group from its
 * field_components library definition. Returns the updated component group.
 */
export const addOrRefreshFieldInGroup = async (
  groupId: string,
  fieldId: string,
): Promise<ContainerBuilder> => {
  try {
    const group = await requireComponentGroup(groupId);
    const defs = await fetchFieldDefinitionsByIds([fieldId]);
    const def = requireFieldDefinition(defs, fieldId);

    const fields = group.fields.some((field) => field.id === fieldId)
      ? group.fields.map((field) => (field.id === fieldId ? def : field))
      : [...group.fields, def];

    return await updateGroupFields(groupId, fields);
  } catch (err) {
    console.error("Exception in addOrRefreshFieldInGroup:", err);
    throw err;
  }
};
/**
 * Refreshes all fields in a component group from their field_components
 * library definitions. Fields whose library row no longer exists keep their
 * stored definition (loudly).
 */
export const refreshAllFieldsInGroup = async (
  groupId: string,
): Promise<boolean> => {
  try {
    const group = await requireComponentGroup(groupId);
    const fieldIds = group.fields
      .map((field) => field.id)
      .filter((id): id is string => Boolean(id));
    const defs = await fetchFieldDefinitionsByIds(fieldIds);

    const fields = group.fields.map((field) => {
      const refreshed = field.id ? defs.get(field.id) : undefined;
      if (!refreshed && field.id) {
        console.warn(
          `refreshAllFieldsInGroup: field component ${field.id} no longer exists in the library — keeping the stored definition in group ${groupId}`,
        );
      }
      return refreshed ?? field;
    });

    await updateGroupFields(groupId, fields);
    return true;
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
    const group = await requireComponentGroup(groupId);
    const fields = group.fields.filter((field) => field.id !== fieldId);
    await updateGroupFields(groupId, fields);
    return true;
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
