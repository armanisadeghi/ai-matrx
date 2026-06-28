import { requireUserId } from "@/utils/auth/getUserId";
import { supabase } from "@/utils/supabase/client";
import { graveyardDb } from "@/utils/supabase/graveyardDb";
import type { Database, Json } from "@/types/database.types";
import { normalizeFieldDefinition } from "@/features/applet/utils/field-normalization";
import type {
  ComponentProps,
  ComponentType,
  FieldBuilderInput,
  FieldOption,
} from "@/types/customAppTypes";
import { FieldBuilder } from "../types";

export type FieldComponentDB =
  Database["graveyard"]["Tables"]["field_components"]["Row"];

type FieldComponentInsert =
  Database["graveyard"]["Tables"]["field_components"]["Insert"];

function defaultValueForDb(value: FieldBuilder["defaultValue"]): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

/**
 * Converts a FieldBuilder to the database format
 */
export const fieldDefinitionToDBFormat = async (
  field: FieldBuilder,
): Promise<FieldComponentInsert> => {
  const userId = requireUserId();
  return {
    ...(field.id ? { id: field.id } : {}),
    label: field.label || "",
    description: field.description || "",
    help_text: field.helpText || "",
    component_group: field.group || null,
    icon_name: field.iconName || null,
    component: field.component || "textarea",
    required: field.required !== undefined ? field.required : false,
    placeholder: field.placeholder || null,
    default_value: defaultValueForDb(field.defaultValue),
    include_other: field.includeOther !== undefined ? field.includeOther : null,
    options: (field.options ?? null) as Json | null,
    component_props: (field.componentProps ?? null) as Json | null,
    user_id: userId,
    is_public: field.isPublic !== undefined ? field.isPublic : false,
    public_read: field.publicRead !== undefined ? field.publicRead : true,
  };
};

/**
 * Converts a database record to a FieldBuilder
 */

export const dbToFieldDefinition = (
  dbRecord: FieldComponentDB,
): FieldBuilder => {
  const fieldBuilder: FieldBuilderInput = {
    id: dbRecord.id,
    label: dbRecord.label,
    description: dbRecord.description,
    helpText: dbRecord.help_text,
    group: dbRecord.component_group,
    iconName: dbRecord.icon_name,
    component: (dbRecord.component ?? "textarea") as ComponentType,
    required: dbRecord.required,
    placeholder: dbRecord.placeholder,
    defaultValue: dbRecord.default_value,
    includeOther: dbRecord.include_other,
    options: (dbRecord.options ?? undefined) as FieldOption[] | undefined,
    componentProps: (dbRecord.component_props ?? {}) as ComponentProps,
    isPublic: dbRecord.is_public,
    publicRead: dbRecord.public_read,
  };

  // Apply normalization after mapping from DB
  return normalizeFieldDefinition(fieldBuilder);
};

/**
 * Fetches all field components for the current user
 */
export const getAllFieldComponents = async (): Promise<FieldBuilder[]> => {
  const userId = requireUserId();

  const { data, error } = await graveyardDb(supabase)
    .from("field_components")
    .select("*")
    .eq("user_id", userId);

  if (error) {
    console.error("Error fetching field components:", error);
    throw error;
  }

  return (data || []).map(dbToFieldDefinition);
};

/**
 * Fetches a specific field component by ID
 */
export const getFieldComponentById = async (
  id: string,
): Promise<FieldBuilder | null> => {
  const { data, error } = await graveyardDb(supabase)
    .from("field_components")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return null;
    }
    console.error("Error fetching field component:", error);
    throw error;
  }

  return data ? dbToFieldDefinition(data) : null;
};

/**
 * Creates a new field component
 */
export const createFieldComponent = async (
  fieldDefinition: FieldBuilder,
): Promise<FieldBuilder> => {
  const dbData = await fieldDefinitionToDBFormat(fieldDefinition);

  try {
    const { data, error } = await graveyardDb(supabase)
      .from("field_components")
      .insert(dbData)
      .select()
      .single();

    if (error) {
      console.error(
        "Error creating field component:",
        error.message,
        error.details,
        error.hint,
      );
      throw error;
    }

    if (!data) {
      throw new Error("No data returned from insert operation");
    }

    return dbToFieldDefinition(data);
  } catch (err) {
    console.error("Exception in createFieldComponent:", err);
    throw err;
  }
};

/**
 * Updates an existing field component
 */
export const updateFieldComponent = async (
  id: string,
  fieldDefinition: FieldBuilder,
): Promise<FieldBuilder> => {
  const dbData = await fieldDefinitionToDBFormat(fieldDefinition);

  try {
    const { data, error } = await graveyardDb(supabase)
      .from("field_components")
      .update(dbData)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error(
        "Error updating field component:",
        error.message,
        error.details,
        error.hint,
      );
      throw error;
    }

    if (!data) {
      throw new Error("No data returned from update operation");
    }

    return dbToFieldDefinition(data);
  } catch (err) {
    console.error("Exception in updateFieldComponent:", err);
    throw err;
  }
};

/**
 * Deletes a field component
 */
export const deleteFieldComponent = async (id: string): Promise<void> => {
  const { error } = await graveyardDb(supabase)
    .from("field_components")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("Error deleting field component:", error);
    throw error;
  }
};

/**
 * Duplicates a field component
 */
export const duplicateFieldComponent = async (
  id: string,
): Promise<FieldBuilder> => {
  const component = await getFieldComponentById(id);

  if (!component) {
    throw new Error(`Field component with id ${id} not found`);
  }

  const dbData = await fieldDefinitionToDBFormat(component);
  dbData.label = `${dbData.label} (Copy)`;

  const { data, error } = await graveyardDb(supabase)
    .from("field_components")
    .insert(dbData)
    .select()
    .single();

  if (error) {
    console.error("Error duplicating field component:", error);
    throw error;
  }

  return dbToFieldDefinition(data);
};

/**
 * Fetches public field components
 */
export const getPublicFieldComponents = async (): Promise<FieldBuilder[]> => {
  const { data, error } = await graveyardDb(supabase)
    .from("field_components")
    .select("*")
    .eq("is_public", true);

  if (error) {
    console.error("Error fetching public field components:", error);
    throw error;
  }

  return (data || []).map(dbToFieldDefinition);
};

/**
 * Make a field component public or private
 */
export const setFieldComponentPublic = async (
  id: string,
  isPublic: boolean,
): Promise<void> => {
  const { error } = await graveyardDb(supabase)
    .from("field_components")
    .update({ is_public: isPublic })
    .eq("id", id);

  if (error) {
    console.error("Error updating field component visibility:", error);
    throw error;
  }
};
