"use client";

/**
 * ProjectImportJsonPanel
 *
 * The chrome-less "paste a project JSON and create the whole tree" experience —
 * the third entry method alongside Manual and Use AI. The user pastes the same
 * payload the agent backend emits, gets live JSON + contract validation via
 * `ProJsonTextarea`, then **Create** to write the project + tasks + subtasks in
 * one transaction via the `create_project_from_json` RPC.
 *
 * Wrapped by `ProjectCreatePanel`; never forked per surface.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, FileCheck2, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  ProJsonTextarea,
  type ProJsonValidationState,
} from "@/components/official/ProJsonTextarea";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { ApplicationScope } from "@/features/agents/types/scope.types";
import { useNavTree } from "@/features/agent-context/hooks/useNavTree";
import { useAppDispatch } from "@/lib/redux/hooks";
import { invalidateAndRefetchFullContext } from "@/features/agent-context/redux/hierarchyThunks";
import { createProjectsScope } from "@/features/surfaces/manifests/projects.manifest";
import {
  createProjectFromJson,
  validateProjectJson,
  type ProjectJsonValidation,
} from "../importJson";
import {
  PROJECT_JSON_ALLOWED_TOP_LEVEL_KEYS,
  projectJsonSchema,
  projectJsonValidators,
} from "../projectJsonProJson";
import { OrgSelector, type OrgContext } from "./ProjectFormCore";

const PLACEHOLDER = `{
  "name": "My Project",
  "slug": "my-project",
  "description": "What this project is about",
  "start_date": null,
  "end_date": null,
  "tasks": [
    {
      "name": "First task",
      "description": null,
      "subtasks": [
        { "name": "A subtask", "description": null }
      ]
    }
  ]
}`;

export interface ProjectImportJsonPanelProps {
  initialOrgId?: string | null;
  initialOrgSlug?: string | null;
  orgLocked?: boolean;
  isMobile?: boolean;
  /** Called after a successful create with the new project id + slug. */
  onCreated?: (info: { projectId: string; slug?: string }) => void;
  onClose?: () => void;
}

