/**
 * The editor's kind picker reads this app's kind catalogue (content_ir.kind_definition and its
 * canonical examples) — bound into @ai-matrx/rich-editor through the rich-content app bindings.
 */
import { supabase } from "@/utils/supabase/client";

const PICKER_LIMIT = 60;

export interface KindPickerRow {
  id: string;
  kind: string;
  label: string | null;
  sample_data: unknown;
}

export async function searchKindDefinitions(query: string): Promise<KindPickerRow[]> {
  let request = supabase
    .schema("content_ir")
    .from("kind_definition")
    .select("id, kind, label, sample_data")
    .eq("is_active", true)
    .is("deleted_at", null)
    .order("label")
    .limit(PICKER_LIMIT);
  const q = query.trim();
  if (q) request = request.or(`label.ilike.%${q.replace(/[%,()]/g, " ")}%,kind.ilike.%${q.replace(/[%,()]/g, " ")}%`);
  const { data, error } = await request;
  if (error) throw error;
  return (data ?? []) as KindPickerRow[];
}

export async function kindCanonicalExample(row: KindPickerRow): Promise<unknown> {
  const { data, error } = await supabase
    .schema("content_ir")
    .from("kind_example")
    .select("data")
    .eq("kind_definition_id", row.id)
    .eq("is_canonical", true)
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as { data?: unknown } | null)?.data ?? row.sample_data;
}
