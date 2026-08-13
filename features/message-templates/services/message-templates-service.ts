import {
  MessageTemplateDB,
  CreateMessageTemplateInput,
  UpdateMessageTemplateInput,
  MessageTemplateQueryOptions,
  MessageRole,
  TemplatesByRole,
} from "@/features/message-templates/types/message-templates-db";
import { createClient } from "@/utils/supabase/client";
import { buildSearchOr } from "@/utils/supabase-search";
import { requireUserId } from "@/utils/auth/getUserId";
import { ensureOrgId } from "@/lib/organizations/personalOrg";
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

// Fetch all message templates from database.
//
// VIEW LAW: `is_public` decides the branch. Callers that pass `is_public`
// explicitly are declaring a deliberate public-library browse (org-neutral
// by design) and keep bare RLS for that shared library. The DEFAULT list
// (no `is_public` passed) is the caller's personal template list and MUST
// be mine-scoped — it must not blend in every org's/public templates just
// because RLS lets them through.
export async function fetchMessageTemplates(
  options: MessageTemplateQueryOptions = {},
) {
  const supabase = getClient();
  let query = supabase.schema("agent").from("message_template").select("*");

  // Apply filters
  if (options.role) {
    query = query.eq("role", options.role);
  }

  if (options.is_public !== undefined) {
    query = query.eq("is_public", options.is_public);
  } else {
    // VIEW LAW: mine-scoped default list.
    const userId = requireUserId();
    query = query.eq("user_id", userId);
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

  return data as MessageTemplateDB[];
}

// Fetch message templates by role
export async function fetchTemplatesByRole(role: MessageRole) {
  return fetchMessageTemplates({ role });
}

// Fetch public templates only
export async function fetchPublicTemplates() {
  return fetchMessageTemplates({ is_public: true });
}

// Fetch templates grouped by role
export async function fetchTemplatesGroupedByRole(): Promise<TemplatesByRole> {
  const templates = await fetchMessageTemplates();

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
): Promise<MessageTemplateDB | null> {
  const supabase = getClient();
  const { data, error } = await supabase
    .schema("agent").from("message_template")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null; // Not found
    throw new Error(error.message || "Failed to fetch template");
  }

  return data as MessageTemplateDB;
}

// Create a new template
export async function createTemplate(
  input: CreateMessageTemplateInput,
): Promise<MessageTemplateDB> {
  const supabase = getClient();

  const userId = requireUserId();
  const organizationId = await ensureOrgId(undefined);

  const { data, error } = await supabase
    .schema("agent").from("message_template")
    .insert([
      {
        label: input.label,
        content: input.content,
        role: input.role,
        metadata: input.metadata || null,
        is_public: input.is_public || false,
        tags: input.tags || null,
        user_id: userId,
        organization_id: organizationId,
      },
    ])
    .select()
    .single();

  if (error) throw new Error(error.message || "Failed to create template");

  return data as MessageTemplateDB;
}

// Update an existing template
export async function updateTemplate(
  input: UpdateMessageTemplateInput,
): Promise<MessageTemplateDB> {
  const supabase = getClient();

  const updateData: any = {};

  if (input.label !== undefined) updateData.label = input.label;
  if (input.content !== undefined) updateData.content = input.content;
  if (input.role !== undefined) updateData.role = input.role;
  if (input.metadata !== undefined) updateData.metadata = input.metadata;
  if (input.is_public !== undefined) updateData.is_public = input.is_public;
  if (input.tags !== undefined) updateData.tags = input.tags;

  const { data, error } = await supabase
    .schema("agent").from("message_template")
    .update(updateData)
    .eq("id", input.id)
    .select()
    .single();

  if (error) throw new Error(error.message || "Failed to update template");

  return data as MessageTemplateDB;
}

// Delete a template
export async function deleteTemplate(id: string): Promise<void> {
  const supabase = getClient();

  const { error } = await supabase
    .schema("agent").from("message_template")
    .delete()
    .eq("id", id);

  if (error) throw new Error(error.message || "Failed to delete template");
}

// Toggle public status of a template
export async function toggleTemplatePublic(
  id: string,
  isPublic: boolean,
): Promise<MessageTemplateDB> {
  return updateTemplate({ id, is_public: isPublic });
}

// Get all unique tags across templates
export async function getAllTags(): Promise<string[]> {
  const supabase = getClient();

  const { data, error } = await supabase
    .schema("agent").from("message_template")
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
): Promise<MessageTemplateDB[]> {
  return fetchMessageTemplates({ tags });
}

// Cache management
let cachedTemplates: MessageTemplateDB[] | null = null;
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

  cachedTemplates = await fetchMessageTemplates();
  cacheTimestamp = now;

  return cachedTemplates;
}

export function clearTemplateCache() {
  cachedTemplates = null;
  cacheTimestamp = 0;
}
