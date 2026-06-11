import { createDynamicRouteMetadata } from "@/utils/route-metadata";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ scopeId: string }>;
}) {
  const { scopeId } = await params;
  const shortId = scopeId.length > 12 ? `${scopeId.slice(0, 8)}…` : scopeId;
  return createDynamicRouteMetadata("/scopes", {
    title: shortId,
    description: "View and manage scope details and context items.",
    letter: "Sc",
  });
}

export default function ScopeDetailLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
