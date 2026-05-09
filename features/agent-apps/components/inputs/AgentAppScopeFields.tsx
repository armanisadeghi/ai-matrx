"use client";

/**
 * AgentAppScopeFields
 *
 * Org / Project / Task select dropdowns. Project list filters by selected
 * org; task list filters by selected project. Each select also exposes a
 * "Personal" / "Any" entry that clears the field (saves null).
 *
 * No raw UUID inputs.
 */

import { useEffect } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { fetchOrg } from "@/features/agent-context/redux/organizationsSlice";
import { selectAllOrgs } from "@/features/agent-context/redux/organizationsSlice";
import {
  fetchOrgProjects,
  selectAllProjects,
} from "@/features/agent-context/redux/projectsSlice";
import {
  fetchProjectTasks,
  selectAllTasks,
} from "@/features/agent-context/redux/tasksSlice";

interface AgentAppScopeFieldsProps {
  organizationId: string | null;
  projectId: string | null;
  taskId: string | null;
  onOrganizationChange: (next: string | null) => void;
  onProjectChange: (next: string | null) => void;
  onTaskChange: (next: string | null) => void;
  disabled?: boolean;
}

const NONE = "__none__";

export function AgentAppScopeFields({
  organizationId,
  projectId,
  taskId,
  onOrganizationChange,
  onProjectChange,
  onTaskChange,
  disabled,
}: AgentAppScopeFieldsProps) {
  const dispatch = useAppDispatch();
  const orgs = useAppSelector(selectAllOrgs);
  const allProjects = useAppSelector(selectAllProjects);
  const allTasks = useAppSelector(selectAllTasks);

  // Lazy-load orgs the first time this component mounts. fetchOrg fetches
  // a single org by id; the user's full org list comes from membership.
  // For now we trust whatever was hydrated by upstream slices; if nothing
  // is loaded we attempt to fetch the bound org so its name renders.
  useEffect(() => {
    if (organizationId) {
      const have = orgs.find((o) => o.id === organizationId);
      if (!have) dispatch(fetchOrg(organizationId));
    }
  }, [organizationId, orgs, dispatch]);

  useEffect(() => {
    if (organizationId) {
      dispatch(fetchOrgProjects(organizationId));
    }
  }, [organizationId, dispatch]);

  useEffect(() => {
    if (projectId && organizationId) {
      dispatch(fetchProjectTasks({ projectId, organizationId }));
    }
  }, [projectId, organizationId, dispatch]);

  const projects = organizationId
    ? allProjects.filter((p) => p.organization_id === organizationId)
    : [];

  const tasks = projectId
    ? allTasks.filter((t) => t.project_id === projectId)
    : [];

  return (
    <div className="space-y-3">
      <Row label="Organization">
        <Select
          value={organizationId ?? NONE}
          onValueChange={(v) => {
            const next = v === NONE ? null : v;
            onOrganizationChange(next);
            // Clearing the org clears the project + task too.
            if (!next) {
              onProjectChange(null);
              onTaskChange(null);
            }
          }}
          disabled={disabled}
        >
          <SelectTrigger className="h-8" size="sm">
            <SelectValue placeholder="Personal" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>Personal</SelectItem>
            {orgs.map((o) => (
              <SelectItem key={o.id} value={o.id}>
                {o.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Row>
      <Row label="Project">
        <Select
          value={projectId ?? NONE}
          onValueChange={(v) => {
            const next = v === NONE ? null : v;
            onProjectChange(next);
            if (!next) onTaskChange(null);
          }}
          disabled={disabled || !organizationId}
        >
          <SelectTrigger className="h-8" size="sm">
            <SelectValue
              placeholder={organizationId ? "Any" : "Pick an organization first"}
            />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>Any</SelectItem>
            {projects.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Row>
      <Row label="Task">
        <Select
          value={taskId ?? NONE}
          onValueChange={(v) => onTaskChange(v === NONE ? null : v)}
          disabled={disabled || !projectId}
        >
          <SelectTrigger className="h-8" size="sm">
            <SelectValue
              placeholder={projectId ? "Any" : "Pick a project first"}
            />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>Any</SelectItem>
            {tasks.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Row>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[120px_1fr] items-center gap-3">
      <span className="text-xs uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <div>{children}</div>
    </div>
  );
}
