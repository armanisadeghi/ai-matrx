import { createClient } from "@/utils/supabase/server";
import { createDynamicRouteMetadata } from "@/utils/route-metadata";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;
  const supabase = await createClient();
  let name = "Organization";

  try {
    const query = supabase.from("organizations").select("name, description");
    const { data } = UUID_RE.test(orgId)
      ? await query.eq("id", orgId).maybeSingle()
      : await query.eq("slug", orgId).maybeSingle();

    if (data?.name) name = data.name;
    return createDynamicRouteMetadata("/organizations", {
      title: name,
      description:
        (data?.description as string | null)?.slice(0, 120) ??
        `Workspace for ${name}.`,
      letter: "Or",
    });
  } catch {
    return createDynamicRouteMetadata("/organizations", {
      title: name,
      description: "Organization workspace.",
      letter: "Or",
    });
  }
}

export default function OrganizationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
