import { getAdminSupabaseClient } from '@/utils/supabase/getScriptClient';
import { buildSearchOr } from '@/utils/supabase-search';
import { requireUserId } from '@/utils/auth/getUserId';
import { graveyardDb } from "@/utils/supabase/graveyardDb";
import {
  ShortcutCategory,
  PromptBuiltin,
  PromptShortcut,
  ScopeMapping,
  CreateShortcutCategoryInput,
  UpdateShortcutCategoryInput,
  CreatePromptBuiltinInput,
  UpdatePromptBuiltinInput,
  CreatePromptShortcutInput,
  UpdatePromptShortcutInput,
  PromptExecutionData,
} from '../types/core';
import { ContentBlockDB, UpdateContentBlockInput } from '@/types/content-blocks-db';
import { logDetailedError } from '../utils/error-handler';
import { createClient } from '@/utils/supabase/client';
import type { Database, Json } from '@/types/database.types';
import type { DbRpcRow } from '@/types/supabase-rpc';
import {
  normalizePromptMessagesFromDb,
  normalizePromptSettingsFromDb,
  normalizePromptVariablesFromDb,
} from '@/features/prompts/utils/normalize-prompt-db-json';
import { PLACEMENT_TYPES, type PlacementType } from '../constants';

// platform.categories row shape (after repoint from retired shortcut_categories)
type ShortcutCategoryRow = Record<string, unknown>;

function isPlacementType(value: string): value is PlacementType {
  return (Object.values(PLACEMENT_TYPES) as string[]).includes(value);
}

function parseScopeMappingFromJson(value: unknown): ScopeMapping {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: ScopeMapping = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === 'string') out[k] = v;
  }
  return out;
}

function parseShortcutCategoryMetadata(value: Json | null): Record<string, unknown> | null {
  if (value === null) return null;
  if (typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  return null;
}

function parseEnabledContexts(value: Json | null): string[] | null {
  if (value === null) return null;
  if (!Array.isArray(value)) return null;
  const strings = value.filter((item): item is string => typeof item === 'string');
  return strings.length > 0 ? strings : null;
}

function mapShortcutCategoryFromDb(row: ShortcutCategoryRow): ShortcutCategory {
  const placement_type: PlacementType =
    typeof row.placement_type === 'string' && isPlacementType(row.placement_type)
      ? row.placement_type
      : PLACEMENT_TYPES.AI_ACTION;

  return {
    id: row.id,
    placement_type,
    parent_category_id: row.parent_category_id,
    label: row.label,
    description: row.description,
    icon_name: row.icon_name,
    color: row.color ?? 'zinc',
    sort_order: row.sort_order ?? 999,
    is_active: row.is_active ?? true,
    metadata: parseShortcutCategoryMetadata(row.metadata),
    enabled_contexts: parseEnabledContexts(row.enabled_features),
  };
}

function normalizeExecutionTools(value: unknown): unknown[] | null {
  if (value == null) return null;
  if (!Array.isArray(value)) return null;
  return value;
}

function mapRpcRowToPromptExecutionData(row: DbRpcRow<'get_prompt_execution_data'>): PromptExecutionData {
  return {
    shortcut_id: row.shortcut_id,
    shortcut_label: row.shortcut_label,
    scope_mappings: parseScopeMappingFromJson(row.scope_mappings),
    available_scopes: row.available_scopes,
    prompt_builtin_id: row.prompt_builtin_id,
    prompt_name: row.prompt_name,
    messages: normalizePromptMessagesFromDb(row.messages as Json),
    variableDefaults: normalizePromptVariablesFromDb(row.variable_defaults as Json),
    tools: normalizeExecutionTools(row.tools) as PromptExecutionData['tools'],
    settings: normalizePromptSettingsFromDb(row.settings as Json) as PromptExecutionData['settings'],
  };
}

// Helper to get the right client based on context.
// On the server (API routes), use the admin client so writes to admin-only tables
// (prompt_builtins, prompt_shortcuts, etc.) bypass RLS correctly.
// On the client (browser), use the regular anon client — RLS applies and the
// user must be an admin to reach these pages anyway.
function getClient() {
  if (typeof window !== 'undefined') {
    return createClient();
  } else {
    return getAdminSupabaseClient();
  }
}

// ============================================================================
// Shortcut Categories
// ============================================================================

export async function fetchShortcutCategories(filters?: {
  placement_type?: string;
  parent_category_id?: string | null;
  is_active?: boolean;
}): Promise<ShortcutCategory[]> {
  const supabase = getClient();
  let query = supabase
    .schema('platform').from('categories')
    .select('id, placement_type, label:name, description:metadata->>description, icon_name:icon, color, sort_order:position, is_active:metadata->>is_active, metadata, enabled_features:metadata->enabled_features, parent_category_id:parent_id, organization_id, created_at, updated_at')
    .eq('dimension', 'shortcut')
    .order('position', { ascending: true });

  if (filters?.placement_type) {
    query = query.eq('placement_type', filters.placement_type);
  }
  if (filters?.parent_category_id !== undefined) {
    if (filters.parent_category_id === null) {
      query = query.is('parent_id', null);
    } else {
      query = query.eq('parent_id', filters.parent_category_id);
    }
  }
  if (filters?.is_active !== undefined) {
    query = query.eq('metadata->>is_active', String(filters.is_active));
  }

  const { data, error } = await query;

  if (error) {
    logDetailedError('fetchShortcutCategories', error);
    throw new Error(`Failed to fetch shortcut categories: ${error.message || 'Unknown error'} (Code: ${error.code || 'UNKNOWN'})`);
  }

  return data as unknown as ShortcutCategory[];
}

export async function getShortcutCategoryById(id: string): Promise<ShortcutCategory | null> {
  const supabase = getClient();
  const { data, error } = await supabase
    .schema('platform').from('categories')
    .select('id, placement_type, label:name, description:metadata->>description, icon_name:icon, color, sort_order:position, is_active:metadata->>is_active, metadata, enabled_features:metadata->enabled_features, parent_category_id:parent_id, organization_id, created_at, updated_at')
    .eq('dimension', 'shortcut')
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // Not found
    throw error;
  }

  return data as ShortcutCategory;
}

