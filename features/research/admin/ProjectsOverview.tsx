"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

import { MatrxDataTable } from "@ai-matrx/design-system/data-table";
import type { MatrxColumnDef } from "@ai-matrx/design-system/data-table/types";
import { MatrxUuidCell } from "@ai-matrx/design-system/data-table/uuid-cell";

import { Badge } from "@/components/ui/badge";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import {
  ADMIN_KNOWLEDGE_SURFACE_NAME,
  createAdminKnowledgeScope,
} from "@/features/surfaces/manifests/admin-knowledge.manifest";
import type { Json } from "@/types/database.types";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/use-toast";

import { getTopicProjectLinks } from "../service";
import type { ResearchTemplate } from "../types";
import { fetchResearchTopics, fetchTemplates } from "./service";
import { AGENT_CONFIG_KEYS } from "./types";

interface ResearchTopicRow {
  id: string;
  name: string;
  status: string;
  template_id: string | null;
  agent_config: Json | null;
  autonomy_level: string;
  created_at: string | null;
}

export interface ResearchProjectTableRow extends ResearchTopicRow {
  project_id: string | null;
  template_name: string | null;
  agent_override_count: number;
}

/** This endpoint intentionally returns the latest 50 topics, without a total. */
export const RESEARCH_PROJECTS_COVERAGE = {
  noun: "research topic",
  cap: 50,
  answeredBy: "client" as const,
};

export function researchProjectStatusColor(status: string): string {
  switch (status) {
    case "active":
      return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
    case "initialized":
      return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400";
    case "completed":
      return "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400";
    default:
      return "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300";
  }
}

export function researchProjectOverrideCount(config: Json | null): number {
  if (!config || typeof config !== "object" || Array.isArray(config)) return 0;
  const values = config as Record<string, Json>;
  return AGENT_CONFIG_KEYS.filter(
    (key) => values[key] && typeof values[key] === "string",
  ).length;
}

export function researchProjectCreatedAt(value: string | null): string {
  return value ? new Date(value).toLocaleDateString() : "Unknown";
}

export const RESEARCH_PROJECT_COLUMNS: MatrxColumnDef<ResearchProjectTableRow>[] =
  [
    {
      id: "topic",
      header: "Topic",
      accessorKey: "name",
      filter: "text",
      width: 260,
      cell: (row) => (
        <EntityRef token="research_topic" id={row.id} name={row.name} />
      ),
    },
    {
      id: "project",
      header: "Project",
      accessorKey: "project_id",
      filter: "text",
      width: 176,
      cell: (row) =>
        row.project_id ? (
          <MatrxUuidCell
            value={row.project_id}
            token="project"
            label="Project"
          />
        ) : (
          <span className="text-[10px] text-muted-foreground">No project</span>
        ),
    },
    {
      id: "status",
      header: "Status",
      accessorKey: "status",
      filter: "select",
      width: 112,
      cell: (row) => (
        <Badge
          variant="secondary"
          className={cn("text-[10px]", researchProjectStatusColor(row.status))}
        >
          {row.status}
        </Badge>
      ),
    },
    {
      id: "autonomy",
      header: "Autonomy",
      accessorKey: "autonomy_level",
      filter: "select",
      width: 112,
      cell: (row) => (
        <Badge variant="outline" className="text-[10px] capitalize">
          {row.autonomy_level}
        </Badge>
      ),
    },
    {
      id: "template",
      header: "Template",
      accessorFn: (row) => row.template_name ?? row.template_id ?? "",
      filter: "text",
      width: 220,
      cell: (row) =>
        row.template_name ? (
          <span className="block truncate text-xs" title={row.template_name}>
            {row.template_name}
          </span>
        ) : row.template_id ? (
          <MatrxUuidCell
            value={row.template_id}
            token="research_template"
            label="Template"
          />
        ) : (
          <span className="text-xs text-muted-foreground">None</span>
        ),
    },
    {
      id: "agent-overrides",
      header: "Agent overrides",
      accessorKey: "agent_override_count",
      filter: "number",
      width: 132,
      className: "text-center tabular-nums",
      cell: (row) =>
        row.agent_override_count > 0 ? (
          <Link
            href={`/research/topics/${row.id}/agents`}
            title={`Open the ${row.agent_override_count} agent override${row.agent_override_count === 1 ? "" : "s"} on this topic`}
          >
            <Badge
              variant="secondary"
              className="text-[10px] bg-yellow-100 text-yellow-700 hover:underline dark:bg-yellow-900/30 dark:text-yellow-400"
            >
              {row.agent_override_count} overrides
            </Badge>
          </Link>
        ) : (
          <span className="text-xs text-muted-foreground">None</span>
        ),
    },
    {
      id: "created",
      header: "Created",
      accessorKey: "created_at",
      filter: "date",
      width: 124,
      className: "tabular-nums",
      cell: (row) => (
        <span className="text-xs text-muted-foreground">
          {researchProjectCreatedAt(row.created_at)}
        </span>
      ),
    },
  ];

export function ProjectsOverview() {
  const [configs, setConfigs] = useState<ResearchTopicRow[]>([]);
  const [templates, setTemplates] = useState<ResearchTemplate[]>([]);
  const [projectLinks, setProjectLinks] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [configsData, templatesData] = await Promise.all([
        fetchResearchTopics(),
        fetchTemplates(),
      ]);
      setConfigs(configsData);
      setTemplates(templatesData);
      setProjectLinks(
        await getTopicProjectLinks(configsData.map((row) => row.id)),
      );
    } catch (error) {
      toast({
        title: "Error",
        description: (error as Error).message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void Promise.resolve().then(loadData);
  }, [loadData]);

  const rows: ResearchProjectTableRow[] = configs.map((config) => ({
    ...config,
    project_id: projectLinks[config.id] ?? null,
    template_name:
      templates.find((template) => template.id === config.template_id)?.name ??
      null,
    agent_override_count: researchProjectOverrideCount(config.agent_config),
  }));

  return (
    <SurfaceRuntimeProvider
      surfaceName={ADMIN_KNOWLEDGE_SURFACE_NAME}
      getScope={() =>
        createAdminKnowledgeScope({
          knowledge_section: "research_system",
          research_admin_tab: "projects",
          research_templates: templates,
          research_topics: rows,
        })
      }
    >
      <div className="h-full">
        <MatrxDataTable<ResearchProjectTableRow>
          tableId="research/admin/projects"
          urlState={{ id: "research-admin-projects" }}
          data={rows}
          columns={RESEARCH_PROJECT_COLUMNS}
          getRowId={(row) => row.id}
          isLoading={loading}
          toolbar={{
            title: "Active Research Projects",
            refresh: { onRefresh: () => void loadData() },
          }}
          copy={false}
          detail={{ enabled: false }}
          window={{ enabled: false }}
          coverage={RESEARCH_PROJECTS_COVERAGE}
          emptyState={{ title: "No research projects found." }}
        />
      </div>
    </SurfaceRuntimeProvider>
  );
}
