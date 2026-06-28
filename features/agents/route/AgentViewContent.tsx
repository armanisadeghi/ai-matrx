"use client";

import { useState, useEffect } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  selectAgentById,
  selectAgentDefinition,
  selectAgentMessages,
  selectAgentVariableDefinitions,
  selectAgentSettings,
  selectAgentTools,
  selectAgentCustomTools,
  selectAgentContextSlots,
  selectAgentModelId,
  selectAgentVersion,
  selectAgentTags,
  selectAgentCategory,
  selectAgentMcpServers,
  selectAgentOutputSchema,
  selectAgentChangeNote,
} from "@/features/agents/redux/agent-definition/selectors";
import { fetchAgentVersionHistory } from "@/features/agents/redux/agent-definition/thunks";
import { selectCategoryById } from "@/features/agents/redux/agent-shortcut-categories/selectors";
import { selectIsSuperAdmin } from "@/lib/redux/slices/userSlice";
import {
  selectModelLabelById,
  fetchModelOptions,
} from "@/features/ai-models/redux/modelRegistrySlice";
import { isUuid } from "@/features/scope-system/utils/slugify";
import { supabase } from "@/utils/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Webhook,
  MessageSquare,
  Wrench,
  Variable,
  Layers,
  Settings,
  Tag,
  Copy,
  Check,
  Eye,
  Braces,
  Server,
  FileJson,
  Lock,
  Globe,
  Archive,
  Folder,
  AlignLeft,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { AgentDefinitionMessage } from "@/features/agents/types/agent-message-types";
import { RichDocument } from "@/features/rich-document/RichDocument";
import type { ContentSource } from "@/features/rich-document/types";
import { JsonInspector } from "@/components/official-candidate/json-inspector/JsonInspector";
import { SystemAgentCopyForAiMenu } from "@/features/agents/route/SystemAgentCopyForAiMenu";

function extractTextContent(msg: AgentDefinitionMessage): string {
  if (!msg.content || !Array.isArray(msg.content)) return "";
  return msg.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { type: "text"; text: string }).text)
    .join("\n");
}

function RoleBadge({ role }: { role: string }) {
  const colors: Record<string, string> = {
    system:
      "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
    user: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30",
    assistant:
      "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded-md text-[0.6875rem] font-semibold border capitalize",
        colors[role] ?? "bg-muted text-muted-foreground border-border",
      )}
    >
      {role}
    </span>
  );
}

function CopyableIdRow({
  label,
  value,
  copyKey,
  copied,
  onCopy,
}: {
  label: string;
  value: string;
  copyKey: string;
  copied: string | null;
  onCopy: (key: string, text: string, message: string) => void;
}) {
  return (
    <div className="inline-flex items-center gap-1.5 text-xs min-w-0">
      <span className="text-muted-foreground shrink-0">{label}:</span>
      <button
        type="button"
        onClick={() => onCopy(copyKey, value, `${label} copied`)}
        className="group inline-flex items-center gap-1 font-mono text-foreground/90 hover:text-foreground transition-colors min-w-0"
        title={`Copy ${label}`}
      >
        <span className="truncate">{value}</span>
        {copied === copyKey ? (
          <Check className="w-3 h-3 text-emerald-500 shrink-0" />
        ) : (
          <Copy className="w-3 h-3 opacity-60 group-hover:opacity-100 shrink-0" />
        )}
      </button>
    </div>
  );
}

function StatChip({
  icon: Icon,
  label,
  count,
  accent,
}: {
  icon: LucideIcon;
  label: string;
  count: number;
  accent: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-1.5 text-xs",
        count === 0 && "opacity-40",
      )}
    >
      <Icon className={cn("w-3.5 h-3.5", accent)} />
      <span className="tabular-nums font-medium">{count}</span>
      <span className="text-muted-foreground">{label}</span>
    </div>
  );
}

type ViewMode = "pretty" | "json";
type MsgRenderMode = "md" | "plain";