export async function createShortcutCategory(input: CreateShortcutCategoryInput): Promise<ShortcutCategory> {
  const supabase = getClient();
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData?.user?.id ?? null;

  const insertData: any = {
    dimension: 'shortcut',
    placement_type: input.placement_type,
    name: input.label,
    parent_id: input.parent_category_id ?? null,
    icon: input.icon_name ?? 'SquareMenu',
    color: input.color ?? 'zinc',
    position: input.sort_order ?? 999,
    created_by: userId,
    metadata: {
      ...(input.metadata ?? {}),
      description: input.description ?? null,
      is_active: input.is_active ?? true,
      legacy_table: 'shortcut_categories',
    },
  };

  // Only add ID if provided
  if (input.id) {
    insertData.id = input.id;
  }

  const { data, error } = await supabase
    .schema('platform').from('categories')
    .insert([insertData])
    .select('id, placement_type, label:name, description:metadata->>description, icon_name:icon, color, sort_order:position, is_active:metadata->>is_active, metadata, enabled_features:metadata->enabled_features, parent_category_id:parent_id, organization_id, created_at, updated_at')
    .single();

  if (error) {
    logDetailedError('createShortcutCategory', error);
    throw new Error(`Failed to create shortcut category: ${error.message || 'Unknown error'} (Code: ${error.code || 'UNKNOWN'})`);
  }

  if (!data) {
    throw new Error('No data returned after creating shortcut category');
  }

  return data as unknown as ShortcutCategory;
}

export async function updateShortcutCategory(input: UpdateShortcutCategoryInput): Promise<ShortcutCategory> {
  const supabase = getClient();
  const updateData: any = {};

  if (input.placement_type !== undefined) updateData.placement_type = input.placement_type;
  if (input.parent_category_id !== undefined) updateData.parent_id = input.parent_category_id;
  if (input.label !== undefined) updateData.name = input.label;
  if (input.icon_name !== undefined) updateData.icon = input.icon_name;
  if (input.color !== undefined) updateData.color = input.color;
  if (input.sort_order !== undefined) updateData.position = input.sort_order;

  // Fields that moved into metadata — merge them in
  const metadataUpdates: Record<string, unknown> = {};
  if (input.description !== undefined) metadataUpdates.description = input.description;
  if (input.is_active !== undefined) metadataUpdates.is_active = input.is_active;
  if (input.metadata !== undefined) Object.assign(metadataUpdates, input.metadata);
  if (Object.keys(metadataUpdates).length > 0) {
    // Use jsonb_set-style merge: fetch current metadata then merge, or rely on
    // the caller passing full metadata. PostgREST doesn't support partial jsonb
    // merge directly, so we store the update as a top-level metadata object.
    updateData.metadata = metadataUpdates;
  }

  const { data, error } = await supabase
    .schema('platform').from('categories')
    .update(updateData)
    .eq('dimension', 'shortcut')
    .eq('id', input.id)
    .select('id, placement_type, label:name, description:metadata->>description, icon_name:icon, color, sort_order:position, is_active:metadata->>is_active, metadata, enabled_features:metadata->enabled_features, parent_category_id:parent_id, organization_id, created_at, updated_at')
    .single();

  if (error) {
    logDetailedError('updateShortcutCategory', error);
    throw new Error(`Failed to update shortcut category: ${error.message || 'Unknown error'} (Code: ${error.code || 'UNKNOWN'})`);
  }

  if (!data) {
    throw new Error('No data returned after updating shortcut category');
  }

  return data as unknown as ShortcutCategory;
}

