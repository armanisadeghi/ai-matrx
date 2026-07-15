import { ScopeDetailView } from "@/features/scopes/components/management/ScopeDetailView";

interface ScopeDetailPageProps {
  params: Promise<{ scopeId: string }>;
}


export default async function ScopeDetailPage({
  params,
}: ScopeDetailPageProps) {
  const { scopeId } = await params;
  return <ScopeDetailView scopeId={scopeId} />;
}
