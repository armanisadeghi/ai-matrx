"use client";

import { useState, useEffect, useEffectEvent } from "react";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import {
  ADMIN_KNOWLEDGE_SURFACE_NAME,
  createAdminKnowledgeScope,
} from "@/features/surfaces/manifests/admin-knowledge.manifest";
import { Loader2, X } from "lucide-react";
import {
  ChevronLeftTapButton,
  ChevronRightTapButton,
  SquarePenTapButton,
  TrashTapButton,
} from "@ai-matrx/tap-target/buttons";
import { Button } from "@/components/ui/button";
import { ProInput } from "@/components/official/ProInput";
import { ProTextarea } from "@/components/official/ProTextarea";
import { Badge } from "@/components/ui/badge";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";
import { MatrxDataTable } from "@ai-matrx/design-system/data-table";
import type { MatrxColumnDef } from "@ai-matrx/design-system/data-table/types";
import { MatrxUuidCell } from "@ai-matrx/design-system/data-table/uuid-cell";
import type { Json } from "@/types/database.types";
import type { ResearchTemplate, AutonomyLevel } from "../types";
import type {
  PromptBuiltinRef,
  TemplateFormData,
  AgentConfigKey,
} from "./types";
import {
  AGENT_CONFIG_KEYS,
  AGENT_CONFIG_META,
  jsonToAgentConfigStrings,
} from "./types";
import {
  fetchTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  resolveBuiltinNames,
} from "./service";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectBuiltinAgents } from "@/features/agents/redux/agent-definition/selectors";
import { fetchAgentsListFull } from "@/features/agents/redux/agent-definition/thunks";
import { AgentListDropdown } from "@ai-matrx/agents/catalog/react";

const SYSTEM_AGENT_TAB = ["system"] as const;