function MessageCard({ role, content }: { role?: string; content: string }) {
  const [mode, setMode] = useState<MsgRenderMode>("md");
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        {role && <RoleBadge role={role} />}
        <ToggleGroup
          type="single"
          value={mode}
          onValueChange={(v) => v && setMode(v as MsgRenderMode)}
          size="sm"
          variant="outline"
          className="ml-auto"
        >
          <ToggleGroupItem
            value="md"
            className="h-5 px-1.5 text-[0.625rem] gap-0.5"
            aria-label="Rendered markdown"
          >
            <Eye className="w-3 h-3" /> MD
          </ToggleGroupItem>
          <ToggleGroupItem
            value="plain"
            className="h-5 px-1.5 text-[0.625rem] gap-0.5"
            aria-label="Plain text"
          >
            <AlignLeft className="w-3 h-3" /> Text
          </ToggleGroupItem>
        </ToggleGroup>
      </div>
      {mode === "md" ? (
        <RichDocument
          content={content || "—"}
          source={{ type: "raw" } as ContentSource}
          isStreamActive={false}
          actionsVariant="icon-only"
          actionsPosition="top-right"
          actionsBehavior="hover-only"
          actions={{ exclude: ["announcements", "preferences"] }}
        />
      ) : (
        <pre className="text-sm font-mono whitespace-pre-wrap break-words p-3 rounded-md bg-muted/30 border border-border/40 leading-relaxed">
          {content || "—"}
        </pre>
      )}
    </div>
  );
}

