import { ScopeDetailView } from "@/features/scopes/components/management/ScopeDetailView";

interface ScopeDetailPageProps {
  params: Promise<{ scopeId: string }>;
}

export const metadata = {
  title: "Scope detail",
};

export default async function ScopeDetailPage({
  params,
}: ScopeDetailPageProps) {
  const { scopeId } = await params;
  return (
    <div className="h-[calc(100dvh-var(--header-height))] overflow-y-auto bg-textured">
      <div className="max-w-5xl mx-auto p-6 md:p-8">
        <ScopeDetailView scopeId={scopeId} />
      </div>
    </div>
  );
}
