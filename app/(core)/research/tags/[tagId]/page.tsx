import { notFound, redirect } from "next/navigation";

import { createClient } from "@/utils/supabase/server";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Resolve a research-tag identity to its topic-scoped detail route. */
export default async function ResearchTagShortLink({
  params,
}: {
  params: Promise<{ tagId: string }>;
}) {
  const { tagId } = await params;
  if (!UUID_RE.test(tagId)) notFound();

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
