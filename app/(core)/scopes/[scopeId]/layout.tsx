import { createClient } from "@/utils/supabase/server";
import { createDynamicRouteMetadata } from "@/utils/route-metadata";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ scopeId: string }>;
}) {
  const { scopeId } = await params;
  let title = scopeId;
  let description = "View and manage scope details and context items.";

  try {
    const supabase = await createClient();
    const query = supabase.from("ctx_scopes").select("name, description");

    const { data } = UUID_RE.test(scopeId)
      ? await query.eq("id", scopeId).maybeSingle()
      : await query.eq("slug", scopeId).maybeSingle();

    if (data?.name) title = data.name;
    if (data?.description) {
      description = (data.description as string).slice(0, 120);
    }
  } catch {
    // Fall back to route id in the tab title.
  }

  return createDynamicRouteMetadata("/scopes", {
    title,
    description,
    letter: "S",
  });
}

export default function ScopeDetailLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
