import {
  ContentBlockDB,
  CategoryConfigDB,
  SubcategoryConfigDB,
  CategoryWithSubcategories,
  ContentBlockQueryOptions,
} from "@/types/content-blocks-db";
import {
  ContentBlock,
  CategoryConfig,
  SubcategoryConfig,
} from "@/features/rich-text-editor/config/contentBlocks";
import { getScriptSupabaseClient } from "@/utils/supabase/getScriptClient";
import { buildSearchOr } from "@/utils/supabase-search";
import { getIconComponent as resolveIconComponent } from "@/components/official/icons/IconResolver";
import { createClient } from "@/utils/supabase/client";

// Helper to get the right client based on context
function getClient() {
  if (typeof window !== "undefined") {
    // Browser context - use browser client
    return createClient();
  } else {
    // Script/server context - use script client
    return getScriptSupabaseClient();
  }
}

// Helper function to get Lucide icon component from name
// Now uses IconResolver for optimal bundle size
export function getIconComponent(iconName: string): any {
  // Default to FileText if icon not found
  return resolveIconComponent(iconName, "FileText");
}

// Convert database record to frontend ContentBlock format
// NOTE: The old ContentBlock type still uses string-based category/subcategory
// We'll need to look up the category name from the UUID in the future
// For now, we're returning placeholder values since the context menu
// should be updated to use the new hierarchical category system
export function dbContentBlockToContentBlock(
  dbBlock: ContentBlockDB,
): ContentBlock {
  return {
    id: dbBlock.block_id,
    label: dbBlock.label,
    description: dbBlock.description || "",
    icon: getIconComponent(dbBlock.icon_name),
    category: "structure", // DEPRECATED: No longer used with UUID-based categories
    subcategory: undefined, // DEPRECATED: No longer used with UUID-based categories
    template: dbBlock.template,
  };
}

// Convert database record to frontend CategoryConfig format
export function dbCategoryConfigToCategoryConfig(
  dbCategory: CategoryConfigDB,
  subcategories: SubcategoryConfigDB[] = [],
): CategoryConfig {
  return {
    id: dbCategory.category_id,
    label: dbCategory.label,
    icon: getIconComponent(dbCategory.icon_name),
    color: dbCategory.color,
    subcategories: subcategories.map((sub) => ({
      id: sub.subcategory_id,
      label: sub.label,
      icon: getIconComponent(sub.icon_name),
    })),
  };
}

// Fetch all content blocks from database
export async function fetchContentBlocks(
  options: ContentBlockQueryOptions = {},
) {
  const supabase = getClient();
  let query = supabase.from("content_blocks").select("*");

  // Apply filters
  if (options.category_id) {
    query = query.eq("category_id", options.category_id);
  }

  if (options.is_active !== undefined) {
    query = query.eq("is_active", options.is_active);
  }

  if (options.search) {
    query = query.or(
      buildSearchOr(options.search, ["label", "description", "block_id"]),
    );
  }

  // Apply ordering
  const orderBy = options.order_by || "sort_order";
  const orderDirection = options.order_direction || "asc";
  query = query.order(orderBy, { ascending: orderDirection === "asc" });

  // Apply pagination
  if (options.limit) {
    query = query.limit(options.limit);
  }

  if (options.offset) {
    query = query.range(
      options.offset,
      options.offset + (options.limit || 50) - 1,
    );
  }

  const { data, error } = await query;

  if (error) throw error;

  return data as ContentBlockDB[];
}

// Fetch content blocks by category UUID
export async function fetchContentBlocksByCategory(categoryId: string) {
  const supabase = getClient();
  const { data, error } = await supabase
    .from("content_blocks")
    .select("*")
    .eq("category_id", categoryId)
    .eq("is_active", true)
    .order("sort_order");

  if (error) throw error;

  return data as ContentBlockDB[];
}

// Fetch content blocks by subcategory UUID (subcategoryId is a child category UUID)
export async function fetchContentBlocksBySubcategory(
  parentCategoryId: string,
  subcategoryId: string,
) {
  const supabase = getClient();
  const { data, error } = await supabase
    .from("content_blocks")
    .select("*")
    .eq("category_id", subcategoryId)
    .eq("is_active", true)
    .order("sort_order");

  if (error) throw error;

  return data as ContentBlockDB[];
}

// Fetch content blocks directly in a category (no children)
// This gets blocks where category_id matches the parent category
export async function fetchContentBlocksWithoutSubcategory(categoryId: string) {
  const supabase = getClient();
  const { data, error } = await supabase
    .from("content_blocks")
    .select("*")
    .eq("category_id", categoryId)
    .eq("is_active", true)
    .order("sort_order");

  if (error) throw error;

  return data as ContentBlockDB[];
}

