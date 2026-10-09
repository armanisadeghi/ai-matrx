/**
 * "This is me" for a person brand — kept apart from the creation I/O so the
 * Voice page does not load the CRM resolver to offer one button.
 */

import { supabase } from "@/utils/supabase/client";
import { updateBrand } from "../data/service";

/**
 * "This is me": the signed-in person marks a person brand as themselves. Only
 * that person can (the database refuses anyone else's id), and only while the
 * brand names nobody yet.
 */
export async function claimPersonBrand(brandId: string, userId: string): Promise<void> {
  const { data, error } = await supabase
    .schema("web")
    .from("brand")
    .select("version, kind, person_user_id")
    .eq("id", brandId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw new Error(`The brand could not be read: ${error.message}`);
  if (!data) throw new Error("That brand is not yours to change.");
  if (data.kind !== "person") throw new Error("Only a person brand can be marked as you.");
  if (data.person_user_id && data.person_user_id !== userId) {
    throw new Error("This brand is already marked as someone else.");
  }
  if (data.person_user_id === userId) return;
  await updateBrand({ brandId, expectedVersion: data.version, patch: { person_user_id: userId } });
}