/**
 * Check if a category has dependent records that would prevent deletion
 * Returns information about blocking dependencies
 */
export async function checkCategoryDependencies(categoryId: string): Promise<{
  canDelete: boolean;
  dependencies: {
    contentBlocks: number;
    promptShortcuts: number;
    childCategories: number;
  };
}> {
  const supabase = getClient();

  // Check for content blocks using this category
  const { count: contentBlocksCount, error: cbError } = await supabase
    .from('content_blocks')
    .select('id', { count: 'exact', head: true })
    .eq('category_id', categoryId);

  if (cbError) {
    logDetailedError('checkCategoryDependencies - content_blocks', cbError);
    throw new Error(`Failed to check content blocks: ${cbError.message}`);
  }

  // Check for prompt shortcuts using this category
  const { count: shortcutsCount, error: psError } = await graveyardDb(supabase)
    .from("prompt_shortcuts")
    .select('id', { count: 'exact', head: true })
    .eq('category_id', categoryId);

  if (psError) {
    logDetailedError('checkCategoryDependencies - prompt_shortcuts', psError);
    throw new Error(`Failed to check prompt shortcuts: ${psError.message}`);
  }

  // Check for child categories
  const { count: childrenCount, error: childError } = await supabase
    .schema('platform').from('categories')
    .select('id', { count: 'exact', head: true })
    .eq('dimension', 'shortcut')
    .eq('parent_id', categoryId);

  if (childError) {
    logDetailedError('checkCategoryDependencies - child_categories', childError);
    throw new Error(`Failed to check child categories: ${childError.message}`);
  }

  const dependencies = {
    contentBlocks: contentBlocksCount || 0,
    promptShortcuts: shortcutsCount || 0,
    childCategories: childrenCount || 0,
  };

  const canDelete = Object.values(dependencies).every(count => count === 0);

  return { canDelete, dependencies };
}

export async function deleteShortcutCategory(id: string): Promise<void> {
  const supabase = getClient();
  
  // Check dependencies first
  const { canDelete, dependencies } = await checkCategoryDependencies(id);
  
  if (!canDelete) {
    const blockingItems: string[] = [];
    if (dependencies.contentBlocks > 0) {
      blockingItems.push(`${dependencies.contentBlocks} content block${dependencies.contentBlocks > 1 ? 's' : ''}`);
    }
    if (dependencies.promptShortcuts > 0) {
      blockingItems.push(`${dependencies.promptShortcuts} prompt shortcut${dependencies.promptShortcuts > 1 ? 's' : ''}`);
    }
    if (dependencies.childCategories > 0) {
      blockingItems.push(`${dependencies.childCategories} child categor${dependencies.childCategories > 1 ? 'ies' : 'y'}`);
    }
    
    throw new Error(
      `Cannot delete category because it is being used by: ${blockingItems.join(', ')}. ` +
      `Please reassign or remove these items first.`
    );
  }
  
  const { error } = await supabase
    .schema('platform').from('categories')
    .delete()
    .eq('dimension', 'shortcut')
    .eq('id', id);

  if (error) {
    logDetailedError('deleteShortcutCategory', error);
    throw new Error(`Failed to delete shortcut category: ${error.message || 'Unknown error'} (Code: ${error.code || 'UNKNOWN'})`);
  }
}

/**
 * Soft delete - sets is_active to false
 */
export async function deactivateShortcutCategory(id: string): Promise<ShortcutCategory> {
  return updateShortcutCategory({ id, is_active: false });
}

/**
 * Reactivate - sets is_active to true
 */
export async function activateShortcutCategory(id: string): Promise<ShortcutCategory> {
  return updateShortcutCategory({ id, is_active: true });
}

// ============================================================================
// Prompt Builtins
// ============================================================================

/**
 * Transform database prompt builtin (snake_case) to UI format (camelCase for variableDefaults)
 */
function transformBuiltinFromDB(dbBuiltin: any): PromptBuiltin {
  return {
    ...dbBuiltin,
    variableDefaults: dbBuiltin.variable_defaults || [],
    // Ensure boolean fields have defaults
    is_favorite: dbBuiltin.is_favorite ?? false,
    is_archived: dbBuiltin.is_archived ?? false,
  };
}

