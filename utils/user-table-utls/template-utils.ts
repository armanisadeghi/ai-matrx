import type { SupabaseClient } from '@supabase/supabase-js';
import { FieldDefinition, normalizeDataType } from './table-utils';
import { sanitizeFieldName, validateFieldName } from './field-name-sanitizer';

export interface SchemaTemplate {
  id: string;
  template_name: string;
  description: string;
  fields: FieldDefinition[];
  version: number;
  created_at: string;
}

export interface TemplateOption {
  value: string;
  label: string;
  description?: string;
}

export interface CreateTemplateParams {
  templateName: string;
  description: string;
  fields: FieldDefinition[];
  version?: number;
}

export interface CreateTemplateResult {
  success: boolean;
  templateId?: string;
  error?: string;
}

/**
 * `workbench.schema_templates` is REFERENCE data (typed B-8, 2026-09-11): its rows
 * are shared field shapes belonging to no organization and no creator, read by
 * every signed-in user and written by nobody except a platform administrator.
 *
 * So the reads below stay plain table reads as the signed-in user, and the three
 * WRITES go through the admin doors — `authenticated` holds SELECT on the table
 * and nothing else. Before this, any signed-in user of any organization could
 * rewrite or delete all five rows (proven live), which is the hole B-8 closed.
 *
 * A non-admin caller gets a real 42501 carrying the sentence the database wrote,
 * which is what these functions surface — never a swallowed failure, and never a
 * silent 0-row "success".
 */
const ADMIN_CREATE_TEMPLATE_RPC = "admin_create_schema_template" as const;
const ADMIN_UPDATE_TEMPLATE_RPC = "admin_update_schema_template" as const;
const ADMIN_DELETE_TEMPLATE_RPC = "admin_delete_schema_template" as const;

/**
 * Create a new schema template in the database
 */
export async function createSchemaTemplate(
  supabase: SupabaseClient,
  params: CreateTemplateParams
): Promise<CreateTemplateResult> {
  try {
    const { templateName, description, fields, version = 1 } = params;
    
    if (!templateName || !templateName.trim()) {
      return { success: false, error: 'Template name is required' };
    }
    
    if (!fields || !Array.isArray(fields) || fields.length === 0) {
      return { success: false, error: 'At least one field is required' };
    }
    
    // Normalize field data types, sanitize field names, and ensure proper structure
    const normalizedFields = fields.map((field, index) => {
      // Ensure field order is set correctly if not specified
      const fieldOrder = field.field_order !== undefined ? field.field_order : index + 1;
      
      // Sanitize field name to ensure database compatibility
      const sanitizedFieldName = sanitizeFieldName(field.field_name);
      
      // Log warning if field name was modified
      if (field.field_name !== sanitizedFieldName) {
        console.warn(`Field name "${field.field_name}" was sanitized to "${sanitizedFieldName}"`);
      }
      
      // Validate the sanitized field name
      if (!validateFieldName(sanitizedFieldName)) {
        throw new Error(`Invalid field name: "${field.field_name}". Field names must start with a lowercase letter and contain only lowercase letters, numbers, and underscores.`);
      }
      
      // Create a properly formatted field object
      return {
        field_name: sanitizedFieldName,
        display_name: field.display_name,
        data_type: normalizeDataType(field.data_type),
        field_order: fieldOrder,
        is_required: field.is_required || false,
        default_value: field.default_value !== undefined ? field.default_value : null
      };
    });
    
    // Admin-only door (see the note above). Refuses a non-admin with a sentence.
    const { data, error } = await supabase.rpc(ADMIN_CREATE_TEMPLATE_RPC, {
      p_template_name: templateName,
      p_description: description || '',
      p_fields: normalizedFields,
      p_version: version,
    });

    if (error) {
      console.error('Error creating schema template:', error);
      return { success: false, error: error.message };
    }

    return { success: true, templateId: data as string };
  } catch (err) {
    console.error('Error in createSchemaTemplate:', err);
    const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred';
    return { success: false, error: errorMessage };
  }
}

/**
 * Fetch available schema templates from the database
 */
export async function getSchemaTemplates(
  supabase: SupabaseClient
): Promise<SchemaTemplate[]> {
  try {
    const { data, error } = await supabase
      .schema('workbench').from('schema_templates')
      .select('*')
      .order('template_name');
    
    if (error) {
      console.error("Error fetching schema templates:", error);
      throw error;
    }
    
    return data || [];
  } catch (err) {
    console.error('Error in getSchemaTemplates:', err);
    return [];
  }
}

