"use client";

import { createClient } from "@/utils/supabase/client";
import { requireOrganizationContext } from "@/lib/api/organization-context";
import type { Database } from "@/types/database.types";

/** Both binding editors use the named tool's authoritative organization. */
export async function addToolBinding(args: {
  toolId: string;
  executorName: string;
  isActive?: boolean;
}): Promise<Database["tool"]["Tables"]["binding"]["Row"]> {
  const client = createClient();
  const { data: tool, error: readError } = await client
    .schema("tool").from("definition")
    .select("id, organization_id")
    .eq("id", args.toolId)
    .single();
  if (readError) throw readError;
  if (!tool || tool.id !== args.toolId) throw new Error("The selected tool is unavailable. Reload it before adding a binding.");
  const organizationId = requireOrganizationContext(tool.organization_id);
  const { data, error } = await client
    .schema("tool").from("binding")
    .insert({
      tool_id: args.toolId,
      executor_name: args.executorName,
      is_active: args.isActive ?? true,
      organization_id: organizationId,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}
