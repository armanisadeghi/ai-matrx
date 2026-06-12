"use client";

// EntityPack wrapper removed during entity-isolation Phase 3 — the
// `(legacy)/layout.tsx` group layout now mounts EntityProviders (which
// includes EntityPack) for the whole legacy branch.
import { ReactFlowProvider } from "reactflow";
import { useCombinedFunctionsWithArgs } from "@/lib/redux/entity/hooks/functions-and-args";
import { useEffect } from "react";
import { useDataBrokerWithFetch } from "@/lib/redux/entity/hooks/entityUsedHooks";

function WorkflowsLayoutInner({ children }: { children: React.ReactNode }) {
  const { isLoading, isError, fetchAll } = useCombinedFunctionsWithArgs();
  const { fetchDataBrokerAll } = useDataBrokerWithFetch();

  useEffect(() => {
    fetchAll();
    fetchDataBrokerAll();
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-dvh">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">
            Loading workflows...
          </p>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex items-center justify-center min-h-dvh">
        <div className="text-center">
          <p className="text-red-600 dark:text-red-400 mb-4">
            Failed to load workflows
          </p>
          <button
            onClick={fetchAll}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return <ReactFlowProvider>{children}</ReactFlowProvider>;
}

export default function WorkflowsLayoutClient({
  children,
}: {
  children: React.ReactNode;
}) {
  return <WorkflowsLayoutInner>{children}</WorkflowsLayoutInner>;
}
