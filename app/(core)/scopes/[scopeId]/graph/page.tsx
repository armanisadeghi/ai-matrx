import { KgGraphCanvas } from "@/features/kg-graph/components/KgGraphCanvas";
import RouteHeader from "@/features/shell/components/header/RouteHeader";
import { ChevronLeftTapButton } from "@/components/icons/tap-buttons";

interface ScopeGraphPageProps {
  params: Promise<{ scopeId: string }>;
}


export default async function ScopeGraphPage({ params }: ScopeGraphPageProps) {
  const { scopeId } = await params;
  return (
    <>
      <RouteHeader
        left={
          <>
            <ChevronLeftTapButton
              href="/scopes"
              ariaLabel="Back to scopes"
            />
            <span className="truncate max-w-[55vw] sm:max-w-[220px] text-sm font-medium text-foreground px-1.5">
              Scope graph
            </span>
          </>
        }
      />
      <div className="h-full flex flex-col overflow-hidden bg-textured pt-[var(--shell-header-h)]">
        <div className="min-h-0 flex-1">
          <KgGraphCanvas mode="scope" scopeId={scopeId} />
        </div>
      </div>
    </>
  );
}