export async function fetchPromptBuiltins(filters?: {
  is_active?: boolean;
  search?: string;
  limit?: number;
}): Promise<PromptBuiltin[]> {
  const supabase = getClient();
  let query = graveyardDb(supabase)
    .from("prompt_builtins")
    .select('*')
    .order('name', { ascending: true });

  if (filters?.is_active !== undefined) {
    query = query.eq('is_active', filters.is_active);
  }

  if (filters?.search) {
    query = query.or(buildSearchOr(filters.search, ["name", "description"]));
  }

  if (filters?.limit) {
    query = query.limit(filters.limit);
  }

  const { data, error } = await query;

  if (error) {
    logDetailedError('fetchPromptBuiltins', error);
    throw new Error(`Failed to fetch prompt builtins: ${error.message || 'Unknown error'} (Code: ${error.code || 'UNKNOWN'})`);
  }

  // Transform from DB format to UI format
  return (data || []).map(transformBuiltinFromDB);
}

/**
 * Fetch prompt builtins with source prompt information (OPTIMIZED)
 * Uses prompt_builtins_with_source_view to eliminate N+1 query problem
 * Returns builtins with source_prompt_name included - no additional API calls needed!
 */
export async function fetchPromptBuiltinsWithSource(filters?: {
  is_active?: boolean;
  search?: string;
  limit?: number;
}): Promise<Array<PromptBuiltin & { source_prompt_name?: string }>> {
  const supabase = getClient();
  let query = supabase
    .from('prompt_builtins_with_source_view')
    .select('*')
    .order('name', { ascending: true });

  if (filters?.is_active !== undefined) {
    query = query.eq('is_active', filters.is_active);
  }

  if (filters?.search) {
    query = query.or(buildSearchOr(filters.search, ["name", "description"]));
  }

  if (filters?.limit) {
    query = query.limit(filters.limit);
  }

  const { data, error } = await query;

  if (error) {
    logDetailedError('fetchPromptBuiltinsWithSource', error);
    throw new Error(`Failed to fetch prompt builtins with source: ${error.message || 'Unknown error'} (Code: ${error.code || 'UNKNOWN'})`);
  }

  // Transform from DB format to UI format, preserving source_prompt_name
  return (data || []).map(row => ({
    ...transformBuiltinFromDB(row),
    source_prompt_name: row.source_prompt_name || undefined
  }));
}

export async function getPromptBuiltinById(id: string): Promise<PromptBuiltin | null> {
  const supabase = getClient();
  const { data, error } = await graveyardDb(supabase)
    .from("prompt_builtins")
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // Not found
    throw error;
  }

  return data ? transformBuiltinFromDB(data) : null;
}

export async function createPromptBuiltin(input: CreatePromptBuiltinInput): Promise<PromptBuiltin> {
  const supabase = getClient();
  const userId = requireUserId();

  const insertData: any = {
    name: input.name,
    description: input.description ?? null,
    messages: input.messages,
    variable_defaults: input.variableDefaults ?? null, // DB uses snake_case
    tools: input.tools ?? null,
    settings: input.settings ?? {},
    is_active: input.is_active ?? true,
    created_by_user_id: userId,
    tags: input.tags ?? null,
    category: input.category ?? null,
    model_id: input.model_id ?? null,
    output_format: input.output_format ?? null,
    output_schema: input.output_schema ?? null,
    is_favorite: input.is_favorite ?? false,
    is_archived: input.is_archived ?? false,
  };

  // Only add ID if provided
  if (input.id) {
    insertData.id = input.id;
  }

  const { data, error } = await graveyardDb(supabase)
    .from("prompt_builtins")
    .insert([insertData])
    .select()
    .single();

  if (error) {
    logDetailedError('createPromptBuiltin', error);
    throw new Error(`Failed to create prompt builtin: ${error.message || 'Unknown error'} (Code: ${error.code || 'UNKNOWN'})`);
  }

  return transformBuiltinFromDB(data);
}

