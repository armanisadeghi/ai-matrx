"use client";

import { useState, useEffect, type ReactNode } from "react";
import { useAppDispatch, useAppSelector } from "../../store/hooks";
import {
  selectAgentById,
  selectAgentDefinition,
  selectAgentMessages,
  selectAgentVariableDefinitions,
  selectAgentSettings,
  selectAgentTools,
  selectAgentCustomTools,
  selectAgentContextPolicies,
  selectAgentVersion,
  selectAgentTags,
  selectAgentCategory,
  selectAgentMcpServers,
  selectAgentOutputSchema,
  selectAgentChangeNote,
} from "../redux/agent-definition/selectors";
import {
  fetchAgentVersionHistory,
  fetchFullAgent,
  resetAgentToSource,
} from "../redux/agent-definition/thunks";
import { confirm } from "@ai-matrx/chat/host/ui-slots";
import { ReadFailure } from "@host/components/read-state/ReadFailure";
import { selectCategoryById } from "../redux/agent-shortcut-categories/selectors";
import { fetchModelOptions } from "@host/features/ai-models/redux/modelRegistrySlice";
import { useAgentModelLabel } from "../hooks/useAgentModelLabel";
import { isUuidShape } from "@ai-matrx/kit/uuid";
import { supabase } from "../../host/db";
import { Badge } from "@ai-matrx/design-system";
import { Button } from "@ai-matrx/design-system";
import { Button as ControlButton } from "@ai-matrx/design-system/controls";
import { Card, CardContent, CardHeader, CardTitle } from "@host/components/ui/card";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@ai-matrx/design-system";
import { Separator } from "@ai-matrx/design-system";
import { ToggleGroup, ToggleGroupItem } from "@ai-matrx/design-system";
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
  Globe,
  Archive,
  Folder,
  AlignLeft,
  AlertTriangle,
  RefreshCw,
  type LucideIcon,
} from "lucide-react";
import { toast } from "../../host/notify";
import { cn } from "@ai-matrx/design-system";
import type { AgentDefinitionMessage } from "../types/agent-message-types";
import { RichDocument } from "@ai-matrx/chat/host/ui-slots";
import type { ContentSource } from "@host/features/rich-document/types";
import { JsonInspector } from "@host/components/official-candidate/json-inspector/JsonInspector";
import {
  AiModelRef,
  AiToolRef,
} from "@host/components/official/entity-ref/AiIdentityRef";
import { EntityRef } from "@host/components/official/entity-ref/EntityRef";
import { RichContent } from "@ai-matrx/chat/host/ui-slots";
import { AccessSummaryPanel } from "@host/features/sharing/components/AccessSummaryPanel";
import { CopyButtons } from "@ai-matrx/chat/host/ui-slots";
import { agentDefinitionSummary } from "../format";
import { agentHref } from "@host/features/agents/browse/agentPaths";
import { buildSystemAgentAiPayload } from "./buildSystemAgentAiPayload";
import { useAgentAddressViewer } from "../addressing/useAgentHref";
import { asClause } from "@ai-matrx/kit/text";
import { selectIsSuperAdmin } from "../../host/identity";
import { variableRunLabel } from "@ai-matrx/agents";

function extractTextContent(msg: AgentDefinitionMessage): string {
  if (!msg.content || !Array.isArray(msg.content)) return "";
  return msg.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { type: "text"; text: string }).text)
    .join("\n");
}

/**
 * One line for a copy made from another agent (templates7_b): while it follows, runs use the
 * source's current instructions, tools, model and settings; an edit to those stops it, and
 * "Reset to latest" (agx_reset_agent_to_source) puts the source's content back.
 */
