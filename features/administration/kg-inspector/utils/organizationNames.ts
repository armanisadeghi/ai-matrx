import { supabase } from "@/utils/supabase/client";

export async function fetchOrganizationNamesByIds(
  ids: string[],
): Promise<Record<string, string>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return {};

  const { data, error } = await supabase
    .from("organizations")
    .select("id, name")
    .in("id", unique);

  if (error) {
    console.error("Failed to resolve organization names:", error);
    return {};
  }

  const map: Record<string, string> = {};
  for (const row of data ?? []) {
    map[row.id] = row.name;
  }
  return map;
}

export function organizationDisplayName(
  organizationId: string | null,
  orgNames: Record<string, string>,
): string | null {
  if (!organizationId) return null;
  return orgNames[organizationId] ?? null;
}
