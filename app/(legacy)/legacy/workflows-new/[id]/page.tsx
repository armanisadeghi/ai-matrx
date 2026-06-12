"use client";
import React, { useEffect } from "react";
import { WorkflowSystem } from "@/features/workflows-xyflow/WorkflowSystem";
import { useRouter } from "next/navigation";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { workflowActions } from "@/lib/redux/workflow/slice";
import {
  createWorkflow,
  fetchOneWorkflowWithNodes,
} from "@/lib/redux/workflow/thunks";
import { selectUser } from "@/lib/redux/selectors/userSelectors";
import { workflowsSelectors } from "@/lib/redux/workflow/selectors";

interface WorkflowPageProps {
  params: Promise<{
    id: string;
  }>;
  searchParams: Promise<{
    mode?: "edit" | "view" | "execute";
  }>;
}

export default function WorkflowPage({
  params,
  searchParams,
}: WorkflowPageProps) {
  // Unwrap the promises using React.use()
  const { id: workflowId } = React.use(params);
  const { mode = "edit" } = React.use(searchParams);

  const router = useRouter();
  const dispatch = useAppDispatch();
  const user = useAppSelector(selectUser);
  const workflow = useAppSelector((state) =>
    workflowsSelectors.workflowById(state, workflowId),
  );
  const isLoading = useAppSelector(workflowsSelectors.isLoading);
  const activeWorkflowId = useAppSelector((state) => state.workflows.activeId);

  // Load existing workflow and select it
  useEffect(() => {
    if (workflowId !== "new") {
      // Select the workflow first
      dispatch(workflowActions.setActive(workflowId));

      // Then fetch it if it doesn't exist or is stale
      dispatch(fetchOneWorkflowWithNodes(workflowId));
    }
  }, [workflowId, dispatch]);

  // Handle new workflow creation
  useEffect(() => {
    if (workflowId === "new") {
      // Create a new workflow
      const newWorkflow = {
        name: "New Workflow",
        description: "A new workflow",
        workflow_type: "workflow",
        inputs: [],
        outputs: [],
        dependencies: [],
        sources: [],
        destinations: [],
        actions: null,
        category: null,
        tags: null,
        is_active: true,
        is_deleted: false,
        auto_execute: false,
        metadata: {},
        viewport: { x: 0, y: 0, zoom: 1 },
        is_public: false,
        public_read: false,
        user_id: user.id,
      };

      // Create workflow via Redux thunk
      dispatch(createWorkflow(newWorkflow))
        .then((action: any) => {
          if (action.payload?.id) {
            // Select the new workflow and redirect to its edit page
            dispatch(workflowActions.setActive(action.payload.id));
            router.replace(`/workflows-new/${action.payload.id}`);
          }
        })
        .catch((error: any) => {
          console.error("Failed to create workflow:", error);
          router.back();
        });

      return;
    }
  }, [workflowId, dispatch, user.id, router]);

  // Let Next.js loading.tsx handle the loading UI instead of blocking it
  // Remove the custom loading spinner to allow the beautiful loading.tsx to show

  // Show error if workflow not found (but only if not loading)
  if (workflowId !== "new" && !workflow && !isLoading) {
    return (
      <div className="h-dvh w-full flex items-center justify-center bg-background">
        <div className="text-lg text-red-500">Workflow not found</div>
      </div>
    );
  }

  return (
    <div className="h-dvh w-full">
      <WorkflowSystem workflowId={workflowId} mode={mode} />
    </div>
  );
}
