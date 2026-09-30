import { notFound, redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { mandateDefinitions } from "@/lib/supabase/mandateStorage";
import { personMandateRecordHref } from "@/features/mandates/member-list/routes";
import { storedMandateKey } from "@/features/mandates/mandate-key";
import { isUuidShape } from "@ai-matrx/kit/uuid";

/**
 * /mandates/id/[id] — THE DOOR for a mandate named by its definition id.
 *
 * Every mandate page is keyed on the mandate KEY, but `EntityRef token="mandate"`
 * holds the row id, so the entity registry's `hrefFor` lands here and this
 * resolves id → key → the person's record page. Also accepts a key, so a
 * caller holding either can never build a 404.
 */
export default async function MandateIdResolverPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const isUuid = isUuidShape(id);
  const supabase = await createClient();
  const { data, error } = await mandateDefinitions(supabase)
    .select("mandate_key")
    .eq(isUuid ? "id" : "mandate_key", id)
    .maybeSingle();
  if (error) throw new Error(`Failed to resolve mandate: ${error.message}`);
  if (!data) notFound();
  redirect(personMandateRecordHref(storedMandateKey(data.mandate_key)));
}
