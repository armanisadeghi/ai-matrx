"use client";

/**
 * useCopyMandateWorkflow — the workflow half of "Duplicate & customize".
 *
 * A mandate is filled by an agent OR a workflow (MANDATE-SYSTEM §4: "we give
 * you an exact copy of our agent or workflow"). `useCopyMandateAgent` covers the
 * agent; this copies the workflow the job runs through the one duplicate door
 * (`wfx_duplicate_definition` — anything you can view you may duplicate) and
 * opens the copy in the workflow editor. The copy is NOT bound for you: the
 * person assigns it in the Mandate Holder tab, exactly as the agent copy.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/toast";
import { duplicateWorkflow } from "@/features/workflow-runtime/browse/service";
import { isOrganizationSelectionCancelled } from "@/lib/organization/organization-gate";
import { extractErrorMessage } from "@/utils/errors";

export function useCopyMandateWorkflow(): {
  copyingWorkflow: boolean;
  /** Returns the new workflow id, or null when the copy failed. */
  copyWorkflowAndOpen: (workflowId: string) => Promise<string | null>;
} {
  const router = useRouter();
  const [copyingWorkflow, setCopying] = useState(false);

  const copyWorkflowAndOpen = async (workflowId: string) => {
    setCopying(true);
    try {
      const copy = await duplicateWorkflow(workflowId);
      toast.success(
        `Copied into "${copy.name}". Assign it in the Mandate Holder tab to use it for this job.`,
      );
      router.push(`/workflows/${copy.id}`);
      return copy.id;
    } catch (error) {
      if (!isOrganizationSelectionCancelled(error)) {
        toast.error(`Could not copy the workflow: ${extractErrorMessage(error)}`);
      }
      return null;
    } finally {
      setCopying(false);
    }
  };

  return { copyingWorkflow, copyWorkflowAndOpen };
}
