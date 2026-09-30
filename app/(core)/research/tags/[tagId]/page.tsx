import { notFound, redirect } from "next/navigation";

import { createClient } from "@/utils/supabase/server";
import { isUuidShape } from "@ai-matrx/kit/uuid";


/** Resolve a research-tag identity to its topic-scoped detail route. */
export default async function ResearchTagShortLink({
  params,
}: {
  params: Promise<{ tagId: string }>;
}) {
  const { tagId } = await params;
  if (!isUuidShape(tagId)) notFound();

  const supabase = await createClient();
  const response = await supabase
    .schema("research")
    .from("rs_tag")
    .select("topic_id")
    .eq("id", tagId)
    .maybeSingle();
  if (response.error || !response.data) notFound();

  redirect(`/research/topics/${response.data.topic_id}/tags/${tagId}`);
}
