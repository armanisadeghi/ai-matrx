"use client";

import { useState, useEffect, useCallback } from "react";
import { RefreshCw, ExternalLink } from "lucide-react";
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
import { AGENT_CONFIG_KEYS, AGENT_CONFIG_META } from "./types";
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
              <TableHead className="w-16" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {configs.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={8}
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
                  {/* `research_template` is a registered token with NO
                      per-record route, so an unresolved template id gets the
                      canonical uuid cell (full value + copy) rather than a
                      silently truncated string. Forcing an `hrefFor` here
                      would invent a page that does not exist. */}
                  {templateName ? (
                    <span className="text-xs">{templateName}</span>
                  ) : config.template_id ? (
                    <MatrxUuidCell
                      value={config.template_id}
                      label="Template"
                    />
                  ) : (
                    <span className="text-xs text-muted-foreground">None</span>
                  )}
                </TableCell>
                <TableCell className="text-center">
                  {getAgentOverrideCount(config.agent_config) > 0 ? (
                    <Badge
                      variant="secondary"
                      className="text-[10px] bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
                    >
                      {getAgentOverrideCount(config.agent_config)} overrides
                    </Badge>
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
                <TableCell>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6 rounded-full"
                    asChild
                  >
                    <a
                      href={`/research/topics/${config.id}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </Button>
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