export function ProjectImportJsonPanel({
  initialOrgId,
  initialOrgSlug,
  orgLocked = false,
  isMobile = false,
  onCreated,
  onClose,
}: ProjectImportJsonPanelProps) {
  const dispatch = useAppDispatch();
  const { orgs, isLoading: orgsLoading } = useNavTree();

  const [raw, setRaw] = useState("");
  const [jsonValidation, setJsonValidation] =
    useState<ProJsonValidationState | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const resolveInitialOrg = (): OrgContext => {
    if (!initialOrgId) return null;
    if (initialOrgSlug)
      return {
        id: initialOrgId,
        name: "",
        slug: initialOrgSlug,
        isPersonal: false,
      };
    return { id: initialOrgId, name: "", slug: "", isPersonal: false };
  };
  const [selectedOrg, setSelectedOrg] = useState<OrgContext>(resolveInitialOrg);

  useEffect(() => {
    if (!initialOrgId || !orgs.length) return;
    const found = orgs.find((o) => o.id === initialOrgId);
    if (found)
      setSelectedOrg({
        id: found.id,
        name: found.name,
        slug: found.slug,
        isPersonal: found.is_personal,
      });
  }, [orgs, initialOrgId]);

  const projectValidation = useMemo(
    () => (raw.trim() ? validateProjectJson(raw) : null),
    [raw],
  );

  const canCreate =
    !!projectValidation?.valid &&
    !!jsonValidation?.isValid &&
    !jsonValidation.isEmpty &&
    !isCreating;

  const handleValidate = () => {
    const result = validateProjectJson(raw);
    if (!raw.trim()) {
      toast.error("Paste project JSON first.");
      return;
    }
    if (result.valid) {
      toast.success("Valid project JSON", {
        description: `${result.summary?.taskCount ?? 0} task(s), ${result.summary?.subtaskCount ?? 0} subtask(s) ready.`,
      });
    } else {
      toast.error(`${result.errors.length} issue(s) found`);
    }
  };

  const handleCreate = async () => {
    const result = projectValidation ?? validateProjectJson(raw);
    if (!result.valid || !result.payload) {
      toast.error("Fix the validation errors before creating.");
      return;
    }

    setIsCreating(true);
    try {
      const created = await createProjectFromJson(
        result.payload,
        selectedOrg?.id ?? null,
      );
      if (created.success) {
        dispatch(
          invalidateAndRefetchFullContext() as unknown as Parameters<
            typeof dispatch
          >[0],
        );
        toast.success("Project created from JSON", {
          description: `${created.taskCount ?? 0} task(s) and ${created.subtaskCount ?? 0} subtask(s) imported.`,
        });
        onCreated?.({
          projectId: created.projectId!,
          slug: created.slug,
        });
        onClose?.();
      } else {
        toast.error(created.error || "Failed to create project");
      }
    } catch (error: unknown) {
      const msg =
        error instanceof Error ? error.message : "An unexpected error occurred";
      toast.error(msg);
    } finally {
      setIsCreating(false);
    }
  };

  const getJsonApplicationScope = useCallback(
    (state: ProJsonValidationState): ApplicationScope => {
      const contract = validateProjectJson(state.text);
      const context = {
        surface: "project-create",
        mode: "paste-json",
        selected_organization_id: selectedOrg?.id,
        selected_organization_name: selectedOrg?.name || undefined,
        selected_organization_slug: selectedOrg?.slug || undefined,
        org_locked: orgLocked,
        json_is_valid: state.isValid && contract.valid,
        json_errors: state.errors,
        json_warnings: state.warnings,
        json_issues: state.issues,
        json_task_count: contract.summary?.taskCount,
        json_subtask_count: contract.summary?.subtaskCount,
        project_contract_valid: contract.valid,
        project_contract_errors: contract.errors,
        project_contract_warnings: contract.warnings,
      };
      const scope = createProjectsScope({
        context,
        active_project_name: contract.summary?.name || undefined,
        active_project_description: contract.payload?.description || undefined,
        active_organization_id: selectedOrg?.id,
        active_organization_name: selectedOrg?.name || undefined,
      });
      scope.content = state.text;
      scope.json_text = state.text;
      scope.json_valid = state.isValid && contract.valid;
      scope.json_parsed = state.isJson ? state.parsed : null;
      return scope;
    },
    [orgLocked, selectedOrg],
  );

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
        {/* Owner */}
        <div className="space-y-2">
          <Label>Owner</Label>
          <OrgSelector
            orgs={orgs}
            orgsLoading={orgsLoading}
            selectedOrg={selectedOrg}
            onSelect={setSelectedOrg}
            locked={orgLocked}
            isMobile={isMobile}
          />
        </div>

        {/* JSON input — ProJsonTextarea: schema, live validation, format, agents */}
        <div className="flex min-h-0 flex-1 flex-col gap-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="project-json">Project JSON</Label>
            <span className="text-xs text-muted-foreground">
              Live validation · Format · Agent actions
            </span>
          </div>
          <ProJsonTextarea
            id="project-json"
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            placeholder={PLACEHOLDER}
            disabled={isCreating}
            schema={projectJsonSchema}
            rootType="object"
            allowedTopLevelKeys={PROJECT_JSON_ALLOWED_TOP_LEVEL_KEYS}
            validators={projectJsonValidators}
            onValidationChange={setJsonValidation}
            showValidationPanel
            showFormatButton
            autoGrow
            minHeight={260}
            maxHeight={isMobile ? 320 : 420}
            className={cn(isMobile && "text-base")}
            wrapperClassName="flex min-h-0 flex-1"
            surfaceName="matrx-user/projects"
            getApplicationScope={getJsonApplicationScope}
          />

          <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground sm:grid-cols-4">
            <div className="rounded-md border border-border bg-muted/30 px-3 py-2">
              <span className="font-semibold text-foreground">Parsed:</span>{" "}
              {jsonValidation?.isJson ? "yes" : "no"}
            </div>
            <div className="rounded-md border border-border bg-muted/30 px-3 py-2">
              <span className="font-semibold text-foreground">
                JSON errors:
              </span>{" "}
              {jsonValidation?.errors.length ?? 0}
            </div>
            <div className="rounded-md border border-border bg-muted/30 px-3 py-2">
              <span className="font-semibold text-foreground">Warnings:</span>{" "}
              {jsonValidation?.warnings.length ?? 0}
            </div>
            <div className="rounded-md border border-border bg-muted/30 px-3 py-2">
              <span className="font-semibold text-foreground">Contract:</span>{" "}
              {projectValidation?.valid ? "ready" : "pending"}
            </div>
          </div>

          {projectValidation?.valid && projectValidation.summary && (
            <div className="flex items-start gap-2 rounded-md border border-green-500/30 bg-green-500/5 px-3 py-2 text-xs">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600 dark:text-green-400" />
              <div className="text-foreground">
                <span className="font-medium">
                  {projectValidation.summary.name}
                </span>
                {" — "}
                {projectValidation.summary.taskCount} task(s),{" "}
                {projectValidation.summary.subtaskCount} subtask(s) ready to
                import
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      <div
        className={cn(
          "flex shrink-0 gap-3 border-t border-border pt-3",
          isMobile ? "flex-col" : "justify-end",
        )}
      >
        <Button
          type="button"
          variant="outline"
          onClick={handleValidate}
          disabled={isCreating || !raw.trim()}
          className={isMobile ? "min-h-[44px]" : undefined}
        >
          <FileCheck2 className="mr-2 h-4 w-4" />
          Validate
        </Button>
        <Button
          type="button"
          onClick={handleCreate}
          disabled={!canCreate}
          className={isMobile ? "min-h-[44px]" : undefined}
        >
          {isCreating ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Creating...
            </>
          ) : (
            <>
              <Upload className="mr-2 h-4 w-4" />
              Create
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
