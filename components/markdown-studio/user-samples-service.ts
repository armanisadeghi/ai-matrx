// components/markdown-studio/user-samples-service.ts
// Direct Supabase CRUD for the per-user Markdown Studio samples table.
// RLS scopes everything to auth.uid() — no client-side userId filter
// needed, but explicit user_id on insert is required by the RLS check.

import { supabase } from "@/utils/supabase/client";
import { requireUserId } from "@/utils/auth/getUserId";
import type { Tables, TablesUpdate } from "@/types/database.types";

export type UserMarkdownSample = Tables<"user_markdown_samples">;

export interface UserSampleCreateInput {
  name: string;
  description?: string;
  content: string;
  detected_blocks?: string[];
}

export type UserSampleUpdateInput = Pick<
  TablesUpdate<"user_markdown_samples">,
  "name" | "description" | "content" | "detected_blocks"
>;

export async function listUserSamples(): Promise<UserMarkdownSample[]> {
  const { data, error } = await supabase
    .from("user_markdown_samples")
    .select("*")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createUserSample(
  input: UserSampleCreateInput,
): Promise<UserMarkdownSample> {
  const userId = requireUserId();
  const { data, error } = await supabase
    .from("user_markdown_samples")
    .insert({
      name: input.name.trim(),
      description: input.description ?? "",
      content: input.content,
      detected_blocks: input.detected_blocks ?? [],
      user_id: userId,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateUserSample(
  id: string,
  patch: UserSampleUpdateInput,
): Promise<UserMarkdownSample> {
  const { data, error } = await supabase
    .from("user_markdown_samples")
    .update(patch)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteUserSample(id: string): Promise<void> {
  const { error } = await supabase
    .from("user_markdown_samples")
    .delete()
    .eq("id", id);
  if (error) throw error;
}
