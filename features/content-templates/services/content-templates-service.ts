import {
  ContentTemplateDB,
  CreateContentTemplateInput,
  UpdateContentTemplateInput,
  ContentTemplateQueryOptions,
  MessageRole,
  TemplatesByRole,
} from "@/features/content-templates/types/content-templates-db";
import { createClient } from "@/utils/supabase/client";
import { buildSearchOr } from "@/utils/supabase-search";
import { requireUserId } from "@/utils/auth/getUserId";
import { getScriptSupabaseClient } from "@/utils/supabase/getScriptClient";

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

// Fetch all content templates from database
export async function fetchContentTemplates(
  options: ContentTemplateQueryOptions = {},
) {
  const supabase = getClient();
  let query = supabase.from("content_template").select("*");

  // Apply filters
  if (options.role) {
    query = query.eq("role", options.role);
  }

  if (options.is_public !== undefined) {
    query = query.eq("is_public", options.is_public);
  }

  if (options.search) {
    query = query.or(buildSearchOr(options.search, ["label", "content"]));
  }

  // Filter by tags if provided
  if (options.tags && options.tags.length > 0) {
    query = query.contains("tags", options.tags);
  }

  // Apply ordering
  const orderBy = options.order_by || "created_at";
  const orderDirection = options.order_direction || "desc";
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

  if (error) throw new Error(error.message || "Failed to fetch templates");

  return data as ContentTemplateDB[];
}

// Fetch content templates by role
export async function fetchTemplatesByRole(role: MessageRole) {
  return fetchContentTemplates({ role });
}

// Fetch public templates only
export async function fetchPublicTemplates() {
  return fetchContentTemplates({ is_public: true });
}

// Fetch templates grouped by role
export async function fetchTemplatesGroupedByRole(): Promise<TemplatesByRole> {
  const templates = await fetchContentTemplates();

  const grouped: TemplatesByRole = {
    system: [],
    user: [],
    assistant: [],
    tool: [],
  };

  templates.forEach((template) => {
    if (template.role) {
      grouped[template.role].push(template);
    }
  });

  return grouped;
}

// Get a single template by ID
export async function getTemplateById(
  id: string,
): Promise<ContentTemplateDB | null> {
  const supabase = getClient();
  const { data, error } = await supabase
    .from("content_template")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null; // Not found
    throw new Error(error.message || "Failed to fetch template");
  }

  return data as ContentTemplateDB;
}

// Create a new template
export async function createTemplate(
  input: CreateContentTemplateInput,
): Promise<ContentTemplateDB> {
  const supabase = getClient();

  const userId = requireUserId();

  const { data, error } = await supabase
    .from("content_template")
    .insert([
      {
        label: input.label,
        content: input.content,
        role: input.role,
        metadata: input.metadata || null,
        is_public: input.is_public || false,
        tags: input.tags || null,
        user_id: userId,
      },
    ])
    .select()
    .single();

  if (error) throw new Error(error.message || "Failed to create template");

  return data as ContentTemplateDB;
}

// Update an existing template
export async function updateTemplate(
  input: UpdateContentTemplateInput,
): Promise<ContentTemplateDB> {
  const supabase = getClient();

  const updateData: any = {};

  if (input.label !== undefined) updateData.label = input.label;
  if (input.content !== undefined) updateData.content = input.content;
  if (input.role !== undefined) updateData.role = input.role;
  if (input.metadata !== undefined) updateData.metadata = input.metadata;
  if (input.is_public !== undefined) updateData.is_public = input.is_public;
  if (input.tags !== undefined) updateData.tags = input.tags;

  const { data, error } = await supabase
    .from("content_template")
    .update(updateData)
    .eq("id", input.id)
    .select()
    .single();

  if (error) throw new Error(error.message || "Failed to update template");

  return data as ContentTemplateDB;
}

// Delete a template
export async function deleteTemplate(id: string): Promise<void> {
  const supabase = getClient();

  const { error } = await supabase
    .from("content_template")
    .delete()
    .eq("id", id);

  if (error) throw new Error(error.message || "Failed to delete template");
}

// Toggle public status of a template
export async function toggleTemplatePublic(
  id: string,
  isPublic: boolean,
): Promise<ContentTemplateDB> {
  return updateTemplate({ id, is_public: isPublic });
}

// Get all unique tags across templates
export async function getAllTags(): Promise<string[]> {
  const supabase = getClient();

  const { data, error } = await supabase
    .from("content_template")
    .select("tags");

  if (error) throw new Error(error.message || "Failed to fetch tags");

  // Flatten and deduplicate tags
  const allTags = new Set<string>();
  data.forEach((template) => {
    if (template.tags && Array.isArray(template.tags)) {
      template.tags.forEach((tag) => allTags.add(tag));
    }
  });

  return Array.from(allTags).sort();
}

// Search templates by tags
export async function searchTemplatesByTags(
  tags: string[],
): Promise<ContentTemplateDB[]> {
  return fetchContentTemplates({ tags });
}

// Cache management
let cachedTemplates: ContentTemplateDB[] | null = null;
let cacheTimestamp: number = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

export async function getCachedTemplates(forceRefresh = false) {
  const now = Date.now();

  if (
    !forceRefresh &&
    cachedTemplates &&
    now - cacheTimestamp < CACHE_DURATION
  ) {
    return cachedTemplates;
  }

  cachedTemplates = await fetchContentTemplates();
  cacheTimestamp = now;

  return cachedTemplates;
}

export function clearTemplateCache() {
  cachedTemplates = null;
  cacheTimestamp = 0;
}
