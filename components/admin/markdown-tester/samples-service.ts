// components/admin/markdown-tester/samples-service.ts
// Direct Supabase CRUD for the admin Markdown Tester sample library.
// Super-admin-only at the DB level via RLS (see migration
// create_admin_markdown_samples). The (admin-auth) route layout enforces
// the same gate in the UI.

import { supabase } from "@/utils/supabase/client";
import { requireUserId } from "@/utils/auth/getUserId";
import type { Tables, TablesUpdate } from "@/types/database.types";

export type MarkdownSample = Tables<"admin_markdown_samples">;

export interface SampleCreateInput {
  name: string;
  description?: string;
  content: string;
  detected_blocks?: string[];
}

export type SampleUpdateInput = Pick<
  TablesUpdate<"admin_markdown_samples">,
  "name" | "description" | "content" | "detected_blocks"
>;

export async function listSamples(): Promise<MarkdownSample[]> {
  const { data, error } = await supabase
    .from("admin_markdown_samples")
    .select("*")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getSample(id: string): Promise<MarkdownSample | null> {
  const { data, error } = await supabase
    .from("admin_markdown_samples")
    .select("*")
    .eq("id", id)
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
    .from("admin_markdown_samples")
    .insert({
      name: input.name.trim(),
      description: input.description ?? "",
      content: input.content,
      detected_blocks: input.detected_blocks ?? [],
      created_by: userId,
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
    .from("admin_markdown_samples")
    .update(patch)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteSample(id: string): Promise<void> {
  const { error } = await supabase
    .from("admin_markdown_samples")
    .delete()
    .eq("id", id);
  if (error) throw error;
}