function SourceFollowState({ agentId, follows }: { agentId: string; follows: boolean }) {
  const dispatch = useAppDispatch();
  const [resetting, setResetting] = useState(false);
  if (follows) {
    return (
      <div className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <RefreshCw className="w-3 h-3 shrink-0" />
        <span>Updates with the template</span>
      </div>
    );
  }
  const reset = async () => {
    const ok = await confirm({
      title: "Reset to latest",
      description:
        "Your changes to instructions, tools and model are replaced with the template's. Your tables stay connected.",
      confirmLabel: "Reset",
      variant: "destructive",
    });
    if (!ok) return;
    setResetting(true);
    try {
      await dispatch(resetAgentToSource(agentId)).unwrap();
      toast.success("Reset to the latest template");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Reset failed");
    } finally {
      setResetting(false);
    }
  };
  return (
    <div className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <span>Customized — no longer updates</span>
      <ControlButton variant="quiet" onClick={reset} disabled={resetting}>
        Reset to latest
      </ControlButton>
    </div>
  );
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
        <RichDocument imagePolicy="other"
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

/**
 * `recordSections`: what the HOST adds to this agent's record view — the organization's custom
 * fields (lane 7 W5: `<EntityCustomFields entityToken="agent" …>` from the route). The package
 * renders it after the stat strip and never knows what it is.
 */
export function AgentViewContent({ agentId, recordSections }: { agentId: string; recordSections?: ReactNode }) {
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
  // A builtin's own page is reached by members too; its ID link must not
  // send them into the admin tree.
  const addressViewer = useAgentAddressViewer();
  const category = useAppSelector((state) =>
    selectAgentCategory(state, agentId),
  );
  const categoryRecord = useAppSelector((state) =>
    category && isUuidShape(category)
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
      return undefined;
    }

    if (agent.isVersion) {
      setCurrentVersionId(agent.id);
      return undefined;
    }

    if (agent.version == null) {
      setCurrentVersionId(null);
      return undefined;
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
      return undefined;
    }

    if (!isUuidShape(category)) {
      setCategoryLabel(category);
      return undefined;
    }

    if (categoryRecord?.label) {
      setCategoryLabel(categoryRecord.label);
      return undefined;
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
  const contextPolicies = useAppSelector((state) =>
    selectAgentContextPolicies(state, agentId),
  );
  // The model it uses, named with its class when the model has several.
  const { modelId, label: modelLabel } = useAgentModelLabel(agentId);
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
  const dataIssues = agent?.dataIssues ?? [];

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

  // The counts below are this record's fields; when the read that fills them
  // failed they are not an answer ("0 messages"), so say the failure instead.
  if (agent._error && !agent._loadedFields.messages) {
    return (
      <ReadFailure
        error={agent._error}
        what="this agent"
        onRetry={() => void dispatch(fetchFullAgent(agentId))}
      />
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
  const contextPolicyCount = contextPolicies?.length ?? 0;
  const settingsCount = settingsEntries.length;
  const mcpCount = mcpServers?.length ?? 0;

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
            <CopyButtons
              size="sm"
              label={`${agent.name} definition`}
              human={() =>
                agentDefinitionSummary(definition ?? agent, {
                  liveAgentId,
                  currentVersionId,
                  modelLabel,
                })
              }
              json={() => definition ?? {}}
              agent={() => ({
                kind: agent.agentType === "builtin" ? "system-agent" : "agent",
                location:
                  agent.agentType === "builtin"
                    ? "AI Matrx Admin — System Agents · Agent view"
                    : "AI Matrx — Agent view",
                description:
                  "Full agent definition, matching the live builder state.",
                data: definition ?? {},
                summary: agentDefinitionSummary(definition ?? agent, {
                  liveAgentId,
                  currentVersionId,
                  modelLabel,
                }),
                attributes: {
                  id: liveAgentId,
                  version,
                  agentType: agent.agentType,
                },
                context: { currentVersionId, category },
              })}
              aiVariants={[
                {
                  id: "basics",
                  label: "Basics",
                  hint: "Identity, IDs, model, variables (no defaults)",
                  build: () =>
                    buildSystemAgentAiPayload({
                      agent: definition ?? agent,
                      liveAgentId,
                      currentVersionId,
                      modelName: modelLabel ?? null,
                      exportMode: "basics",
                    }),
                },
                {
                  id: "with-messages",
                  label: "With messages",
                  hint: "Basics plus the full messages array",
                  build: () =>
                    buildSystemAgentAiPayload({
                      agent: definition ?? agent,
                      liveAgentId,
                      currentVersionId,
                      modelName: modelLabel ?? null,
                      exportMode: "with-messages",
                      messages: messages ?? [],
                    }),
                },
              ]}
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

        {dataIssues.length > 0 && (
          <Alert className="border-amber-500/50 bg-amber-500/10 text-amber-950 dark:text-amber-100">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>
              Recovered {dataIssues.length} stored data{" "}
              {dataIssues.length === 1 ? "issue" : "issues"}
            </AlertTitle>
            <AlertDescription>
              <p className="mb-2 text-xs">
                The agent remains available. Correct and re-save the named
                fields to normalize the stored definition.
              </p>
              <ul className="space-y-1 text-xs">
                {dataIssues.map((issue, index) => (
                  <li key={`${issue.field}-${index}`}>
                    <span className="font-mono font-semibold">
                      {issue.field}
                    </span>
                    {": "}
                    {asClause(issue.message)}. {issue.recovery}
                  </li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}

        {effectiveView === "json" ? (
          <div className="h-[calc(100dvh-12rem)]">
            <JsonInspector showSource
              data={definition ?? {}}
              label="Agent Definition"
              className="h-full"
              agentCopy={() => ({
                kind: agent.agentType === "builtin" ? "system-agent" : "agent",
                location:
                  agent.agentType === "builtin"
                    ? "AI Matrx Admin — System Agents · Agent view (raw JSON)"
                    : "AI Matrx — Agent view (raw JSON)",
                description:
                  "Full agent definition, matching the live builder state.",
                data: definition ?? {},
                attributes: {
                  id: liveAgentId,
                  version,
                  agentType: agent.agentType,
                },
              })}
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
                <EntityRef
                  token="agent"
                  id={liveAgentId}
                  name={agent.name}
                  href={agentHref(
                    { id: liveAgentId, agent_type: agent.agentType },
                    "",
                    addressViewer,
                  )}
                  showIcon={false}
                  wrap
                  className="font-mono text-foreground/90"
                >
                  {liveAgentId}
                  {version != null && (
                    <span className="ml-1 whitespace-nowrap text-muted-foreground/70">
                      · v{version}
                    </span>
                  )}
                </EntityRef>
                <button
                  type="button"
                  onClick={() =>
                    handleCopy("agent-id", liveAgentId, "Agent ID copied")
                  }
                  className="group inline-flex shrink-0 items-center text-foreground/90 transition-colors hover:text-foreground"
                  title="Copy agent ID"
                  aria-label="Copy agent ID"
                >
                  {copied === "agent-id" ? (
                    <Check className="w-3 h-3 text-emerald-500 shrink-0" />
                  ) : (
                    <Copy className="w-3 h-3 opacity-60 group-hover:opacity-100 shrink-0" />
                  )}
                </button>
              </div>
              {agent.description && (
                <RichContent level="full" imagePolicy="other"
                  source={agent.description}
                  hideCopyButton
                  className="text-sm text-muted-foreground leading-relaxed"
                />
              )}
              {agent.isVersion && changeNote && (
                <p className="text-xs italic text-muted-foreground/80 border-l-2 border-muted-foreground/30 pl-2">
                  {changeNote}
                </p>
              )}

              {/* Version + category metadata */}
              <div className="flex flex-col gap-1.5 pt-1">
                {!agent.isVersion &&
                  agent.sourceAgentId &&
                  (agent.followsSource || agent.sourceVersion != null) && (
                    <SourceFollowState
                      agentId={liveAgentId}
                      follows={agent.followsSource}
                    />
                  )}
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
                  </div>
                )}
              </div>

              {/* Status pills */}
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                {modelId && (
                  <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-muted/50 border border-border/60 text-xs">
                    <span className="text-muted-foreground">Model:</span>
                    <AiModelRef
                      modelId={modelId}
                      name={modelLabel}
                      className="text-foreground"
                    />
                  </span>
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
                label="context policies"
                count={contextPolicyCount}
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

            {recordSections}

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
                <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Variable className="w-4 h-4 text-purple-500" />
                    Variables ({variableCount})
                  </CardTitle>
                  <CopyButtons
                    size="xs"
                    label="Variables"
                    human={() =>
                      variables
                        .map((v) =>
                          [
                            `{{${v.name}}}`,
                            v.required ? "(required)" : null,
                            v.helpText ?? null,
                          ]
                            .filter(Boolean)
                            .join(" — "),
                        )
                        .join("\n")
                    }
                    json={() => variables}
                    agent={() => ({
                      kind: "agent-variables",
                      location: "AI Matrx — Agent view",
                      description: "Variable definitions for this agent.",
                      data: variables,
                      attributes: {
                        agentId: liveAgentId,
                        count: variableCount,
                      },
                    })}
                  />
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
                          <div className="font-medium text-foreground">
                            {variableRunLabel(v)}
                          </div>
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

            {/* Context Policies */}
            {contextPolicies && contextPolicyCount > 0 && (
              <Card>
                <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Layers className="w-4 h-4 text-cyan-500" />
                    Context Policies ({contextPolicyCount})
                  </CardTitle>
                  <CopyButtons
                    size="xs"
                    label="Context policies"
                    human={() =>
                      contextPolicies
                        .map((slot) =>
                          [
                            slot.key,
                            slot.type,
                            slot.label ?? slot.description ?? null,
                          ]
                            .filter(Boolean)
                            .join(" — "),
                        )
                        .join("\n")
                    }
                    json={() => contextPolicies}
                    agent={() => ({
                      kind: "agent-context-policies",
                      location: "AI Matrx — Agent view",
                      description: "Context policy definitions for this agent.",
                      data: contextPolicies,
                      attributes: {
                        agentId: liveAgentId,
                        count: contextPolicyCount,
                      },
                    })}
                  />
                </CardHeader>
                <CardContent>
                  <div className="grid gap-2">
                    {contextPolicies.map((slot, i) => (
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
                      <AiToolRef
                        key={t}
                        toolId={t}
                        showIcon={false}
                        className="rounded-md bg-secondary px-2 py-1 text-xs text-secondary-foreground"
                      />
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
                    <JsonInspector showSource
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

            {/*
             * Access truth: who can actually see this agent, and why. Lives at
             * the bottom so it never crowds the agent itself. Version rows are
             * agent_definition_version, not `agent`, so only the live agent
             * gets the panel.
             */}
            {!agent.isVersion && (
              <>
                <Separator />
                <AccessSummaryPanel
                  entityType="agent"
                  entityId={liveAgentId}
                  className="px-0"
                />
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
