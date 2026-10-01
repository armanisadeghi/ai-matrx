import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/types/database.types";
import { supabase } from "@/utils/supabase/client";
import { readAllRows } from "@ai-matrx/data/db";
import { AI_MATRX_CRM_ORG, UserResearchSchema, type UserResearch, type Relationship, type ContactState } from "../lib/userResearch";

// The declaration is projected by the DB artifact train. Keep this local boundary
// typed until that projection arrives; runtime ingress is independently parsed.
type ResearchRow = Omit<UserResearch, "outreach"> & { outreach: Json; deleted_at: string | null; created_at: string; updated_by: string | null; metadata: Json };
type ResearchInsert = Pick<ResearchRow, "subject_id" | "party_id" | "organization_id" | "label" | "category" | "notes" | "contact_state">;
type ResearchDatabase = Omit<Database, "crm"> & { crm: Omit<Database["crm"], "Tables"> & { Tables: Database["crm"]["Tables"] & { party_research: { Row: ResearchRow; Insert: ResearchInsert; Update: Partial<ResearchInsert>; Relationships: [] } } } };
const client = supabase as unknown as SupabaseClient<ResearchDatabase>;

export async function readUserResearch(ownerId: string): Promise<UserResearch[]> {
  const rows = await readAllRows<ResearchRow>(
    ({ from, to }) => client.schema("crm").from("party_research").select("*", { count: "exact" })
      .eq("created_by", ownerId).is("deleted_at", null).order("id").range(from, to),
    { label: "Private contact research" },
  );
  return rows.map(row => UserResearchSchema.parse(row));
}

export async function saveUserResearch(input: {
  ownerId: string; subjectId: string; partyId: string; label: string;
  category: Relationship; notes: string; contactState: ContactState; existing: UserResearch | null;
}): Promise<UserResearch> {
  const values: ResearchInsert = { organization_id: AI_MATRX_CRM_ORG, subject_id: input.subjectId,
    party_id: input.partyId, label: input.label, category: input.category, notes: input.notes, contact_state: input.contactState };
  const table = client.schema("crm").from("party_research");
  const result = input.existing
    ? await table.update(values).eq("id", input.existing.id).eq("created_by", input.ownerId).eq("version", input.existing.version).select().maybeSingle()
    : await table.insert(values).select().single();
  if (result.error) throw new Error(result.error.message);
  if (!result.data) throw new Error("These notes changed elsewhere. Reopen them before saving.");
  return UserResearchSchema.parse(result.data);
}
