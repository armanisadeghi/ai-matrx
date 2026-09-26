// components/admin/markdown-tester/samples-service.ts
// Direct Supabase CRUD for the SHARED markdown sample library — the
// platform's public catalogue (admin_markdown_samples_shared_catalogue.sql):
// every signed-in person reads it (the Markdown Studio's read-only starter
// samples); platform admins write it from the studio in the admin section.
// Rows belong to the Matrx System org, soft-delete only.

import { supabase } from "@/utils/supabase/client";
import { writeOne } from "@/utils/supabase/writeOne";
import { requireUserId } from "@/utils/auth/getUserId";
import type { Tables, TablesUpdate } from "@/types/database.types";
import { resolveSystemOrgId } from "@/lib/organizations/systemOrg";

export type MarkdownSample = Tables<{ schema: "admin" }, "admin_markdown_samples">;

export interface SampleCreateInput {
  name: string;
  description?: string;
  content: string;
  detected_blocks?: string[];
}

export type SampleUpdateInput = Pick<
  TablesUpdate<{ schema: "admin" }, "admin_markdown_samples">,
  "name" | "description" | "content" | "detected_blocks"
>;

export async function listSamples(): Promise<MarkdownSample[]> {
  const { data, error } = await supabase
    .schema("admin").from("admin_markdown_samples")
    .select("*")
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getSample(id: string): Promise<MarkdownSample | null> {
  const { data, error } = await supabase
    .schema("admin").from("admin_markdown_samples")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .single();
  if (error) {
    if (error.code === "PGRST116") return null;
    throw error;
  }
  return data;
}

export async function createSample(
  input: SampleCreateInput,
): Promise<MarkdownSample> {
  const userId = requireUserId();
  const { data, error } = await supabase
    .schema("admin").from("admin_markdown_samples")
    .insert({
      name: input.name.trim(),
      description: input.description ?? "",
      content: input.content,
      detected_blocks: input.detected_blocks ?? [],
      created_by: userId,
      // The platform's shared catalogue belongs to the Matrx System org — said explicitly,
      // never chosen by a default or a trigger (no-db-assigned-org).
      organization_id: await resolveSystemOrgId(),
      visibility: "public",
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateSample(
  id: string,
  patch: SampleUpdateInput,
): Promise<MarkdownSample> {
  const { data, error } = await supabase
    .schema("admin").from("admin_markdown_samples")
    .update(patch)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteSample(id: string): Promise<void> {
  // Soft delete (db-rules §8): readers filter deleted_at.
  await writeOne(
    supabase
      .schema("admin").from("admin_markdown_samples")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id)
      .is("deleted_at", null)
      .select("id"),
    { action: "delete", noun: "sample" },
  );
}
