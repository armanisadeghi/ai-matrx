import PageHeader from "@/features/shell/components/header/PageHeader";
import { AgentComparisonPage } from "@/features/agents/components/diff/AgentComparisonPage";


/**
 * `?left=<agentId>&right=<agentId>` preselects both sides, so any surface that
 * has already decided which two agents matter (the Linked Agent Sync panel, a
 * lineage view) can hand the user straight to the full diff instead of making
 * them re-pick what the app already knew.
 */
function firstParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export default async function CompareAgentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const left = firstParam(params.left);
  const right = firstParam(params.right);

  return (
    <>
      <PageHeader>
        <div className="flex items-center gap-2 px-2">
          <span className="text-sm font-medium">Compare Agents</span>
        </div>
      </PageHeader>
      {/*
        The `initial*` props seed component state, so they are only read on
        mount. A soft navigation to the same route with different params
        re-renders this segment WITHOUT remounting the child — the keyed
        remount is what makes a second deep link actually change both sides
        instead of leaving stale agents selected.
      */}
      <AgentComparisonPage
        key={`${left ?? ""}|${right ?? ""}`}
        initialLeftAgentId={left}
        initialRightAgentId={right}
      />
    </>
  );
}
