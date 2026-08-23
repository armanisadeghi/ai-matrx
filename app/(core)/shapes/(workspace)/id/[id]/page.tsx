import { notFound, redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { shapeDetailHref } from "@/features/content-ir/studio/constants";

export default async function ShapeIdResolverPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("content_ir")
    .from("kind_definition")
    .select("kind")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) throw new Error(`Failed to resolve shape: ${error.message}`);
  if (!data) notFound();
  redirect(shapeDetailHref(data.kind));
}
