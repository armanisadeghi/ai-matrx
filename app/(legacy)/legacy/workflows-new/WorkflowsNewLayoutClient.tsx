"use client";

// EntityPack wrapper removed during entity-isolation Phase 3 — the
// `(legacy)/layout.tsx` group layout now mounts EntityProviders (which
// includes EntityPack) for the whole legacy branch.
import { ReactFlowProvider } from "@xyflow/react";
import { useCombinedFunctionsWithArgs } from "@/lib/redux/entity/hooks/functions-and-args";
import { useEffect } from "react";
import {
  useDataBrokerWithFetch,
  useNodeCategoryWithFetch,
  useRegisteredNodeWithFetch,
  useAiModelWithFetch,
} from "@/lib/redux/entity/hooks/entityUsedHooks";
import { fetchFieldsThunk } from "@/lib/redux/app-builder/thunks/fieldBuilderThunks";
import { useAppDispatch } from "@/lib/redux/hooks";
import WorkflowLoading from "@/features/workflows-xyflow/common/workflow-loading";

function WorkflowLayoutInner({ children }: { children: React.ReactNode }) {
  const dispatch = useAppDispatch();
  const { combinedFunctions, isLoading, isError, fetchAll } =
    useCombinedFunctionsWithArgs();

  const { fetchDataBrokerAll } = useDataBrokerWithFetch();
  const categoryHook = useNodeCategoryWithFetch();
  const registeredNodeHook = useRegisteredNodeWithFetch();
  const aiModelHook = useAiModelWithFetch();

  useEffect(() => {
    fetchAll();
    fetchDataBrokerAll();
    dispatch(fetchFieldsThunk());
    categoryHook.fetchNodeCategoryAll();
    registeredNodeHook.fetchRegisteredNodeAll();
    aiModelHook.fetchAiModelAll();
  }, []);

  // Only block on genuine in-flight loads. combinedFunctions, nodeCategory and
  // registeredNode all read deleted tables and will always return empty — do NOT
  // gate rendering on their length or the canvas never mounts.
  if (isLoading) {
    return (
      <WorkflowLoading
        title="Loading Workflow System"
        subtitle="Initializing functions, data brokers, and workflow components..."
        step1="Functions"
        step2="Data Brokers"
        step3="Ready"
      />
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
            type="button"
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

export default function WorkflowsNewLayoutClient({
  children,
}: {
  children: React.ReactNode;
}) {
  return <WorkflowLayoutInner>{children}</WorkflowLayoutInner>;
}