/**
 * Get a specific schema template by ID
 */
export async function getSchemaTemplateById(
  supabase: SupabaseClient,
  templateId: string
): Promise<SchemaTemplate | null> {
  try {
    const { data, error } = await supabase
      .schema('workbench').from('schema_templates')
      .select('*')
      .eq('id', templateId)
      .single();
    
    if (error) {
      console.error("Error fetching schema template:", error);
      throw error;
    }
    
    return data;
  } catch (err) {
    console.error('Error in getSchemaTemplateById:', err);
    return null;
  }
}

/**
 * Delete a schema template by ID
 */
export async function deleteSchemaTemplate(
  supabase: SupabaseClient,
  templateId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Admin-only door (see the note above). Refuses a non-admin with a sentence.
    const { error } = await supabase.rpc(ADMIN_DELETE_TEMPLATE_RPC, {
      p_id: templateId,
    });

    if (error) {
      console.error("Error deleting schema template:", error);
      return { success: false, error: error.message };
    }
    
    return { success: true };
  } catch (err) {
    console.error('Error in deleteSchemaTemplate:', err);
    const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred';
    return { success: false, error: errorMessage };
  }
}

/**
 * Update an existing schema template
 */
export async function updateSchemaTemplate(
  supabase: SupabaseClient,
  templateId: string,
  updates: Partial<CreateTemplateParams>
): Promise<{ success: boolean; error?: string }> {
  try {
    // The door reads NULL as "leave this column alone", so every optional field
    // below is null unless the caller actually sent it. The version bump when
    // `fields` changes now happens inside the door, where it cannot race a
    // concurrent editor — it used to be a separate read here.
    let normalizedFields: FieldDefinition[] | null = null;

    if (updates.fields) {
      // Normalize field data types and ensure proper structure
      normalizedFields = updates.fields.map((field, index) => {
        // Ensure field order is set correctly if not specified
        const fieldOrder = field.field_order !== undefined ? field.field_order : index + 1;
        
        // Create a properly formatted field object
        return {
          field_name: field.field_name,
          display_name: field.display_name,
          data_type: normalizeDataType(field.data_type),
          field_order: fieldOrder,
          is_required: field.is_required || false,
          default_value: field.default_value !== undefined ? field.default_value : null
        };
      });
    }

    // Only update if there's something to update
    if (
      updates.templateName === undefined &&
      updates.description === undefined &&
      updates.version === undefined &&
      normalizedFields === null
    ) {
      return { success: false, error: 'No updates provided' };
    }

    // Admin-only door (see the note above). Refuses a non-admin with a sentence.
    const { error } = await supabase.rpc(ADMIN_UPDATE_TEMPLATE_RPC, {
      p_id: templateId,
      p_template_name: updates.templateName ?? null,
      p_description: updates.description ?? null,
      p_fields: normalizedFields,
      p_version: updates.version ?? null,
    });

    if (error) {
      console.error("Error updating schema template:", error);
      return { success: false, error: error.message };
    }
    
    return { success: true };
  } catch (err) {
    console.error('Error in updateSchemaTemplate:', err);
    const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred';
    return { success: false, error: errorMessage };
  }
}

/**
 * Convert schema templates to dropdown options
 */
export function getTemplateOptions(templates: SchemaTemplate[]): TemplateOption[] {
  return templates.map(template => ({
    value: template.id,
    label: template.template_name,
    description: template.description
  }));
}

/**
 * Generate a sanitized table name suitable for the database
 * @param displayName User-provided display name
 * @returns A sanitized name safe for database use
 */
export function generateSanitizedTableName(displayName: string): string {
  // Convert to lowercase, replace spaces and special chars with underscores
  const sanitized = displayName
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, '_');
  
  // Add timestamp to ensure uniqueness
  const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, '').substring(0, 14);
  
  return `${sanitized}_${timestamp}`;
}

/**
 * Gets a human readable display name from a sanitized table name
 * @param sanitizedName The sanitized database table name
 * @returns A human readable display name
 */
export function getDisplayNameFromSanitized(sanitizedName: string): string {
  // Remove timestamp suffix and convert underscores to spaces
  const displayName = sanitizedName
    .replace(/_[0-9]+$/, '') // Remove timestamp suffix
    .replace(/_/g, ' ');     // Replace underscores with spaces
  
  // Capitalize first letter of each word
  return displayName
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
} 