export async function updatePromptBuiltin(input: UpdatePromptBuiltinInput): Promise<PromptBuiltin> {
  const supabase = getClient();
  const updateData: any = {};

  if (input.name !== undefined) updateData.name = input.name;
  if (input.description !== undefined) updateData.description = input.description;
  if (input.messages !== undefined) updateData.messages = input.messages;
  if (input.variableDefaults !== undefined) updateData.variable_defaults = input.variableDefaults; // DB uses snake_case
  if (input.tools !== undefined) updateData.tools = input.tools;
  if (input.settings !== undefined) updateData.settings = input.settings;
  if (input.is_active !== undefined) updateData.is_active = input.is_active;
  if (input.tags !== undefined) updateData.tags = input.tags;
  if (input.category !== undefined) updateData.category = input.category;
  if (input.model_id !== undefined) updateData.model_id = input.model_id;
  if (input.output_format !== undefined) updateData.output_format = input.output_format;
  if (input.output_schema !== undefined) updateData.output_schema = input.output_schema;
  if (input.is_favorite !== undefined) updateData.is_favorite = input.is_favorite;
  if (input.is_archived !== undefined) updateData.is_archived = input.is_archived;

  const { data, error } = await graveyardDb(supabase)
    .from("prompt_builtins")
    .update(updateData)
    .eq('id', input.id)
    .select()
    .single();

  if (error) {
    logDetailedError('updatePromptBuiltin', error);
    throw new Error(`Failed to update prompt builtin: ${error.message || 'Unknown error'} (Code: ${error.code || 'UNKNOWN'})`);
  }

  return transformBuiltinFromDB(data);
}

export async function deletePromptBuiltin(id: string): Promise<void> {
  const supabase = getClient();
  
  // First, verify the builtin exists
  const { data: existingBuiltin, error: fetchError } = await graveyardDb(supabase)
    .from("prompt_builtins")
    .select('id, name')
    .eq('id', id)
    .single();

  if (fetchError) {
    if (fetchError.code === 'PGRST116') {
      throw new Error('Prompt builtin not found - it may have already been deleted');
    }
    logDetailedError('deletePromptBuiltin - fetch', fetchError);
    throw new Error(`Failed to verify builtin exists: ${fetchError.message || 'Unknown error'}`);
  }

  if (!existingBuiltin) {
    throw new Error('Prompt builtin not found');
  }

  // Perform the delete
  const { error: deleteError } = await graveyardDb(supabase)
    .from("prompt_builtins")
    .delete()
    .eq('id', id);

  if (deleteError) {
    logDetailedError('deletePromptBuiltin - delete', deleteError);
    
    // Provide specific error messages for common issues
    if (deleteError.code === '23503') {
      throw new Error('Cannot delete: This builtin is still referenced by other records. Please remove all connections first.');
    }
    
    throw new Error(`Failed to delete prompt builtin: ${deleteError.message || 'Unknown error'} (Code: ${deleteError.code || 'UNKNOWN'})`);
  }

  // Verify deletion succeeded
  const { data: verifyDeleted } = await graveyardDb(supabase)
    .from("prompt_builtins")
    .select('id')
    .eq('id', id)
    .single();

  if (verifyDeleted) {
    throw new Error('Delete operation completed but record still exists. This may be due to database policies or constraints.');
  }
}

/**
 * Soft delete - sets is_active to false
 */
export async function deactivatePromptBuiltin(id: string): Promise<PromptBuiltin> {
  return updatePromptBuiltin({ id, is_active: false });
}

/**
 * Reactivate - sets is_active to true
 */
export async function activatePromptBuiltin(id: string): Promise<PromptBuiltin> {
  return updatePromptBuiltin({ id, is_active: true });
}

/**
 * Check if a builtin already exists for a given source prompt
 * Returns the existing builtin(s) if found
 */
export async function getBuiltinsBySourcePromptId(sourcePromptId: string): Promise<PromptBuiltin[]> {
  const supabase = getClient();
  const { data, error } = await graveyardDb(supabase)
    .from("prompt_builtins")
    .select('*')
    .eq('source_prompt_id', sourcePromptId)
    .eq('is_active', true)
    .order('created_at', { ascending: false });

  if (error) {
    logDetailedError('getBuiltinsBySourcePromptId', error);
    throw new Error(`Failed to fetch builtins by source prompt: ${error.message || 'Unknown error'} (Code: ${error.code || 'UNKNOWN'})`);
  }

  return (data || []).map(transformBuiltinFromDB);
}

// ============================================================================
// Prompt Shortcuts
// ============================================================================

export async function fetchPromptShortcuts(filters?: {
  category_id?: string;
  prompt_builtin_id?: string;
  is_active?: boolean;
  limit?: number;
}): Promise<PromptShortcut[]> {
  const supabase = getClient();
  let query = graveyardDb(supabase)
    .from("prompt_shortcuts")
    .select('*')
    .order('sort_order', { ascending: true });

  if (filters?.category_id) {
    query = query.eq('category_id', filters.category_id);
  }

  if (filters?.prompt_builtin_id) {
    query = query.eq('prompt_builtin_id', filters.prompt_builtin_id);
  }

  if (filters?.is_active !== undefined) {
    query = query.eq('is_active', filters.is_active);
  }

  if (filters?.limit) {
    query = query.limit(filters.limit);
  }

  const { data, error } = await query;

  if (error) {
    logDetailedError('fetchPromptShortcuts', error);
    throw new Error(`Failed to fetch prompt shortcuts: ${error.message || 'Unknown error'} (Code: ${error.code || 'UNKNOWN'})`);
  }

  return data as PromptShortcut[];
}

