// /shapes/instances/[id] — the canonical kind-instance PERMALINK resolver.
//
// This path IS the sharing-registry `url_path_template` for
// `content_ir_kind_instance` (`/shapes/instances/{id}`): it resolves the
// instance's kind (RLS-scoped with the viewer's JWT) and redirects to the
// kind's Instances tab with the row pre-selected
// (`/shapes/[kind]/instances?i=<id>`). Keep the template and this route in
// lockstep — see `shapeInstancePermalink` in studio/constants.ts.
//
// NOTE: the static `instances` segment wins over the sibling dynamic
// `[kind]` segment by App Router precedence, so `/shapes/instances/...`
// never resolves as a kind named "instances".

import { notFound, redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { shapeInstancesHref } from "@/features/content-ir/studio/constants";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ShapeInstancePermalinkPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("content_ir")
    .from("kind_instance")
    .select("id,kind_definition:kind_definition_id(kind)")
    .eq("id", decodeURIComponent(id))
    .is("deleted_at", null)
    .maybeSingle();
  if (error) {
    throw new Error(`Failed to resolve instance "${id}": ${error.message}`);
  }
  const kind = data?.kind_definition?.kind;
  if (!kind) notFound();
  redirect(`${shapeInstancesHref(kind)}?i=${encodeURIComponent(id)}`);
}
