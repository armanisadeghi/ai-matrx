"use client";

/**
 * ProjectImportJsonPanel
 *
 * The chrome-less "paste a project JSON and create the whole tree" experience —
 * the third entry method alongside Manual and Use AI. The user pastes the same
 * payload the agent backend emits, hits **Validate** to see a structured report
 * (errors / warnings / a name + task/subtask rollup), then **Create** to write
 * the project + tasks + subtasks in one transaction via the
 * `create_project_from_json` RPC.
 *
 * Wrapped by `ProjectCreatePanel`; never forked per surface.
 */

import React, { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Info,
  Loader2,
  Sparkles,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useNavTree } from "@/features/agent-context/hooks/useNavTree";
import { useAppDispatch } from "@/lib/redux/hooks";
import { invalidateAndRefetchFullContext } from "@/features/agent-context/redux/hierarchyThunks";
import {
  createProjectFromJson,
  validateProjectJson,
  type ProjectJsonValidation,
} from "../importJson";
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
  const [validation, setValidation] = useState<ProjectJsonValidation | null>(
    null,
  );
  const [isCreating, setIsCreating] = useState(false);

  const resolveInitialOrg = (): OrgContext => {
    if (!initialOrgId) return null;
    if (initialOrgSlug)
      return { id: initialOrgId, name: "", slug: initialOrgSlug };
    return { id: initialOrgId, name: "", slug: "" };
  };
  const [selectedOrg, setSelectedOrg] = useState<OrgContext>(resolveInitialOrg);

  useEffect(() => {
    if (!initialOrgId || !orgs.length) return;
    const found = orgs.find((o) => o.id === initialOrgId);
    if (found)
      setSelectedOrg({ id: found.id, name: found.name, slug: found.slug });
  }, [orgs, initialOrgId]);

  // Re-validating on every keystroke is cheap (pure, local) but noisy; only
  // surface the report once the user has asked for it, then keep it live.
  const [hasValidated, setHasValidated] = useState(false);
  const liveValidation = useMemo(
    () => (hasValidated ? validateProjectJson(raw) : null),
    [raw, hasValidated],
  );
  const effective = liveValidation ?? validation;

  const handleValidate = () => {
    const result = validateProjectJson(raw);
    setValidation(result);
    setHasValidated(true);
    if (result.valid) {
      toast.success("Valid project JSON", {
        description: `${result.summary?.taskCount ?? 0} task(s), ${result.summary?.subtaskCount ?? 0} subtask(s) ready.`,
      });
    } else {
      toast.error(`${result.errors.length} issue(s) found`);
    }
  };

  const handleCreate = async () => {
    const result = effective ?? validateProjectJson(raw);
    setValidation(result);
    setHasValidated(true);
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

  const canCreate = !!effective?.valid && !isCreating;

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
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

      {/* JSON input */}
      <div className="flex min-h-0 flex-1 flex-col gap-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="project-json">Project JSON</Label>
          <span className="text-xs text-muted-foreground">
            Paste the agent payload
          </span>
        </div>
        <Textarea
          id="project-json"
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          placeholder={PLACEHOLDER}
          spellCheck={false}
          disabled={isCreating}
          className="min-h-[200px] flex-1 resize-none font-mono text-xs"
          style={isMobile ? { fontSize: "16px" } : undefined}
        />
      </div>

      {/* Validation report */}
      {effective && (
        <div className="space-y-2">
          {effective.valid && effective.summary && (
            <div className="flex items-start gap-2 rounded-md border border-green-500/30 bg-green-500/5 px-3 py-2 text-xs">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600 dark:text-green-400" />
              <div className="text-foreground">
                <span className="font-medium">{effective.summary.name}</span>
                {" — "}
                {effective.summary.taskCount} task(s),{" "}
                {effective.summary.subtaskCount} subtask(s)
              </div>
            </div>
          )}

          {effective.errors.length > 0 && (
            <ul className="space-y-1 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2">
              {effective.errors.map((err, i) => (
                <li
                  key={i}
                  className="flex items-start gap-2 text-xs text-destructive"
                >
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>{err}</span>
                </li>
              ))}
            </ul>
          )}

          {effective.warnings.length > 0 && (
            <ul className="space-y-1 rounded-md border border-border bg-muted px-3 py-2">
              {effective.warnings.map((warn, i) => (
                <li
                  key={i}
                  className="flex items-start gap-2 text-xs text-muted-foreground"
                >
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>{warn}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

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
          <Sparkles className="mr-2 h-4 w-4" />
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