export async function getPromptShortcutById(id: string): Promise<PromptShortcut | null> {
  const supabase = getClient();
  const { data, error } = await graveyardDb(supabase)
    .from("prompt_shortcuts")
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // Not found
    throw error;
  }

  return data as PromptShortcut;
}

export async function createPromptShortcut(input: CreatePromptShortcutInput): Promise<PromptShortcut> {
  const supabase = getClient();
  const userId = requireUserId();

  const insertData: any = {
    prompt_builtin_id: input.prompt_builtin_id ?? null,
    category_id: input.category_id,
    label: input.label,
    description: input.description ?? null,
    icon_name: input.icon_name ?? null,
    keyboard_shortcut: input.keyboard_shortcut ?? null,
    sort_order: input.sort_order ?? 0,
    scope_mappings: input.scope_mappings ?? null,
    available_scopes: input.available_scopes ?? null,
    // Execution Configuration
    result_display: input.result_display ?? 'modal-full', // FIXED: was 'modal', now 'modal-full'
    auto_run: input.auto_run ?? true,
    allow_chat: input.allow_chat ?? true,
    show_variables: input.show_variables ?? false,
    apply_variables: input.apply_variables ?? true,
    is_active: input.is_active ?? true,
    created_by_user_id: userId ?? null,
  };

  // Only add ID if provided
  if (input.id) {
    insertData.id = input.id;
  }

  const { data, error } = await graveyardDb(supabase)
    .from("prompt_shortcuts")
    .insert([insertData])
    .select()
    .single();

  if (error) {
    logDetailedError('createPromptShortcut', error);
    throw new Error(`Failed to create prompt shortcut: ${error.message || 'Unknown error'} (Code: ${error.code || 'UNKNOWN'})`);
  }

  if (!data) {
    throw new Error('No data returned after creating prompt shortcut');
  }

  return data as PromptShortcut;
}

/**
 * Duplicate an existing shortcut with a new category
 * Copies all fields except id, created_at, updated_at
 */
export async function duplicatePromptShortcut(
  shortcutId: string,
  newCategoryId: string
): Promise<PromptShortcut> {
  // First, fetch the existing shortcut
  const existingShortcut = await getPromptShortcutById(shortcutId);
  
  if (!existingShortcut) {
    throw new Error('Shortcut not found');
  }

  // Create a new shortcut with all the same fields except the category
  const duplicateInput: CreatePromptShortcutInput = {
    prompt_builtin_id: existingShortcut.prompt_builtin_id,
    category_id: newCategoryId,
    label: existingShortcut.label,
    description: existingShortcut.description,
    icon_name: existingShortcut.icon_name,
    keyboard_shortcut: existingShortcut.keyboard_shortcut,
    sort_order: existingShortcut.sort_order,
    scope_mappings: existingShortcut.scope_mappings,
    available_scopes: existingShortcut.available_scopes,
    result_display: existingShortcut.result_display,
    auto_run: existingShortcut.auto_run,
    allow_chat: existingShortcut.allow_chat,
    show_variables: existingShortcut.show_variables,
    apply_variables: existingShortcut.apply_variables,
    is_active: existingShortcut.is_active,
  };

  return createPromptShortcut(duplicateInput);
}

export async function updatePromptShortcut(input: UpdatePromptShortcutInput): Promise<PromptShortcut> {
  const supabase = getClient();
  const updateData: any = {};

  if (input.prompt_builtin_id !== undefined) updateData.prompt_builtin_id = input.prompt_builtin_id;
  if (input.category_id !== undefined) updateData.category_id = input.category_id;
  if (input.label !== undefined) updateData.label = input.label;
  if (input.description !== undefined) updateData.description = input.description;
  if (input.icon_name !== undefined) updateData.icon_name = input.icon_name;
  if (input.keyboard_shortcut !== undefined) updateData.keyboard_shortcut = input.keyboard_shortcut;
  if (input.sort_order !== undefined) updateData.sort_order = input.sort_order;
  if (input.scope_mappings !== undefined) updateData.scope_mappings = input.scope_mappings;
  if (input.available_scopes !== undefined) updateData.available_scopes = input.available_scopes;
  // Execution Configuration
  if (input.result_display !== undefined) updateData.result_display = input.result_display;
  if (input.auto_run !== undefined) updateData.auto_run = input.auto_run;
  if (input.allow_chat !== undefined) updateData.allow_chat = input.allow_chat;
  if (input.show_variables !== undefined) updateData.show_variables = input.show_variables;
  if (input.apply_variables !== undefined) updateData.apply_variables = input.apply_variables;
  if (input.is_active !== undefined) updateData.is_active = input.is_active;

  const { data, error } = await graveyardDb(supabase)
    .from("prompt_shortcuts")
    .update(updateData)
    .eq('id', input.id)
    .select()
    .single();

  if (error) {
    logDetailedError('updatePromptShortcut', error);
    throw new Error(`Failed to update prompt shortcut: ${error.message || 'Unknown error'} (Code: ${error.code || 'UNKNOWN'})`);
  }

  return data as PromptShortcut;
}

