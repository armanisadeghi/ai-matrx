"use client";

/**
 * useStartMandateWorkflow — "New workflow" for a job, the workflow twin of
 * "New agent" (workflow parity, round 2).
 *
 * A mandate is filled by an agent OR a workflow. aidream
 * `POST /mandates/{key}/workflow-starter` creates a workflow owned by the
 * caller whose first step already asks for the job's inputs (keyed by the same
 * names, so a binding needs no mapping) and whose declared output kind is the
 * job's. The Workflow Studio (the authoring app) opens it in a new tab; the caller is then taken to the
 * Binding tab, where the finished workflow is picked. It is not bound here: a
 * workflow with no steps cannot answer the job yet, and the bind gate would
 * rightly refuse it.
 */

import { useState } from "react";
import { callApi } from "@/lib/api/call-api";
import { useAppDispatch } from "@/lib/redux/hooks";
import { toast } from "@/lib/toast";
import { isOrganizationSelectionCancelled } from "@/lib/organization/organization-gate";
import { WORKFLOWS_APP_URL } from "@/features/shell/constants/nav-data";

export interface WorkflowStarterResult {
  workflow_id: string;
  name: string;
  mandate_key: string;
  inputs: string[];
  output_kind: string | null;
  skipped: { name: string; reason: string }[];
  studio_path: string;
  message: string;
}

function isStarterResult(value: unknown): value is WorkflowStarterResult {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.workflow_id === "string" &&
    typeof record.studio_path === "string" &&
    typeof record.message === "string"
  );
}

/** The Workflow Studio (the authoring app) address of a workflow. */
export function workflowStudioHref(studioPath: string): string {
  return `${WORKFLOWS_APP_URL}${studioPath.startsWith("/") ? "" : "/"}${studioPath}`;
}

export function workflowStarterPath(mandateKey: string): string {
  return `/mandates/${encodeURIComponent(mandateKey)}/workflow-starter`;
}

export function useStartMandateWorkflow(): {
  starting: boolean;
  /** Returns the new workflow, or null when it was not created. */
  startWorkflow: (mandateKey: string) => Promise<WorkflowStarterResult | null>;
} {
  const dispatch = useAppDispatch();
  const [starting, setStarting] = useState(false);

  const startWorkflow = async (mandateKey: string) => {
    // Opened on the click itself, so the browser does not treat the studio
    // tab as an unrequested popup once the create call returns.
    const studio = typeof window !== "undefined" ? window.open("", "_blank") : null;
    setStarting(true);
    try {
      const response = await dispatch(
        callApi({ path: workflowStarterPath(mandateKey), method: "POST", body: {} }),
      );
      if (response.error) throw new Error(response.error.message);
      if (!isStarterResult(response.data)) {
        throw new Error("The server did not say which workflow it created.");
      }
      const created = response.data;
      const studioHref = workflowStudioHref(created.studio_path);
      if (studio) studio.location.href = studioHref;
      // Always a door, even when the tab opened: a browser (or an embedded
      // pane) may swallow the pre-opened tab without saying so.
      toast.success(created.message, {
        action: {
          label: "Open in studio",
          onClick: () => window.open(studioHref, "_blank"),
        },
      });
      if (created.skipped.length > 0) {
        toast.warning(
          `Not added as inputs: ${created.skipped
            .map((item) => `${item.name} (${item.reason})`)
            .join("; ")}.`,
        );
      }
      return created;
    } catch (error) {
      studio?.close();
      if (!isOrganizationSelectionCancelled(error)) {
        toast.error(
          `Could not start a workflow for this job: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
      return null;
    } finally {
      setStarting(false);
    }
  };

  return { starting, startWorkflow };
}