function jsonToStringArray(value: Json | null | undefined): string[] {
  if (value == null) return [];
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function toAutonomyLevel(value: string): AutonomyLevel {
  if (value === "auto" || value === "semi" || value === "manual") return value;
  return "semi";
}

function agentConfigStringField(
  config: Json | null,
  key: string,
): string | undefined {
  if (config === null || typeof config !== "object" || Array.isArray(config))
    return undefined;
  const v = (config as Record<string, Json>)[key];
  return typeof v === "string" ? v : undefined;
}

const EMPTY_FORM: TemplateFormData = {
  name: "",
  description: "",
  keyword_templates: [],
  default_tags: [],
  agent_config: {},
  autonomy_level: "semi",
  metadata: {},
};

/** PostgREST bounds this receipt at 1,000; no exact source total is returned. */
export const RESEARCH_TEMPLATES_COVERAGE = {
  noun: "research template",
  cap: 1000,
  answeredBy: "client" as const,
};

export function researchTemplateWiringCount(
  template: ResearchTemplate,
): number {
  const raw = template.agent_config;
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return 0;
  const config = raw as Record<string, Json>;
  return AGENT_CONFIG_KEYS.filter((key) => {
    const value = config[key];
    return typeof value === "string" && value.length > 0;
  }).length;
}

export const RESEARCH_TEMPLATE_COLUMNS: MatrxColumnDef<ResearchTemplate>[] = [
  {
    id: "name",
    header: "Name",
    accessorKey: "name",
    filter: "text",
    width: 220,
    cell: (template) => (
      <EntityRef token="research_template" id={template.id} name={template.name} />
    ),
  },
  {
    id: "description",
    header: "Description",
    accessorFn: (template) => template.description ?? "",
    filter: "text",
    width: 280,
    cell: (template) => (
      <span
        className="block truncate text-xs text-muted-foreground"
        title={template.description ?? ""}
      >
        {template.description || "No description"}
      </span>
    ),
  },
  {
    id: "system",
    header: "System",
    accessorKey: "is_system",
    filter: "boolean",
    width: 92,
    cell: (template) => (
      <Badge
        variant={template.is_system ? "default" : "secondary"}
        className="text-[10px]"
      >
        {template.is_system ? "System" : "Custom"}
      </Badge>
    ),
  },
  {
    id: "autonomy",
    header: "Autonomy",
    accessorKey: "autonomy_level",
    filter: "select",
    filterOptions: [
      { value: "auto", label: "Automatic" },
      { value: "semi", label: "Semi-Auto" },
      { value: "manual", label: "Manual" },
    ],
    width: 112,
    cell: (template) => (
      <Badge variant="outline" className="text-[10px] capitalize">
        {template.autonomy_level}
      </Badge>
    ),
  },
  {
    id: "keywords",
    header: "Keywords",
    accessorFn: (template) =>
      jsonToStringArray(template.keyword_templates).length,
    filter: "number",
    width: 96,
    className: "text-center tabular-nums",
  },
  {
    id: "default-tags",
    header: "Default tags",
    accessorFn: (template) => jsonToStringArray(template.default_tags).length,
    filter: "number",
    width: 110,
    className: "text-center tabular-nums",
  },
  {
    id: "agent-wiring",
    header: "Agent wiring",
    accessorFn: researchTemplateWiringCount,
    filter: "number",
    width: 120,
    className: "text-center",
    cell: (template) => {
      const count = researchTemplateWiringCount(template);
      return (
        <Badge
          variant={count === AGENT_CONFIG_KEYS.length ? "default" : "secondary"}
          className={cn(
            "text-[10px] tabular-nums",
            count === AGENT_CONFIG_KEYS.length
              ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
              : count > 0
                ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
                : "",
          )}
        >
          {count}/{AGENT_CONFIG_KEYS.length}
        </Badge>
      );
    },
  },
  {
    id: "id",
    header: "ID",
    accessorKey: "id",
    filter: "text",
    width: 160,
    cell: (template) => (
      <MatrxUuidCell value={template.id} label="Template ID" />
    ),
  },
  {
    id: "keyword-templates",
    header: "Keyword templates",
    accessorFn: (template) =>
      jsonToStringArray(template.keyword_templates).join(" "),
    filter: "text",
    hidden: true,
  },
  {
    id: "default-tag-values",
    header: "Default tag values",
    accessorFn: (template) =>
      jsonToStringArray(template.default_tags).join(" "),
    filter: "text",
    hidden: true,
  },
  {
    id: "agent-config",
    header: "Agent configuration",
    accessorFn: (template) =>
      Object.values(jsonToAgentConfigStrings(template.agent_config)).join(" "),
    filter: "text",
    hidden: true,
  },
];

function TemplateConfiguration({
  template,
  builtinNames,
}: {
  template: ResearchTemplate;
  builtinNames: Record<string, string>;
}) {
  const keywords = jsonToStringArray(template.keyword_templates);
  const defaultTags = jsonToStringArray(template.default_tags);

  return (
    <div className="space-y-3">
      {keywords.length > 0 && (
        <div>
          <span className="text-[10px] font-semibold uppercase text-muted-foreground">
            Keywords
          </span>
          <div className="mt-1 flex flex-wrap gap-1">
            {keywords.map((keyword) => (
              <Badge key={keyword} variant="secondary" className="text-[10px]">
                {keyword}
              </Badge>
            ))}
          </div>
        </div>
      )}
      {defaultTags.length > 0 && (
        <div>
          <span className="text-[10px] font-semibold uppercase text-muted-foreground">
            Default tags
          </span>
          <div className="mt-1 flex flex-wrap gap-1">
            {defaultTags.map((tag) => (
              <Badge key={tag} variant="outline" className="text-[10px]">
                {tag}
              </Badge>
            ))}
          </div>
        </div>
      )}
      <div>
        <span className="text-[10px] font-semibold uppercase text-muted-foreground">
          Agent wiring
        </span>
        <div className="mt-1 grid grid-cols-1 gap-1">
          {AGENT_CONFIG_KEYS.map((key) => {
            const value = agentConfigStringField(template.agent_config, key);
            const resolvedName = value
              ? (builtinNames[value] ?? `${value.slice(0, 8)}...`)
              : "System default";
            return (
              <div
                key={key}
                className="flex min-w-0 items-center gap-2 text-[11px]"
              >
                <div
                  className={cn(
                    "h-2 w-2 shrink-0 rounded-full",
                    value ? "bg-green-500" : "bg-zinc-300 dark:bg-zinc-600",
                  )}
                />
                <span className="w-40 shrink-0 text-muted-foreground">
                  {AGENT_CONFIG_META[key].label}
                </span>
                <span
                  className={cn(
                    "min-w-0 truncate",
                    value ? "text-foreground" : "text-muted-foreground",
                  )}
                  title={
                    value ? (builtinNames[value] ?? value) : "System default"
                  }
                >
                  {resolvedName}
                </span>
              </div>
            );
          })}
        </div>
      </div>
      {template.metadata != null &&
        Object.keys(template.metadata).length > 0 && (
          <div>
            <span className="text-[10px] font-semibold uppercase text-muted-foreground">
              Metadata
            </span>
            <pre className="mt-1 overflow-x-auto rounded bg-muted/50 p-2 text-[10px]">
              {JSON.stringify(template.metadata, null, 2)}
            </pre>
          </div>
        )}
    </div>
  );
}

export function TemplateRowActions({
  template,
  onEdit,
  onDelete,
}: {
  template: ResearchTemplate;
  onEdit: (template: ResearchTemplate) => void;
  onDelete: (template: ResearchTemplate) => void;
}) {
  return (
    <>
      <SquarePenTapButton
        ariaLabel={`Edit ${template.name}`}
        tooltip={`Edit ${template.name}`}
        variant="transparent"
        onClick={() => onEdit(template)}
      />
      <TrashTapButton
        ariaLabel={`Delete ${template.name}`}
        tooltip={`Delete ${template.name}`}
        variant="transparent"
        iconColor="text-destructive"
        onClick={() => onDelete(template)}
      />
    </>
  );
}

export function TemplatesManager() {
  const dispatch = useAppDispatch();
  const [templates, setTemplates] = useState<ResearchTemplate[]>([]);
  // Canonical agent listing (THE CANONICAL-SELECTION LAW): builtins come from
  // the agent-definition slice, never a raw agent.definition query.
  const builtinAgents = useAppSelector(selectBuiltinAgents);
  const builtins: PromptBuiltinRef[] = builtinAgents
    .filter((agent) => agent.isActive && !agent.isArchived && !!agent.name)
    .map((agent) => ({
      id: agent.id,
      name: agent.name as string,
      is_active: true,
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
  useEffect(() => {
    dispatch(fetchAgentsListFull());
  }, [dispatch]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [builtinNames, setBuiltinNames] = useState<Record<string, string>>({});

  const [editingTemplate, setEditingTemplate] =
    useState<ResearchTemplate | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [formData, setFormData] = useState<TemplateFormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<ResearchTemplate | null>(
    null,
  );

  const [keywordInput, setKeywordInput] = useState("");
  const [tagInput, setTagInput] = useState("");

  const { toast } = useToast();

  const loadData = async () => {
    const retainsRows = templates.length > 0;
    try {
      if (retainsRows) setIsRefreshing(true);
      else setLoading(true);
      const templatesData = await fetchTemplates();
      const agentIds = templatesData
        .flatMap((template) =>
          Object.values(jsonToAgentConfigStrings(template.agent_config)),
        )
        .filter((value) => value.length > 0);
      const names =
        agentIds.length > 0
          ? await resolveBuiltinNames([...new Set(agentIds)])
          : {};
      setTemplates(templatesData);
      setBuiltinNames(names);
      setLoadError(null);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Could not load research templates.";
      setLoadError(message);
      toast({ title: "Error", description: message, variant: "destructive" });
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  const startLoad = useEffectEvent(() => {
    void loadData();
  });

  useEffect(() => {
    const timer = window.setTimeout(startLoad, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const openCreate = () => {
    setFormData(EMPTY_FORM);
    setKeywordInput("");
    setTagInput("");
    setIsCreateOpen(true);
  };

  const openEdit = (template: ResearchTemplate) => {
    const rawMeta = template.metadata;
    const metadataRecord =
      rawMeta !== null && typeof rawMeta === "object" && !Array.isArray(rawMeta)
        ? (rawMeta as Record<string, unknown>)
        : {};
    setFormData({
      name: template.name,
      description: template.description ?? "",
      keyword_templates: jsonToStringArray(template.keyword_templates),
      default_tags: jsonToStringArray(template.default_tags),
      agent_config: jsonToAgentConfigStrings(template.agent_config),
      autonomy_level: toAutonomyLevel(template.autonomy_level),
      metadata: metadataRecord,
    });
    setKeywordInput("");
    setTagInput("");
    setEditingTemplate(template);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast({
        title: "Validation",
        description: "Name is required",
        variant: "destructive",
      });
      return;
    }
    setSaving(true);
    try {
      if (editingTemplate) {
        await updateTemplate(editingTemplate.id, formData);
        toast({
          title: "Updated",
          description: `Template "${formData.name}" updated.`,
        });
        setEditingTemplate(null);
      } else {
        await createTemplate(formData);
        toast({
          title: "Created",
          description: `Template "${formData.name}" created.`,
        });
        setIsCreateOpen(false);
      }
      await loadData();
    } catch (err) {
      toast({
        title: "Error",
        description: (err as Error).message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteTemplate(deleteTarget.id);
      toast({
        title: "Deleted",
        description: `Template "${deleteTarget.name}" deleted.`,
      });
      setDeleteTarget(null);
      await loadData();
    } catch (err) {
      toast({
        title: "Error",
        description: (err as Error).message,
        variant: "destructive",
      });
    }
  };

  const addKeyword = () => {
    const kw = keywordInput.trim();
    if (kw && !formData.keyword_templates.includes(kw)) {
      setFormData((prev) => ({
        ...prev,
        keyword_templates: [...prev.keyword_templates, kw],
      }));
      setKeywordInput("");
    }
  };

  const removeKeyword = (kw: string) => {
    setFormData((prev) => ({
      ...prev,
      keyword_templates: prev.keyword_templates.filter((k) => k !== kw),
    }));
  };

  const addTag = () => {
    const tag = tagInput.trim();
    if (tag && !formData.default_tags.includes(tag)) {
      setFormData((prev) => ({
        ...prev,
        default_tags: [...prev.default_tags, tag],
      }));
      setTagInput("");
    }
  };

  const removeTag = (tag: string) => {
    setFormData((prev) => ({
      ...prev,
      default_tags: prev.default_tags.filter((t) => t !== tag),
    }));
  };

  const setAgentConfig = (key: AgentConfigKey, value: string) => {
    setFormData((prev) => ({
      ...prev,
      agent_config: { ...prev.agent_config, [key]: value },
    }));
  };

  const formContent = (
    <div className="space-y-5 max-h-[70dvh] overflow-y-auto pr-1">
      <div className="space-y-2">
        <label className="text-sm font-medium">Name *</label>
        <ProInput
          value={formData.name}
          onChange={(e) =>
            setFormData((prev) => ({ ...prev, name: e.target.value }))
          }
          placeholder="e.g., Company Research"
          className="text-base"
          wrapperClassName="w-full"
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Description</label>
        <ProTextarea
          value={formData.description}
          onChange={(e) =>
            setFormData((prev) => ({ ...prev, description: e.target.value }))
          }
          placeholder="What this template is for..."
          autoGrow
          minHeight={60}
          maxHeight={160}
          className="text-base"
          wrapperClassName="w-full"
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Autonomy Level</label>
        <Select
          value={formData.autonomy_level}
          onValueChange={(v: AutonomyLevel) =>
            setFormData((prev) => ({ ...prev, autonomy_level: v }))
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="auto">Automatic</SelectItem>
            <SelectItem value="semi">Semi-Auto</SelectItem>
            <SelectItem value="manual">Manual</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Keyword Templates</label>
        <div className="flex gap-2">
          <ProInput
            enableCleanup={false}
            value={keywordInput}
            onChange={(e) => setKeywordInput(e.target.value)}
            placeholder="Add keyword..."
            className="text-base flex-1"
            wrapperClassName="flex-1"
            onKeyDown={(e) =>
              e.key === "Enter" && (e.preventDefault(), addKeyword())
            }
          />
          <Button
            variant="outline"
            size="sm"
            onClick={addKeyword}
            disabled={!keywordInput.trim()}
          >
            Add
          </Button>
        </div>
        {formData.keyword_templates.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-1">
            {formData.keyword_templates.map((kw) => (
              <Badge key={kw} variant="secondary" className="gap-1 pr-1">
                {kw}
                <button
                  onClick={() => removeKeyword(kw)}
                  className="ml-0.5 hover:text-destructive"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Default Tags</label>
        <div className="flex gap-2">
          <ProInput
            enableCleanup={false}
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            placeholder="Add tag..."
            className="text-base flex-1"
            wrapperClassName="flex-1"
            onKeyDown={(e) =>
              e.key === "Enter" && (e.preventDefault(), addTag())
            }
          />
          <Button
            variant="outline"
            size="sm"
            onClick={addTag}
            disabled={!tagInput.trim()}
          >
            Add
          </Button>
        </div>
        {formData.default_tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-1">
            {formData.default_tags.map((tag) => (
              <Badge key={tag} variant="outline" className="gap-1 pr-1">
                {tag}
                <button
                  onClick={() => removeTag(tag)}
                  className="ml-0.5 hover:text-destructive"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-3">
        <label className="text-sm font-medium">Agent Configuration</label>
        <p className="text-xs text-muted-foreground">
          Select a prompt builtin for each agent role. Leave empty to use system
          defaults.
        </p>
        <div className="space-y-2">
          {AGENT_CONFIG_KEYS.map((key) => (
            <div key={key} className="flex items-center gap-3">
              <div className="w-48 shrink-0">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="text-xs font-medium cursor-help">
                        {AGENT_CONFIG_META[key].label}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="left" className="max-w-xs">
                      <p className="text-xs">
                        {AGENT_CONFIG_META[key].description}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {AGENT_CONFIG_META[key].usedBy}
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <div className="flex min-w-0 flex-1 items-center gap-1">
                <AgentListDropdown
                  consumerId={`research-template-agent-${key}`}
                  onSelect={(agentId) => setAgentConfig(key, agentId)}
                  activeAgentId={formData.agent_config[key] || null}
                  label={
                    builtins.find(
                      (agent) => agent.id === formData.agent_config[key],
                    )?.name ?? "System default"
                  }
                  initialTab="system"
                  visibleTabs={SYSTEM_AGENT_TAB}
                  systemTabLabel="System"
                  showPinnedAgent={Boolean(formData.agent_config[key])}
                  className="h-8 w-full justify-between text-xs"
                />
                {formData.agent_config[key] && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2 text-xs"
                    onClick={() => setAgentConfig(key, "")}
                  >
                    Default
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <SurfaceRuntimeProvider
      surfaceName={ADMIN_KNOWLEDGE_SURFACE_NAME}
      getScope={() =>
        createAdminKnowledgeScope({
          knowledge_section: "research_system",
          research_admin_tab: "templates",
          research_templates: templates,
          research_builtin_agents: builtins,
        })
      }
    >
      <div
        className="flex h-full min-h-0 flex-col"
        aria-busy={loading || isRefreshing}
      >
        {loadError && (
          <div
            role="alert"
            className="mb-2 flex shrink-0 items-center gap-2 text-sm text-red-600 dark:text-red-400"
          >
            Could not refresh research templates: {loadError}
            <button
              type="button"
              className="underline"
              onClick={() => void loadData()}
            >
              Retry
            </button>
          </div>
        )}
        <div className="min-h-0 flex-1">
          <MatrxDataTable<ResearchTemplate>
            tableId="research-admin-templates"
            urlState={{ id: "research-admin-templates" }}
            data={templates}
            columns={[
              {
                id: "configuration",
                header: "",
                accessorFn: (template) => template.id,
                sortable: false,
                filter: false,
                width: 44,
                cell: (template) =>
                  expandedIds.has(template.id) ? (
                    <ChevronLeftTapButton
                      ariaLabel={`Collapse ${template.name} configuration`}
                      tooltip={`Collapse ${template.name} configuration`}
                      variant="transparent"
                      onClick={() =>
                        setExpandedIds((previous) => {
                          const next = new Set(previous);
                          next.delete(template.id);
                          return next;
                        })
                      }
                    />
                  ) : (
                    <ChevronRightTapButton
                      ariaLabel={`Expand ${template.name} configuration`}
                      tooltip={`Expand ${template.name} configuration`}
                      variant="transparent"
                      onClick={() =>
                        setExpandedIds((previous) =>
                          new Set(previous).add(template.id),
                        )
                      }
                    />
                  ),
              },
              ...RESEARCH_TEMPLATE_COLUMNS,
            ]}
            getRowId={(template) => template.id}
            isLoading={loading}
            isFetching={isRefreshing}
            toolbar={{
              title: "Research Templates",
              searchPlaceholder: "Search templates…",
              intelligentSearch: {
                roles: { name: "name", description: "description" },
              },
              refresh: { onRefresh: loadData },
              add: { onAdd: openCreate },
            }}
            expandedDetail={{
              expandedIds,
              onExpandedIdsChange: setExpandedIds,
              render: (template) => (
                <TemplateConfiguration
                  template={template}
                  builtinNames={builtinNames}
                />
              ),
            }}
            copy={false}
            detail={{ enabled: false }}
            window={{ enabled: false }}
            coverage={RESEARCH_TEMPLATES_COVERAGE}
            emptyState={{
              title: loadError
                ? "Could not load research templates."
                : "No templates yet. Create one to get started.",
            }}
            rowActions={(template) => (
              <TemplateRowActions
                template={template}
                onEdit={openEdit}
                onDelete={setDeleteTarget}
              />
            )}
          />
        </div>

        {/* Create Dialog */}
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Create Template</DialogTitle>
              <DialogDescription>
                Configure a reusable research template with default keywords,
                tags, and agent wiring.
              </DialogDescription>
            </DialogHeader>
            {formContent}
            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                disabled={saving}
                className="gap-1.5"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                Create
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Edit Dialog */}
        <Dialog
          open={!!editingTemplate}
          onOpenChange={(open) => !open && setEditingTemplate(null)}
        >
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Edit Template</DialogTitle>
              <DialogDescription>
                Modify template configuration. Changes apply to new projects
                only.
              </DialogDescription>
            </DialogHeader>
            {formContent}
            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button
                variant="outline"
                onClick={() => setEditingTemplate(null)}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                disabled={saving}
                className="gap-1.5"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                Save Changes
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation */}
        <AlertDialog
          open={!!deleteTarget}
          onOpenChange={(open) => !open && setDeleteTarget(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Template</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete &ldquo;{deleteTarget?.name}
                &rdquo;? This cannot be undone. Existing projects using this
                template will not be affected.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </SurfaceRuntimeProvider>
  );
}