export async function deletePromptShortcut(id: string): Promise<void> {
  const supabase = getClient();
  const { error } = await graveyardDb(supabase)
    .from("prompt_shortcuts")
    .delete()
    .eq('id', id);

  if (error) {
    logDetailedError('deletePromptShortcut', error);
    throw new Error(`Failed to delete prompt shortcut: ${error.message || 'Unknown error'} (Code: ${error.code || 'UNKNOWN'})`);
  }
}

/**
 * Soft delete - sets is_active to false
 */
export async function deactivatePromptShortcut(id: string): Promise<PromptShortcut> {
  return updatePromptShortcut({ id, is_active: false });
}

/**
 * Reactivate - sets is_active to true
 */
export async function activatePromptShortcut(id: string): Promise<PromptShortcut> {
  return updatePromptShortcut({ id, is_active: true });
}


/**
 * Get execution data for a prompt shortcut
 * Used when a user clicks a menu item to execute the prompt
 */
export async function getPromptExecutionData(shortcutId: string): Promise<PromptExecutionData | null> {
  const supabase = getClient();
  
  const { data, error } = await supabase
    .rpc('get_prompt_execution_data', { p_shortcut_id: shortcutId });

  if (error) {
    logDetailedError('getPromptExecutionData', error);
    throw new Error(`Failed to get prompt execution data: ${error.message || 'Unknown error'} (Code: ${error.code || 'UNKNOWN'})`);
  }

  if (!data || data.length === 0) {
    return null;
  }

  return mapRpcRowToPromptExecutionData(data[0] as DbRpcRow<'get_prompt_execution_data'>);
}

// ============================================================================
// Batch Operations
// ============================================================================

/**
 * Fetch shortcuts with their related category and builtin data
 * Useful for admin UI that needs to display full relationship info
 */
export async function fetchShortcutsWithRelations(filters?: {
  category_id?: string;
  is_active?: boolean;
}): Promise<(PromptShortcut & {
  category: ShortcutCategory | null;
  builtin: PromptBuiltin | null;
})[]> {
  const shortcuts = await fetchPromptShortcuts(filters);

  if (shortcuts.length === 0) return [];

  const supabase = getClient();

  // Fetch related categories
  const categoryIds = [...new Set(shortcuts.map(s => s.category_id))];
  const { data: categories } = await supabase
    .schema('platform').from('categories')
    .select('id, placement_type, label:name, description:metadata->>description, icon_name:icon, color, sort_order:position, is_active:metadata->>is_active, metadata, enabled_features:metadata->enabled_features, parent_category_id:parent_id, organization_id, created_at, updated_at')
    .eq('dimension', 'shortcut')
    .in('id', categoryIds);

  // Fetch related builtins
  const builtinIds = [...new Set(shortcuts.map(s => s.prompt_builtin_id))].filter(Boolean);
  const { data: builtins } = await graveyardDb(supabase)
    .from("prompt_builtins")
    .select('*')
    .in('id', builtinIds);

  const categoryMap = new Map((categories || []).map(c => [c.id, mapShortcutCategoryFromDb(c)]));
  // Transform builtins from DB format to UI format
  const builtinMap = new Map((builtins || []).map(b => [b.id, transformBuiltinFromDB(b)]));

  return shortcuts.map(shortcut => ({
    ...shortcut,
    category: categoryMap.get(shortcut.category_id) || null,
    builtin: builtinMap.get(shortcut.prompt_builtin_id) || null,
  }));
}

/**
 * Get all categories with their shortcuts count
 * Useful for category management UI
 */
export async function fetchCategoriesWithShortcutCounts(placementType?: string): Promise<(ShortcutCategory & {
  shortcut_count: number;
})[]> {
  const categories = await fetchShortcutCategories(
    placementType ? { placement_type: placementType } : undefined
  );

  if (categories.length === 0) return categories.map(c => ({ ...c, shortcut_count: 0 }));

  const supabase = getClient();
  const categoryIds = categories.map(c => c.id);

  const { data: shortcuts } = await graveyardDb(supabase)
    .from("prompt_shortcuts")
    .select('category_id')
    .in('category_id', categoryIds)
    .eq('is_active', true);

  const countMap = new Map<string, number>();
  (shortcuts || []).forEach(s => {
    countMap.set(s.category_id, (countMap.get(s.category_id) || 0) + 1);
  });

  return categories.map(category => ({
    ...category,
    shortcut_count: countMap.get(category.id) || 0,
  }));
}

