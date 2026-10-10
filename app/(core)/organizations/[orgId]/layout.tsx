import { createClient } from "@/utils/supabase/server";
import { createDynamicRouteMetadata } from "@/utils/route-metadata";
import { ScopesRouteHeader } from "@/features/scopes/components/pages/ScopesRouteHeader";
import { ScopeAddressCanonicalizer } from "@/features/scopes/components/pages/ScopeAddressCanonicalizer";
import { isUuidShape } from "@ai-matrx/kit/uuid";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;
  const supabase = await createClient();
  let name = "Organization";

  try {
    const query = supabase
      .schema("iam")
      .from("organizations")
      .select("name, abbreviation, description");
    const { data } = isUuidShape(orgId)
      ? await query.eq("id", orgId).maybeSingle()
      : await query.eq("slug", orgId).maybeSingle();

    if (data?.name) name = data.name;
    return createDynamicRouteMetadata("/organizations", {
      title: name,
      description:
        (data?.description as string | null)?.slice(0, 120) ??
        `Workspace for ${name}.`,
      letter: data?.abbreviation ?? "OR",
    });
  } catch {
    return createDynamicRouteMetadata("/organizations", {
      title: name,
      description: "Organization workspace.",
      letter: "OR",
    });
  }
}

export default function OrganizationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {/* The segments below are ADDRESSES (slug or UUID), never identifiers —
          this rewrites a UUID address to the canonical slug one in place. */}
      <ScopeAddressCanonicalizer />
      <ScopesRouteHeader />
      {children}
    </>
  );
}
