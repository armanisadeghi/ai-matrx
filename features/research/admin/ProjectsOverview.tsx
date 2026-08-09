"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";
import MatrxMiniLoader from "@/components/loaders/MatrxMiniLoader";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { MatrxUuidCell } from "@/components/official/matrx-data-table/MatrxUuidCell";
import type { Json } from "@/types/database.types";
import type { ResearchTemplate } from "../types";
import { AGENT_CONFIG_KEYS } from "./types";
import { fetchResearchTopics, fetchTemplates } from "./service";
import { getTopicProjectLinks } from "../service";

interface ResearchTopicRow {
  id: string;
  name: string;
  status: string;
  template_id: string | null;
  agent_config: Json | null;
  autonomy_level: string;
  created_at: string | null;
}

export function ProjectsOverview() {
  const [configs, setConfigs] = useState<ResearchTopicRow[]>([]);
  const [templates, setTemplates] = useState<ResearchTemplate[]>([]);
  // topicId → projectId from the canonical association edges (research-project
  // decoupling) — `rs_topic.project_id` is dead.
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
        await getTopicProjectLinks(configsData.map((c) => c.id)),
      );
    } catch (err) {
      toast({
        title: "Error",
        description: (err as Error).message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  /** The template's NAME when we can resolve it, else null — the caller then
   *  renders the raw id as an openable/copyable cell rather than a stub. */
  const getTemplateName = (templateId: string | null) =>
    templateId
      ? (templates.find((t) => t.id === templateId)?.name ?? null)
      : null;

  const getAgentOverrideCount = (config: Json | null) => {
    if (!config || typeof config !== "object" || Array.isArray(config))
      return 0;
    const obj = config as Record<string, Json>;
    return AGENT_CONFIG_KEYS.filter((k) => obj[k] && typeof obj[k] === "string")
      .length;
  };

  const getStatusColor = (status: string) => {
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
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <MatrxMiniLoader />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card/50">
        <div>
          <h2 className="text-sm font-semibold">Active Research Projects</h2>
          <p className="text-xs text-muted-foreground">
            {configs.length} topic(s) found (last 50)
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={loadData}
          className="gap-1.5"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Topic</TableHead>
              <TableHead className="w-44">Project</TableHead>
              <TableHead className="w-28">Status</TableHead>
              <TableHead className="w-24">Autonomy</TableHead>
              <TableHead>Template</TableHead>
              <TableHead className="w-28 text-center">
                Agent Overrides
              </TableHead>
              <TableHead className="w-36">Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {configs.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="text-center text-muted-foreground py-12"
                >
                  No research projects found.
                </TableCell>
              </TableRow>
            )}
            {configs.map((config) => {
              // Association-backed: absent edge = projectless topic (valid).
              const linkedProjectId = projectLinks[config.id] ?? null;
              const templateName = getTemplateName(config.template_id);
              const overrideCount = getAgentOverrideCount(config.agent_config);
              return (
              <TableRow key={config.id} className="group">
                {/* The topic's own name was fetched on every row and never
                    rendered — the console listed research topics without ever
                    naming one. It is the row's primary identity, so it leads. */}
                <TableCell>
                  <EntityRef
                    token="research_topic"
                    id={config.id}
                    name={config.name}
                  />
                </TableCell>
                <TableCell>
                  {linkedProjectId ? (
                    <MatrxUuidCell
                      value={linkedProjectId}
                      token="project"
                      label="Project"
                    />
                  ) : (
                    <span className="text-[10px] text-muted-foreground">
                      No project
                    </span>
                  )}
                </TableCell>
                <TableCell>
                  <Badge
                    variant="secondary"
                    className={cn("text-[10px]", getStatusColor(config.status))}
                  >
                    {config.status}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="text-[10px] capitalize">
                    {config.autonomy_level}
                  </Badge>
                </TableCell>
                <TableCell>
                  {/* `research_template` has NO per-record route — but PASSING
                      THE TOKEN DOES NOT INVENT ONE: resolveEntityDoors returns
                      `hrefFor?.(id) ?? null`. What the token adds is the
                      registry PEEK (titleColumn "name" on research.rs_template,
                      which this file already reads from the browser). Omitting
                      it would throw away the only door the record has. */}
                  {templateName ? (
                    <span className="text-xs">{templateName}</span>
                  ) : config.template_id ? (
                    <MatrxUuidCell
                      value={config.template_id}
                      token="research_template"
                      label="Template"
                    />
                  ) : (
                    <span className="text-xs text-muted-foreground">None</span>
                  )}
                </TableCell>
                <TableCell className="text-center">
                  {/* A COUNT IS A DOOR. Every AGENT_CONFIG_KEY holds an AGENT
                      UUID (page_summary_agent_id, …) — the sibling
                      AgentWiringDashboard resolves those same values to agent
                      names — so N reachable records sit behind this badge.
                      `/research/topics/<id>/agents` is the page that lists
                      exactly them, which makes it the count's destination. */}
                  {overrideCount > 0 ? (
                    <Link
                      href={`/research/topics/${config.id}/agents`}
                      title={`Open the ${overrideCount} agent override${overrideCount === 1 ? "" : "s"} on this topic`}
                    >
                      <Badge
                        variant="secondary"
                        className="text-[10px] bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400 hover:underline"
                      >
                        {overrideCount} overrides
                      </Badge>
                    </Link>
                  ) : (
                    <span className="text-xs text-muted-foreground">None</span>
                  )}
                </TableCell>
                <TableCell>
                  <span className="text-xs text-muted-foreground">
                    {config.created_at
                      ? new Date(config.created_at).toLocaleDateString()
                      : "Unknown"}
                  </span>
                </TableCell>
              </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </ScrollArea>
    </div>
  );
}
