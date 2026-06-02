import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { KgGraphCanvas } from "@/features/kg-graph/components/KgGraphCanvas";

interface ScopeGraphPageProps {
  params: Promise<{ scopeId: string }>;
}

export const metadata = {
  title: "Scope graph",
  description:
    "The knowledge-graph neighborhood for this scope — entities tagged to its sources and how they connect.",
};

export default async function ScopeGraphPage({ params }: ScopeGraphPageProps) {
  const { scopeId } = await params;
  return (
    <div className="h-[calc(100dvh-var(--header-height))] flex flex-col overflow-hidden bg-textured">
      <div className="shrink-0 border-b border-border px-4 py-2.5">
        <Link
          href={`/scopes/${scopeId}`}
          className="mb-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" /> Back to scope
        </Link>
        <h1 className="text-lg font-semibold text-foreground">Scope graph</h1>
        <p className="text-xs text-muted-foreground">
          The entity neighborhood for this scope. Click a node to inspect its
          source mentions.
        </p>
      </div>
      <div className="min-h-0 flex-1">
        <KgGraphCanvas mode="scope" scopeId={scopeId} />
      </div>
    </div>
  );
}