// Fetch category configurations from platform.categories (was shortcut_categories)
export async function fetchCategoryConfigs() {
  const supabase = getClient();
  const { data, error } = await supabase
    .schema("platform").from("categories")
    .select("id, label:name, icon_name:icon, color, sort_order:position, is_active:metadata->>is_active, parent_category_id:parent_id, placement_type")
    .eq("dimension", "shortcut")
    .eq("placement_type", "content-block")
    .eq("metadata->>is_active", "true")
    .is("parent_id", null) // Top-level categories only
    .order("position");

  if (error) throw error;

  // Convert to old format for compatibility
  return (data ?? []).map((sc) => ({
    id: sc.id,
    category_id: sc.id, // Use UUID directly
    label: sc.label,
    icon_name: sc.icon_name,
    color: sc.color,
    sort_order: sc.sort_order,
    is_active: sc.is_active,
  })) as CategoryConfigDB[];
}

// Fetch subcategory configurations from platform.categories (was shortcut_categories)
export async function fetchSubcategoryConfigs(categoryId?: string) {
  const supabase = getClient();
  let query = supabase
    .schema("platform").from("categories")
    .select("id, label:name, icon_name:icon, color, sort_order:position, is_active:metadata->>is_active, parent_category_id:parent_id, placement_type")
    .eq("dimension", "shortcut")
    .eq("placement_type", "content-block")
    .eq("metadata->>is_active", "true")
    .not("parent_id", "is", null); // Only child categories

  if (categoryId) {
    query = query.eq("parent_id", categoryId);
  }

  query = query.order("position");

  const { data, error } = await query;
  if (error) throw error;

  // Convert to old format for compatibility
  return (data ?? []).map((sc) => ({
    id: sc.id,
    category_id: sc.parent_category_id || "", // Parent UUID
    subcategory_id: sc.id, // Use UUID directly
    label: sc.label,
    icon_name: sc.icon_name,
    sort_order: sc.sort_order,
    is_active: sc.is_active,
  })) as SubcategoryConfigDB[];
}

// Fetch complete hierarchical structure
export async function fetchCompleteContentBlockStructure(): Promise<{
  categories: CategoryConfig[];
  contentBlocks: ContentBlock[];
}> {
  try {
    // Fetch all data in parallel
    const [categories, subcategories, blocks] = await Promise.all([
      fetchCategoryConfigs(),
      fetchSubcategoryConfigs(),
      fetchContentBlocks({ is_active: true }),
    ]);

    // Convert to frontend format
    const categoryConfigs: CategoryConfig[] = categories.map((category) => {
      const categorySubcategories = subcategories.filter(
        (sub) => sub.category_id === category.category_id,
      );
      return dbCategoryConfigToCategoryConfig(category, categorySubcategories);
    });

    const contentBlocks: ContentBlock[] = blocks.map(
      dbContentBlockToContentBlock,
    );

    return {
      categories: categoryConfigs,
      contentBlocks,
    };
  } catch (error) {
    console.error("Error fetching content block structure:", error);
    throw error;
  }
}

// Helper functions that match the original API (now using UUID category_id)
export async function getBlocksByCategory(
  categoryId: string,
): Promise<ContentBlock[]> {
  const blocks = await fetchContentBlocksByCategory(categoryId);
  return blocks.map(dbContentBlockToContentBlock);
}

export async function getBlocksBySubcategory(
  parentCategoryId: string,
  subcategoryId: string,
): Promise<ContentBlock[]> {
  const blocks = await fetchContentBlocksBySubcategory(
    parentCategoryId,
    subcategoryId,
  );
  return blocks.map(dbContentBlockToContentBlock);
}

export async function getBlocksWithoutSubcategory(
  categoryId: string,
): Promise<ContentBlock[]> {
  const blocks = await fetchContentBlocksWithoutSubcategory(categoryId);
  return blocks.map(dbContentBlockToContentBlock);
}

export async function getBlockById(id: string): Promise<ContentBlock | null> {
  const supabase = getClient();
  const { data, error } = await supabase
    .from("content_blocks")
    .select("*")
    .eq("block_id", id)
    .eq("is_active", true)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null; // Not found
    throw error;
  }

  return dbContentBlockToContentBlock(data);
}

// Cache management
let cachedStructure: {
  categories: CategoryConfig[];
  contentBlocks: ContentBlock[];
} | null = null;
let cacheTimestamp: number = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

export async function getCachedContentBlockStructure(forceRefresh = false) {
  const now = Date.now();

  if (
    !forceRefresh &&
    cachedStructure &&
    now - cacheTimestamp < CACHE_DURATION
  ) {
    return cachedStructure;
  }

  cachedStructure = await fetchCompleteContentBlockStructure();
  cacheTimestamp = now;

  return cachedStructure;
}

export function clearContentBlockCache() {
  cachedStructure = null;
  cacheTimestamp = 0;
}