export function AgentViewContent({ agentId }: { agentId: string }) {
  const dispatch = useAppDispatch();
  const [mounted, setMounted] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("pretty");
  const [copied, setCopied] = useState<string | null>(null);
  const [currentVersionId, setCurrentVersionId] = useState<string | null>(null);
  const [categoryLabel, setCategoryLabel] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
    dispatch(fetchModelOptions());
  }, [dispatch]);

  const agent = useAppSelector((state) => selectAgentById(state, agentId));
  const category = useAppSelector((state) =>
    selectAgentCategory(state, agentId),
  );
  const categoryRecord = useAppSelector((state) =>
    category && isUuid(category)
      ? selectCategoryById(state, category)
      : undefined,
  );

  const liveAgentId = agent
    ? agent.isVersion
      ? (agent.parentAgentId ?? agentId)
      : agent.id
    : agentId;

  useEffect(() => {
    if (!agent) {
      setCurrentVersionId(null);
      return;
    }

    if (agent.isVersion) {
      setCurrentVersionId(agent.id);
      return;
    }

    if (agent.version == null) {
      setCurrentVersionId(null);
      return;
    }

    let cancelled = false;
    dispatch(fetchAgentVersionHistory({ agentId: liveAgentId, limit: 100 }))
      .unwrap()
      .then((items) => {
        if (cancelled) return;
        const current = items.find(
          (item) => item.version_number === agent.version,
        );
        setCurrentVersionId(current?.version_id ?? null);
      })
      .catch(() => {
        if (!cancelled) setCurrentVersionId(null);
      });

    return () => {
      cancelled = true;
    };
  }, [agent, dispatch, liveAgentId]);

  useEffect(() => {
    if (!category) {
      setCategoryLabel(null);
      return;
    }

    if (!isUuid(category)) {
      setCategoryLabel(category);
      return;
    }

    if (categoryRecord?.label) {
      setCategoryLabel(categoryRecord.label);
      return;
    }

    let cancelled = false;
    supabase
      .schema("platform")
      .from("categories")
      .select("label:name")
      .eq("dimension", "shortcut")
      .eq("id", category)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !data?.label) {
          setCategoryLabel(category);
          return;
        }
        setCategoryLabel(data.label);
      });

    return () => {
      cancelled = true;
    };
  }, [category, categoryRecord?.label]);

  const definition = useAppSelector((state) =>
    selectAgentDefinition(state, agentId),
  );
  const messages = useAppSelector((state) =>
    selectAgentMessages(state, agentId),
  );
  const variables = useAppSelector((state) =>
    selectAgentVariableDefinitions(state, agentId),
  );
  const settings = useAppSelector((state) =>
    selectAgentSettings(state, agentId),
  );
  const tools = useAppSelector((state) => selectAgentTools(state, agentId));
  const customTools = useAppSelector((state) =>
    selectAgentCustomTools(state, agentId),
  );
  const contextSlots = useAppSelector((state) =>
    selectAgentContextSlots(state, agentId),
  );
  const modelId = useAppSelector((state) => selectAgentModelId(state, agentId));
  const modelLabel = useAppSelector((state) =>
    selectModelLabelById(state, modelId ?? null),
  );
  const version = useAppSelector((state) => selectAgentVersion(state, agentId));
  const tags = useAppSelector((state) => selectAgentTags(state, agentId));
  const mcpServers = useAppSelector((state) =>
    selectAgentMcpServers(state, agentId),
  );
  const outputSchema = useAppSelector((state) =>
    selectAgentOutputSchema(state, agentId),
  );
  const changeNote = useAppSelector((state) =>
    selectAgentChangeNote(state, agentId),
  );
  const isAdmin = useAppSelector(selectIsSuperAdmin);

  const handleCopy = async (key: string, text: string, message: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      toast.success(message);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      toast.error("Copy failed");
    }
  };

  if (!mounted || !agent) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        Loading agent data...
      </div>
    );
  }

  const systemMessage = messages?.find((m) => m.role === "system");
  const conversationMessages =
    messages?.filter((m) => m.role !== "system") ?? [];
  const settingsEntries = settings
    ? Object.entries(settings).filter(([, v]) => v != null)
    : [];
  const totalTools = (tools?.length ?? 0) + (customTools?.length ?? 0);
  const variableCount = variables?.length ?? 0;
  const contextSlotCount = contextSlots?.length ?? 0;
  const settingsCount = settingsEntries.length;
  const mcpCount = mcpServers?.length ?? 0;
  const definitionJson = JSON.stringify(definition ?? {}, null, 2);

  const allowJsonView = isAdmin;
  const effectiveView: ViewMode = allowJsonView ? viewMode : "pretty";

  return (
    <div
      className="h-full overflow-y-auto"
      style={{ paddingTop: "var(--shell-header-h)" }}
    >
      <div className="max-w-5xl mx-auto px-4 pb-6 space-y-5">
        {/* Sticky toolbar */}
        <div className="sticky top-0 -mx-4 px-4 py-2 bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70 border-b border-border/50 z-10 flex items-center justify-between gap-2">
          <div className="text-xs text-muted-foreground truncate">
            {effectiveView === "pretty" ? "Overview" : "Raw definition (JSON)"}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <Button
              size="sm"
              variant="ghost"
              className="h-7 gap-1.5 text-xs"
              onClick={() =>
                handleCopy(
                  "definition",
                  definitionJson,
                  "Agent definition copied as JSON",
                )
              }
            >
              {copied === "definition" ? (
                <Check className="w-3.5 h-3.5 text-emerald-500" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
              Copy JSON
            </Button>
            <SystemAgentCopyForAiMenu
              agentId={agentId}
              liveAgentId={liveAgentId}
              currentVersionId={currentVersionId}
            />
            {allowJsonView && (
              <ToggleGroup
                type="single"
                value={viewMode}
                onValueChange={(v) => v && setViewMode(v as ViewMode)}
                size="sm"
                variant="outline"
              >
                <ToggleGroupItem
                  value="pretty"
                  className="h-7 px-2 text-xs gap-1"
                  aria-label="Pretty view"
                >
                  <Eye className="w-3.5 h-3.5" /> Pretty
                </ToggleGroupItem>
                <ToggleGroupItem
                  value="json"
                  className="h-7 px-2 text-xs gap-1"
                  aria-label="JSON view"
                >
                  <Braces className="w-3.5 h-3.5" /> JSON
                </ToggleGroupItem>
              </ToggleGroup>
            )}
          </div>
        </div>

        {effectiveView === "json" ? (
          <div className="h-[calc(100dvh-12rem)]">
            <JsonInspector
              data={definition ?? {}}
              label="Agent Definition"
              className="h-full"
            />
          </div>
        ) : (
          <>
            {/* Hero — name, id (version), description */}
            <div className="space-y-2 pt-1">
              <h1 className="text-2xl font-bold tracking-tight leading-tight">
                {agent.name}
              </h1>
              <div className="inline-flex items-center gap-1.5 text-xs min-w-0">
                <span className="text-muted-foreground shrink-0">
                  Agent ID:
                </span>
                <button
                  type="button"
                  onClick={() =>
                    handleCopy("agent-id", liveAgentId, "Agent ID copied")
                  }
                  className="group inline-flex items-center gap-1 font-mono text-foreground/90 hover:text-foreground transition-colors min-w-0"
                  title="Copy agent ID"
                >
                  <span className="truncate">{liveAgentId}</span>
                  {version != null && (
                    <span className="text-muted-foreground/70 shrink-0">
                      · v{version}
                    </span>
                  )}
                  {copied === "agent-id" ? (
                    <Check className="w-3 h-3 text-emerald-500 shrink-0" />
                  ) : (
                    <Copy className="w-3 h-3 opacity-60 group-hover:opacity-100 shrink-0" />
                  )}
                </button>
              </div>
              {agent.description && (
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {agent.description}
                </p>
              )}
              {agent.isVersion && changeNote && (
                <p className="text-xs italic text-muted-foreground/80 border-l-2 border-muted-foreground/30 pl-2">
                  {changeNote}
                </p>
              )}

              {/* Version + category metadata */}
              <div className="flex flex-col gap-1.5 pt-1">
                {currentVersionId && (
                  <CopyableIdRow
                    label="Current Version ID"
                    value={currentVersionId}
                    copyKey="version-id"
                    copied={copied}
                    onCopy={handleCopy}
                  />
                )}
                {(categoryLabel || category) && (
                  <div className="inline-flex items-center gap-1.5 text-xs flex-wrap">
                    <Folder className="w-3 h-3 text-muted-foreground shrink-0" />
                    <span className="text-muted-foreground">Category:</span>
                    <span className="font-medium text-foreground">
                      {categoryLabel ?? category}
                    </span>
                    {!agent.isVersion && agent.isPublic && (
                      <Badge
                        variant="outline"
                        className="gap-1 text-emerald-600 dark:text-emerald-400 border-emerald-500/40"
                      >
                        <Globe className="w-3 h-3" /> Public
                      </Badge>
                    )}
                    {!agent.isVersion && !agent.isPublic && (
                      <Badge
                        variant="outline"
                        className="gap-1 text-muted-foreground"
                      >
                        <Lock className="w-3 h-3" /> Private
                      </Badge>
                    )}
                  </div>
                )}
              </div>

              {/* Status pills */}
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                {modelId && (
                  <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-muted/50 border border-border/60 text-xs">
                    <Webhook className="w-3 h-3 shrink-0 text-muted-foreground" />
                    <span className="text-muted-foreground">Model:</span>
                    <span className="font-medium text-foreground">
                      {modelLabel ?? modelId}
                    </span>
                  </span>
                )}
                {!categoryLabel &&
                  !category &&
                  !agent.isVersion &&
                  agent.isPublic && (
                    <Badge
                      variant="outline"
                      className="gap-1 text-emerald-600 dark:text-emerald-400 border-emerald-500/40"
                    >
                      <Globe className="w-3 h-3" /> Public
                    </Badge>
                  )}
                {!categoryLabel &&
                  !category &&
                  !agent.isVersion &&
                  !agent.isPublic && (
                    <Badge
                      variant="outline"
                      className="gap-1 text-muted-foreground"
                    >
                      <Lock className="w-3 h-3" /> Private
                    </Badge>
                  )}
                {agent.isArchived && (
                  <Badge
                    variant="outline"
                    className="gap-1 text-amber-600 dark:text-amber-400 border-amber-500/40"
                  >
                    <Archive className="w-3 h-3" /> Archived
                  </Badge>
                )}
                {!agent.isActive && (
                  <Badge variant="destructive">Inactive</Badge>
                )}
              </div>

              {tags && tags.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <Tag className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  {tags.map((t) => (
                    <Badge key={t} variant="secondary" className="text-xs">
                      {t}
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            {/* Stat strip */}
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 px-3 py-2 rounded-md bg-muted/30 border border-border/50">
              <StatChip
                icon={Settings}
                label="settings"
                count={settingsCount}
                accent="text-muted-foreground"
              />
              <StatChip
                icon={Variable}
                label="variables"
                count={variableCount}
                accent="text-purple-500"
              />
              <StatChip
                icon={Layers}
                label="context slots"
                count={contextSlotCount}
                accent="text-cyan-500"
              />
              <StatChip
                icon={Wrench}
                label="tools"
                count={totalTools}
                accent="text-orange-500"
              />
              {mcpCount > 0 && (
                <StatChip
                  icon={Server}
                  label="MCP servers"
                  count={mcpCount}
                  accent="text-blue-500"
                />
              )}
              <StatChip
                icon={MessageSquare}
                label="messages"
                count={conversationMessages.length}
                accent="text-primary"
              />
            </div>

            <Separator />

            {/* Settings — first per ordering request */}
            {settingsCount > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Settings className="w-4 h-4 text-muted-foreground" />
                    Model Settings
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {settingsEntries.map(([key, value]) => (
                      <div key={key} className="space-y-0.5">
                        <div className="text-[0.625rem] uppercase tracking-wider text-muted-foreground font-medium">
                          {key.replace(/([A-Z])/g, " $1").trim()}
                        </div>
                        <div className="text-sm font-mono break-all">
                          {String(value)}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Variables */}
            {variables && variableCount > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Variable className="w-4 h-4 text-purple-500" />
                    Variables ({variableCount})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-2">
                    {variables.map((v) => (
                      <div
                        key={v.name}
                        className="flex items-start gap-3 p-2.5 rounded-lg bg-muted/30"
                      >
                        <code className="text-xs font-semibold text-primary bg-primary/10 px-1.5 py-0.5 rounded shrink-0">
                          {`{{${v.name}}}`}
                        </code>
                        <div className="flex-1 min-w-0 text-sm space-y-0.5">
                          {v.helpText && (
                            <div className="text-foreground/90">
                              {v.helpText}
                            </div>
                          )}
                          {v.defaultValue != null &&
                            String(v.defaultValue) !== "" && (
                              <div className="text-muted-foreground text-xs">
                                Default:{" "}
                                <span className="font-mono">
                                  {String(v.defaultValue)}
                                </span>
                              </div>
                            )}
                        </div>
                        {v.required && (
                          <Badge
                            variant="outline"
                            className="text-[0.625rem] shrink-0"
                          >
                            required
                          </Badge>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Context Slots */}
            {contextSlots && contextSlotCount > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Layers className="w-4 h-4 text-cyan-500" />
                    Context Slots ({contextSlotCount})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-2">
                    {contextSlots.map((slot, i) => (
                      <div
                        key={i}
                        className="flex items-start gap-3 p-2.5 rounded-lg bg-muted/30"
                      >
                        <code className="text-xs font-semibold text-cyan-600 dark:text-cyan-400 shrink-0">
                          {slot.key}
                        </code>
                        <div className="flex-1 min-w-0 text-sm space-y-0.5">
                          {slot.label && (
                            <div className="text-foreground/90">
                              {slot.label}
                            </div>
                          )}
                          {slot.description && (
                            <div className="text-muted-foreground/80 text-xs">
                              {slot.description}
                            </div>
                          )}
                        </div>
                        <Badge
                          variant="outline"
                          className="text-[0.625rem] shrink-0"
                        >
                          {slot.type}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Tools */}
            {totalTools > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Wrench className="w-4 h-4 text-orange-500" />
                    Tools ({totalTools})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {tools?.map((t) => (
                      <Badge
                        key={t}
                        variant="secondary"
                        className="font-mono text-xs"
                      >
                        {t}
                      </Badge>
                    ))}
                    {customTools?.map((t) => (
                      <Badge
                        key={t.name}
                        variant="outline"
                        className="font-mono text-xs gap-1"
                      >
                        {t.name}
                        <span className="text-muted-foreground">(custom)</span>
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* MCP Servers */}
            {mcpServers && mcpCount > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Server className="w-4 h-4 text-blue-500" />
                    MCP Servers ({mcpCount})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {mcpServers.map((id) => (
                      <Badge
                        key={id}
                        variant="secondary"
                        className="font-mono text-xs"
                      >
                        {id}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Output Schema */}
            {outputSchema && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <FileJson className="w-4 h-4 text-pink-500" />
                    Output Schema
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0 pb-0">
                  <div className="h-64">
                    <JsonInspector
                      data={outputSchema}
                      className="h-full rounded-t-none"
                    />
                  </div>
                </CardContent>
              </Card>
            )}

            <Separator />

            {/* System prompt */}
            {systemMessage && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <MessageSquare className="w-4 h-4 text-amber-500" />
                    System Instructions
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <MessageCard content={extractTextContent(systemMessage)} />
                </CardContent>
              </Card>
            )}

            {/* Conversation messages */}
            {conversationMessages.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <MessageSquare className="w-4 h-4 text-primary" />
                    Messages ({conversationMessages.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {conversationMessages.map((msg, i) => (
                    <MessageCard
                      key={i}
                      role={msg.role}
                      content={extractTextContent(msg)}
                    />
                  ))}
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
}