// ============================================================================
// Content Blocks
// ============================================================================

/**
 * Fetch content blocks with optional filters
 */
export async function fetchContentBlocks(filters?: {
  category_id?: string;
  is_active?: boolean;
}): Promise<ContentBlockDB[]> {
  const supabase = getClient();
  let query = supabase
    .from('content_blocks')
    .select('*')
    .order('sort_order', { ascending: true });

  if (filters?.category_id) {
    query = query.eq('category_id', filters.category_id);
  }
  if (filters?.is_active !== undefined) {
    query = query.eq('is_active', filters.is_active);
  }

  const { data, error } = await query;

  if (error) {
    logDetailedError('fetchContentBlocks', error);
    throw new Error(`Failed to fetch content blocks: ${error.message || 'Unknown error'}`);
  }

  return data as ContentBlockDB[];
}

/**
 * Get a single content block by ID
 */
export async function getContentBlockById(id: string): Promise<ContentBlockDB | null> {
  const supabase = getClient();
  const { data, error } = await supabase
    .from('content_blocks')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }

  return data as ContentBlockDB;
}

/**
 * Update an existing content block
 */
export async function updateContentBlock(input: UpdateContentBlockInput): Promise<ContentBlockDB> {
  const supabase = getClient();
  
  const { id, ...updates } = input;
  
  const { data, error } = await supabase
    .from('content_blocks')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    logDetailedError('updateContentBlock', error);
    throw new Error(`Failed to update content block: ${error.message || 'Unknown error'}`);
  }

  return data as ContentBlockDB;
}

/**
 * Delete a content block
 */
export async function deleteContentBlock(id: string): Promise<void> {
  const supabase = getClient();
  
  const { error } = await supabase
    .from('content_blocks')
    .delete()
    .eq('id', id);

  if (error) {
    logDetailedError('deleteContentBlock', error);
    throw new Error(`Failed to delete content block: ${error.message || 'Unknown error'}`);
  }
}

// ============================================================================
// Unified Category Items (Shortcuts + Content Blocks)
// ============================================================================

export type CategoryItem = 
  | (PromptShortcut & { item_type: 'shortcut'; category?: ShortcutCategory; builtin?: PromptBuiltin })
  | (ContentBlockDB & { item_type: 'content_block'; category?: ShortcutCategory });

/**
 * Fetch all items (shortcuts and content blocks) with their relations
 * This provides a unified view for the admin UI
 */
export async function fetchCategoryItemsWithRelations(filters?: {
  category_id?: string;
  is_active?: boolean;
}): Promise<CategoryItem[]> {
  // Fetch shortcuts and content blocks in parallel
  const [shortcuts, contentBlocks] = await Promise.all([
    fetchShortcutsWithRelations(filters),
    fetchContentBlocks(filters),
  ]);

  // Transform shortcuts to include item_type
  const shortcutItems: CategoryItem[] = shortcuts.map(s => ({
    ...s,
    item_type: 'shortcut' as const,
  }));

  // Fetch categories for content blocks if needed
  const supabase = getClient();
  const categoryIds = [...new Set(contentBlocks.map(cb => cb.category_id).filter(Boolean) as string[])];
  const { data: categories } = categoryIds.length > 0
    ? await supabase
        .schema('platform').from('categories')
        .select('id, placement_type, label:name, description:metadata->>description, icon_name:icon, color, sort_order:position, is_active:metadata->>is_active, metadata, enabled_features:metadata->enabled_features, parent_category_id:parent_id, organization_id, created_at, updated_at')
        .eq('dimension', 'shortcut')
        .in('id', categoryIds)
    : { data: [] };

  const categoryMap = new Map((categories || []).map(c => [c.id, mapShortcutCategoryFromDb(c)]));

  // Transform content blocks to include item_type and category
  const contentBlockItems: CategoryItem[] = contentBlocks.map(cb => ({
    ...cb,
    item_type: 'content_block' as const,
    category: cb.category_id ? categoryMap.get(cb.category_id) || undefined : undefined,
  }));

  // Combine and sort by category and sort_order
  return [...shortcutItems, ...contentBlockItems].sort((a, b) => {
    if (a.category_id !== b.category_id) {
      return (a.category_id || '').localeCompare(b.category_id || '');
    }
    return a.sort_order - b.sort_order;
  });
}

