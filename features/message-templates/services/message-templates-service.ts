import {
  MessageTemplateDB,
  CreateMessageTemplateInput,
  UpdateMessageTemplateInput,
  MessageTemplateQueryOptions,
  MessageRole,
  TemplatesByRole,
  MessageTemplateUpdate,
} from "@/features/message-templates/types/message-templates-db";
import { createClient } from "@/utils/supabase/client";
import { tryWriteOne, WriteDidNotLandError } from "@/utils/supabase/writeOne";
import { makeAssertData, operationFailed } from "@/utils/errors";
import { buildSearchOr } from "@/utils/supabase-search";
import { getUserId, requireUserId } from "@/utils/auth/getUserId";
import { publishedToWebPatch } from "@/lib/row-access";
import { getScriptSupabaseClient } from "@/utils/supabase/getScriptClient";

const assertData = makeAssertData("load your message templates");

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
// VIEW LAW: `publishedToWeb` decides the branch. Callers that pass it
// explicitly are declaring a deliberate web-library browse (org-neutral
// by design) and keep bare RLS for that shared library. The DEFAULT list
// (no `publishedToWeb` passed) is the caller's personal template list and MUST
// be mine-scoped — it must not blend in every org's/public templates just
// because RLS lets them through.
export async function fetchMessageTemplates(
  options: MessageTemplateQueryOptions = {},
) {
  const supabase = getClient();
  // ARCHIVE LAW: archived templates live in Trash, never in a list.
  let query = supabase
    .schema("agent")
    .from("message_template")
    .select("*")
    .is("deleted_at", null);

  // Apply filters
  if (options.role) {
    query = query.eq("role", options.role);
  }

  if (options.publishedToWeb !== undefined) {
    query = query.eq("published_to_web", options.publishedToWeb);
  } else {
    // VIEW LAW: mine-scoped default list.
    const userId = requireUserId();
    query = query.eq("created_by", userId);
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

  return assertData(data, error);
}

// Fetch message templates by role
export async function fetchTemplatesByRole(role: MessageRole) {
  return fetchMessageTemplates({ role });
}

// Fetch public templates only
export async function fetchPublicTemplates() {
  return fetchMessageTemplates({ publishedToWeb: true });
}

/** Team templates for one real org plus the shared public library. */
export async function fetchOrganizationMessageTemplates(
  organizationId: string,
): Promise<MessageTemplateDB[]> {
  const supabase = getClient();
  const { data, error } = await supabase
    .schema("agent")
    .from("message_template")
    .select("*")
    .or(`organization_id.eq.${organizationId},published_to_web.eq.true`)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });
  return assertData(data, error);
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
    .schema("agent")
    .from("message_template")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null; // Zero rows — caller decides
    throw operationFailed("load this template", error);
  }

  return data;
}

// Create a new template
export async function createTemplate(
  input: CreateMessageTemplateInput,
): Promise<MessageTemplateDB> {
  if (!input.organization_id.trim()) {
    throw new Error(
      "Select an organization before creating a message template.",
    );
  }
  const supabase = getClient();

  const userId = requireUserId();
  const { data, error } = await supabase
    .schema("agent")
    .from("message_template")
    .insert([
      {
        label: input.label,
        content: input.content,
        role: input.role,
        metadata: input.metadata || null,
        ...(input.published_to_web
          ? publishedToWebPatch(true, userId)
          : {}),
        tags: input.tags || null,
        created_by: userId,
        organization_id: input.organization_id,
      },
    ])
    .select()
    .single();

  return assertData(data, error, "create this template");
}

// Update an existing template
export async function updateTemplate(
  input: UpdateMessageTemplateInput,
): Promise<MessageTemplateDB> {
  const supabase = getClient();

  const updateData: MessageTemplateUpdate = {};

  if (input.label !== undefined) updateData.label = input.label;
  if (input.content !== undefined) updateData.content = input.content;
  if (input.role !== undefined) updateData.role = input.role;
  if (input.metadata !== undefined) updateData.metadata = input.metadata;
  if (input.published_to_web !== undefined) {
    Object.assign(
      updateData,
      publishedToWebPatch(input.published_to_web, getUserId()),
    );
  }
  if (input.tags !== undefined) updateData.tags = input.tags;

  // Zero rows (refused, or archived meanwhile) is said in words; `.single()`
  // used to turn it into a generic "could not save" with no reason.
  const { row, error } = await tryWriteOne(
    supabase
      .schema("agent")
      .from("message_template")
      .update(updateData)
      .eq("id", input.id)
      .select(),
    { action: "save", noun: "template" },
  );
  if (error) {
    throw error instanceof WriteDidNotLandError
      ? error
      : operationFailed("save this template", error);
  }
  return row;
}

/**
 * Archive a template — the ARCHIVE LAW: a person's record is never destroyed
 * from a page. It moves to Trash (restorable there), every list and picker
 * stops showing it, and the server's senders refuse it as "no longer exists".
 */
export async function archiveTemplate(id: string): Promise<void> {
  const supabase = getClient();
  const { error } = await tryWriteOne(
    supabase
      .schema("agent")
      .from("message_template")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id)
      .is("deleted_at", null)
      .select("id"),
    { action: "archive", noun: "template" },
  );
  if (error) {
    throw error instanceof WriteDidNotLandError
      ? error
      : operationFailed("archive this template", error);
  }
}

// Toggle public status of a template
export async function toggleTemplatePublic(
  id: string,
  isPublic: boolean,
): Promise<MessageTemplateDB> {
  return updateTemplate({ id, published_to_web: isPublic });
}

// Get all unique tags across templates
export async function getAllTags(): Promise<string[]> {
  const supabase = getClient();

  const { data, error } = await supabase
    .schema("agent")
    .from("message_template")
    .select("tags")
    .is("deleted_at", null);

  const rows = assertData(data, error, "load your template tags");

  // Flatten and deduplicate tags
  const allTags = new Set<string>();
  rows.forEach((template) => {
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
