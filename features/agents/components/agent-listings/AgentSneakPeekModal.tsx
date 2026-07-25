"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTriggerCore,
} from "@/components/ui/tabs";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  selectAgentById,
  selectAgentDefinition,
  selectAgentOutputSchema,
  selectAgentReadyForBuilder,
  selectAgentVariableDefinitions,
} from "@/features/agents/redux/agent-definition/selectors";
import {
  findItemProperties,
  importColumnsFromAgentSchema,
} from "@/features/page-extraction/utils/columns";
import { fetchFullAgent } from "@/features/agents/redux/agent-definition/thunks";
import { selectModelLabelById } from "@/features/ai-models/redux/modelRegistrySlice";
import { fetchModelOptions } from "@/features/ai-models/redux/modelRegistrySlice";
import {
  selectAllTools,
  selectToolsReady,
} from "@/features/agents/redux/tools/tools.selectors";
import { fetchAvailableTools } from "@/features/agents/redux/tools/tools.thunks";
import type { AgentDefinitionMessage } from "@/features/agents/types/agent-message-types";
import type {
  AgentDefinition,
  AgentDefinitionRecord,
} from "@/features/agents/types/agent-definition.types";
import {
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  Copy,
  Check,
  Loader2,
  Pencil,
  Play,
  CircleCheck,
  FileJson,
  Zap,
  FileText,
  Variable,
  Braces,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast-service";
import { setPeekedAgentId } from "./agent-peek-tracker";

const OVERVIEW_MESSAGE_PREVIEW_CHARS = 200;

// ---------------------------------------------------------------------------
// Pure JSON builders — shared by the copy menu and the JSON tabs.
// ---------------------------------------------------------------------------

function buildFullJson(definition: AgentDefinition): string {
  return JSON.stringify(definition, null, 2);
}

function buildExecutionCoreJson(record: AgentDefinitionRecord): string {
  return JSON.stringify(
    {
      id: record.id,
      name: record.name,
      variables: (record.variableDefinitions ?? []).map((v) => v.name),
      context_slots: (record.contextSlots ?? []).map((s) => s.key),
    },
    null,
    2,
  );
}

function buildOverviewJson(definition: AgentDefinition): string {
  const overview: AgentDefinition = {
    ...definition,
    messages: (definition.messages ?? []).map((m) => ({
      ...m,
      content: Array.isArray(m.content)
        ? m.content.map((b) => {
            if (
              b.type === "text" &&
              typeof (b as { text?: unknown }).text === "string"
            ) {
              const text = (b as { text: string }).text;
              return {
                ...b,
                text:
                  text.length > OVERVIEW_MESSAGE_PREVIEW_CHARS
                    ? text.slice(0, OVERVIEW_MESSAGE_PREVIEW_CHARS) + "…"
                    : text,
              } as typeof b;
            }
            return b;
          })
        : m.content,
    })),
  };
  return JSON.stringify(overview, null, 2);
}

// Shared tab trigger styling — small, flat, underline-on-active.
const TAB_TRIGGER_CLASS =
  "rounded-none border-b-2 border-transparent bg-transparent shadow-none text-xs font-medium px-3 py-1 h-auto text-muted-foreground hover:text-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-primary data-[state=active]:text-primary";

const SYSTEM_PROMPT_PREVIEW_CHARS = 1000;
const MESSAGE_PREVIEW_CHARS = 500;

function extractTextContent(msg: AgentDefinitionMessage | undefined): string {
  if (!msg?.content || !Array.isArray(msg.content)) return "";
  return msg.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { type: "text"; text: string }).text)
    .join("\n");
}

function TruncatedText({
  text,
  previewChars,
}: {
  text: string;
  previewChars: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const needsTruncation = text.length > previewChars;
  const displayed =
    !needsTruncation || expanded
      ? text
      : text.slice(0, previewChars).trimEnd() + "…";

  return (
    <div className="text-sm text-foreground whitespace-pre-wrap break-words">
      {displayed}
      {needsTruncation && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="ml-1 text-xs font-medium text-primary hover:underline focus:outline-none"
        >
          {expanded ? "Show less" : "See more"}
        </button>
      )}
    </div>
  );
}

function Section({
  label,
  children,
  className,
  labelClassName,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
  labelClassName?: string;
}) {
  return (
    <section className={cn("space-y-1", className)}>
      <div
        className={cn(
          "text-[0.65rem] font-semibold uppercase tracking-wider text-primary",
          labelClassName,
        )}
      >
        {label}
      </div>
      <div>{children}</div>
    </section>
  );
}

function EmptyValue() {
  return <span className="text-sm text-muted-foreground italic">—</span>;
}

function outputSchemaRequiredKeys(outputSchema: unknown): Set<string> {
  if (!outputSchema || typeof outputSchema !== "object") return new Set();
  const env = outputSchema as { schema?: unknown };
  const root = (env.schema ?? outputSchema) as {
    type?: string;
    required?: string[];
    properties?: Record<string, unknown>;
    items?: { required?: string[]; properties?: Record<string, unknown> };
  };

  const itemProps = findItemProperties(outputSchema);
  if (!itemProps) return new Set(root.required ?? []);

  if (root.type === "array" && root.items?.required) {
    return new Set(root.items.required);
  }

  if (root.type === "object" && root.properties) {
    const arrayChild = Object.values(root.properties).find((p) => {
      const pp = p as { type?: string; items?: { required?: string[] } };
      return pp?.type === "array" && pp.items;
    }) as { items?: { required?: string[] } } | undefined;
    if (arrayChild?.items?.required) return new Set(arrayChild.items.required);
  }

  return new Set(root.required ?? []);
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (isNaN(d.getTime())) return value;
  return d.toLocaleString();
}

function MetaRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline gap-2 py-0.5">
      <span className="text-[0.625rem] uppercase tracking-wider text-muted-foreground w-28 shrink-0">
        {label}
      </span>
      <span
        className={cn("text-xs text-foreground break-all", mono && "font-mono")}
      >
        {value ?? <EmptyValue />}
      </span>
    </div>
  );
}

interface AgentSneakPeekContentProps {
  agentId: string;
  /**
   * Whether the surrounding container is "active" (e.g. modal is open,
   * hover popover is open). Controls whether the fetch effect runs.
   * Defaults to true.
   */
  active?: boolean;
  className?: string;
}

/**
 * Pure body content for the Sneak Peek view — sections + advanced + copy.
 * Used by both the modal (click-to-open) and the hover popover in the
 * agent selection dropdown. Triggers idempotent fetches when `active`.
 */
export function AgentSneakPeekContent({
  agentId,
  active = true,
  className,
}: AgentSneakPeekContentProps) {
  const dispatch = useAppDispatch();

  const record = useAppSelector((state) => selectAgentById(state, agentId));
  const isReady = useAppSelector((state) =>
    selectAgentReadyForBuilder(state, agentId),
  );
  const modelLabel = useAppSelector((state) =>
    selectModelLabelById(state, record?.modelId ?? null),
  );
  const allTools = useAppSelector(selectAllTools);
  const toolsReady = useAppSelector(selectToolsReady);

  const [advancedOpen, setAdvancedOpen] = useState(false);
  const advancedContentRef = useRef<HTMLDivElement>(null);

  // When the user opens Advanced, scroll the newly-revealed content into view
  // so they get visual feedback that something expanded below the fold.
  useEffect(() => {
    if (!advancedOpen) return undefined;
    const raf = requestAnimationFrame(() => {
      advancedContentRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "end",
      });
    });
    return () => cancelAnimationFrame(raf);
  }, [advancedOpen]);

  useEffect(() => {
    if (!active) return;
    if (!isReady) {
      dispatch(fetchFullAgent(agentId));
    }
    dispatch(fetchModelOptions());
    dispatch(fetchAvailableTools());
  }, [active, isReady, agentId, dispatch]);

  const systemPromptText = useMemo(() => {
    const sys = record?.messages?.find((m) => m.role === "system");
    return extractTextContent(sys);
  }, [record?.messages]);

  const additionalMessages = useMemo(
    () => (record?.messages ?? []).filter((m) => m.role !== "system"),
    [record?.messages],
  );

  const variableNames = useMemo(
    () => (record?.variableDefinitions ?? []).map((v) => v.name),
    [record?.variableDefinitions],
  );

  const toolNames = useMemo(() => {
    const builtin = (record?.tools ?? []).map((id) => {
      const t = allTools.find((x) => x.id === id);
      return t?.name ?? id;
    });
    const custom = (record?.customTools ?? []).map((t) => t.name);
    return [...builtin, ...custom];
  }, [record?.tools, record?.customTools, allTools]);

  const definition = useAppSelector((state) =>
    selectAgentDefinition(state, agentId),
  );
  const variableDefs = useAppSelector((state) =>
    selectAgentVariableDefinitions(state, agentId),
  );
  const outputSchema = useAppSelector((state) =>
    selectAgentOutputSchema(state, agentId),
  );

  const outputFields = useMemo(
    () => importColumnsFromAgentSchema(outputSchema),
    [outputSchema],
  );
  const outputRequired = useMemo(
    () => outputSchemaRequiredKeys(outputSchema),
    [outputSchema],
  );

  if (!isReady || !record) {
    return (
      <div
        className={cn(
          "flex items-center gap-2 text-sm text-muted-foreground py-6",
          className,
        )}
      >
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading agent details…
      </div>
    );
  }

  return (
    <Tabs
      defaultValue="summary"
      className={cn("flex flex-col gap-3", className)}
    >
      <TabsList className="h-auto bg-transparent p-0 gap-0 rounded-none border-b border-border justify-start w-full shrink-0 sticky top-0 z-10 backdrop-blur">
        <TabsTriggerCore value="summary" className={TAB_TRIGGER_CLASS}>
          Summary
        </TabsTriggerCore>
        <TabsTriggerCore value="input" className={TAB_TRIGGER_CLASS}>
          Input
        </TabsTriggerCore>
        <TabsTriggerCore value="output" className={TAB_TRIGGER_CLASS}>
          Output
        </TabsTriggerCore>
        <TabsTriggerCore value="full" className={TAB_TRIGGER_CLASS}>
          Full JSON
        </TabsTriggerCore>
        <TabsTriggerCore value="core" className={TAB_TRIGGER_CLASS}>
          Execution Core
        </TabsTriggerCore>
        <TabsTriggerCore value="overview" className={TAB_TRIGGER_CLASS}>
          Overview
        </TabsTriggerCore>
      </TabsList>

      <TabsContent value="summary" className="mt-0 space-y-4">
        <Section label="Description">
          {record.description ? (
            <p className="text-sm text-foreground whitespace-pre-wrap break-words">
              {record.description}
            </p>
          ) : (
            <EmptyValue />
          )}
        </Section>

        <Section label="System Prompt">
          {systemPromptText ? (
            <TruncatedText
              text={systemPromptText}
              previewChars={SYSTEM_PROMPT_PREVIEW_CHARS}
            />
          ) : (
            <EmptyValue />
          )}
        </Section>

        <Section label="Model">
          {modelLabel ? (
            <span className="text-sm text-foreground">{modelLabel}</span>
          ) : record.modelId ? (
            <span className="text-sm text-muted-foreground italic">
              Loading…
            </span>
          ) : (
            <EmptyValue />
          )}
        </Section>

        <Section
          label={`Variables${variableNames.length ? ` (${variableNames.length})` : ""}`}
        >
          {variableNames.length ? (
            <div className="flex flex-wrap gap-1.5">
              {variableNames.map((n) => (
                <span
                  key={n}
                  className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs font-mono text-foreground"
                >
                  {n}
                </span>
              ))}
            </div>
          ) : (
            <EmptyValue />
          )}
        </Section>

        <Section
          label={`Tools${toolNames.length ? ` (${toolNames.length})` : ""}`}
        >
          {toolNames.length ? (
            <div className="flex flex-wrap gap-1.5">
              {toolNames.map((n, i) => (
                <span
                  key={`${n}-${i}`}
                  className={cn(
                    "inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs text-foreground",
                    !toolsReady && "opacity-70",
                  )}
                >
                  {n}
                </span>
              ))}
            </div>
          ) : (
            <EmptyValue />
          )}
        </Section>

        <Section
          label={`Additional Messages${additionalMessages.length ? ` (${additionalMessages.length})` : ""}`}
        >
          {additionalMessages.length ? (
            <div className="space-y-2">
              {additionalMessages.map((m, i) => {
                const text = extractTextContent(m);
                return (
                  <div
                    key={i}
                    className="rounded-md border border-border bg-muted/30 p-2.5"
                  >
                    <div className="text-[0.625rem] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                      {m.role}
                    </div>
                    {text ? (
                      <TruncatedText
                        text={text}
                        previewChars={MESSAGE_PREVIEW_CHARS}
                      />
                    ) : (
                      <EmptyValue />
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyValue />
          )}
        </Section>

        <div className="border-t border-border pt-3">
          <button
            type="button"
            onClick={() => setAdvancedOpen((v) => !v)}
            className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground focus:outline-none"
          >
            {advancedOpen ? (
              <ChevronDown className="w-3.5 h-3.5" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5" />
            )}
            Advanced
          </button>

          {advancedOpen && (
            <div
              ref={advancedContentRef}
              className="mt-2 rounded-md bg-muted/30 p-3"
            >
              <MetaRow label="ID" value={record.id} mono />
              <MetaRow label="Type" value={record.agentType} />
              <MetaRow label="Version" value={record.version ?? "—"} />
              <MetaRow label="Category" value={record.category ?? "—"} />
              <MetaRow
                label="Tags"
                value={record.tags?.length ? record.tags.join(", ") : "—"}
              />
              <MetaRow label="Active" value={record.isActive ? "Yes" : "No"} />
              <MetaRow label="Public" value={record.isPublic ? "Yes" : "No"} />
              <MetaRow
                label="Archived"
                value={record.isArchived ? "Yes" : "No"}
              />
              <MetaRow
                label="Favorite"
                value={record.isFavorite ? "Yes" : "No"}
              />
              <MetaRow label="Access" value={record.accessLevel ?? "—"} />
              <MetaRow
                label="Created"
                value={formatDateTime(record.createdAt)}
              />
              <MetaRow
                label="Updated"
                value={formatDateTime(record.updatedAt)}
              />
              <MetaRow label="Model ID" value={record.modelId ?? "—"} mono />
            </div>
          )}
        </div>
      </TabsContent>

      <TabsContent value="input" className="mt-0 space-y-3">
        {!variableDefs || variableDefs.length === 0 ? (
          <div className="rounded-md border border-dashed border-border bg-muted/20 px-3 py-6 text-center">
            <Variable className="mx-auto mb-2 h-5 w-5 text-muted-foreground/60" />
            <p className="text-sm text-muted-foreground">No declared inputs.</p>
            <p className="mt-1 text-xs text-muted-foreground/70">
              This agent runs without user-supplied variables.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {variableDefs.map((v) => {
              const inputType =
                v.customComponent?.type ??
                (v.binding ? "context binding" : "textarea");
              const defaultDisplay =
                v.defaultValue != null && String(v.defaultValue).length > 0
                  ? String(v.defaultValue)
                  : null;

              return (
                <div
                  key={v.name}
                  className="rounded-md border border-border bg-muted/30 p-2.5"
                >
                  <div className="flex flex-wrap items-center gap-1.5">
                    <code className="rounded bg-primary/10 px-1.5 py-0.5 text-xs font-semibold text-primary">
                      {`{{${v.name}}}`}
                    </code>
                    <span className="rounded bg-background px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      {inputType}
                    </span>
                    {v.required && (
                      <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                        required
                      </span>
                    )}
                  </div>
                  {v.helpText && (
                    <p className="mt-1.5 text-sm leading-snug text-foreground/90">
                      {v.helpText}
                    </p>
                  )}
                  {defaultDisplay && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Default:{" "}
                      <span className="font-mono text-foreground/80">
                        {defaultDisplay}
                      </span>
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </TabsContent>

      <TabsContent value="output" className="mt-0 space-y-3">
        {outputFields.length === 0 ? (
          <div className="rounded-md border border-border bg-muted/30 px-3 py-4">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium text-foreground">Text</span>
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
              No structured output schema — the agent returns free-form text.
            </p>
          </div>
        ) : (
          <>
            {outputSchema?.name && (
              <div className="flex items-center gap-2 text-sm">
                <Braces className="h-4 w-4 shrink-0 text-primary" />
                <span className="font-medium text-foreground">
                  {outputSchema.name}
                </span>
                {outputSchema.strict && (
                  <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                    strict
                  </span>
                )}
              </div>
            )}
            {outputSchema?.description && (
              <p className="text-sm leading-snug text-muted-foreground">
                {outputSchema.description}
              </p>
            )}
            <div className="space-y-1.5 rounded-md border border-border bg-muted/30 p-2">
              {outputFields.map((field) => (
                <div
                  key={field.key}
                  className="rounded-md bg-background/60 px-2 py-1.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-1 truncate">
                      <code className="text-xs font-semibold text-foreground">
                        {field.key}
                      </code>
                      {outputRequired.has(field.key) && (
                        <span className="text-[10px] font-semibold text-primary">
                          *
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                      {field.type}
                    </span>
                  </div>
                  {field.description && (
                    <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                      {field.description}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </TabsContent>

      <TabsContent value="full" className="mt-0">
        {definition ? (
          <JsonBlock json={buildFullJson(definition)} />
        ) : (
          <EmptyValue />
        )}
      </TabsContent>

      <TabsContent value="core" className="mt-0">
        <JsonBlock json={buildExecutionCoreJson(record)} />
      </TabsContent>

      <TabsContent value="overview" className="mt-0">
        {definition ? (
          <JsonBlock json={buildOverviewJson(definition)} />
        ) : (
          <EmptyValue />
        )}
      </TabsContent>
    </Tabs>
  );
}

function JsonBlock({ json }: { json: string }) {
  return (
    <pre className="text-[11px] leading-relaxed bg-muted/40 border border-border rounded-md p-3 font-mono whitespace-pre-wrap break-words">
      {json}
    </pre>
  );
}

/**
 * Copy-to-clipboard dropdown for the sneak-peek views. Standalone so it can be
 * placed in a sticky footer (rather than inline with the scrollable body) and
 * reused in both the modal and the hover popover.
 */
export function AgentSneakPeekCopyMenu({ agentId }: { agentId: string }) {
  const record = useAppSelector((state) => selectAgentById(state, agentId));
  const definition = useAppSelector((state) =>
    selectAgentDefinition(state, agentId),
  );
  const [copied, setCopied] = useState(false);

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success(`${label} copied to clipboard`);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy to clipboard");
    }
  };

  const handleCopyFull = () => {
    if (!definition) return;
    copyToClipboard(buildFullJson(definition), "Full definition");
  };

  const handleCopyExecutionCore = () => {
    if (!record) return;
    copyToClipboard(buildExecutionCoreJson(record), "Execution core");
  };

  const handleCopyOverview = () => {
    if (!definition) return;
    copyToClipboard(buildOverviewJson(definition), "Overview");
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={!definition}>
          {copied ? <Check className="text-success" /> : <Copy />}
          {copied ? "Copied" : "Copy"}
          <ChevronDown className="opacity-70" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuItem onClick={handleCopyFull}>
          <FileJson className="mr-2 h-4 w-4" />
          <div className="flex flex-col">
            <span>Full JSON</span>
            <span className="text-[10px] text-muted-foreground">
              Complete agent definition
            </span>
          </div>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleCopyExecutionCore}>
          <Zap className="mr-2 h-4 w-4" />
          <div className="flex flex-col">
            <span>Execution Core</span>
            <span className="text-[10px] text-muted-foreground">
              id, name, variables, slots
            </span>
          </div>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleCopyOverview}>
          <FileText className="mr-2 h-4 w-4" />
          <div className="flex flex-col">
            <span>Overview</span>
            <span className="text-[10px] text-muted-foreground">
              Full JSON, messages truncated
            </span>
          </div>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface AgentSneakPeekModalProps {
  agentId: string;
  isOpen: boolean;
  onClose: () => void;
  /**
   * When provided, renders a primary "Select" button that calls this handler
   * and closes the modal. Useful when the modal is opened from a context that
   * wants the user to pick the agent (e.g. an agent picker dropdown).
   */
  onSelect?: () => void;
  selectLabel?: string;
  /**
   * Ordered list of agent ids available for prev/next navigation within the
   * modal (e.g. the currently filtered list from an agents page). When
   * provided and the current agent is in the list, arrow controls appear in
   * the header and ArrowLeft/ArrowRight keys cycle through the list.
   */
  navigationIds?: string[];
}

export function AgentSneakPeekModal({
  agentId,
  isOpen,
  onClose,
  onSelect,
  selectLabel = "Select Agent",
  navigationIds,
}: AgentSneakPeekModalProps) {
  // When navigation is enabled we track which agent is currently shown.
  // This lets the user paginate without the caller having to re-render.
  const [currentId, setCurrentId] = useState(agentId);
  useEffect(() => {
    if (isOpen) setCurrentId(agentId);
  }, [isOpen, agentId]);

  const bodyRef = useRef<HTMLDivElement>(null);

  // Surface-runtime visibility: record which agent is being peeked so the
  // Agents Hub emitter (AgentsGrid getScope) can report it at trigger time.
  useEffect(() => {
    if (!isOpen) return undefined;
    setPeekedAgentId(currentId);
    return () => setPeekedAgentId(null);
  }, [isOpen, currentId]);

  const currentIndex = navigationIds ? navigationIds.indexOf(currentId) : -1;
  const hasNav = navigationIds != null && currentIndex >= 0;
  const hasPrev = hasNav && currentIndex > 0;
  const hasNext =
    hasNav && navigationIds != null && currentIndex < navigationIds.length - 1;

  const goPrev = () => {
    if (!hasPrev || !navigationIds) return;
    setCurrentId(navigationIds[currentIndex - 1]);
    bodyRef.current?.scrollTo({ top: 0 });
  };
  const goNext = () => {
    if (!hasNext || !navigationIds) return;
    setCurrentId(navigationIds[currentIndex + 1]);
    bodyRef.current?.scrollTo({ top: 0 });
  };

  // Keyboard shortcuts — only when modal is open and nav is available.
  useEffect(() => {
    if (!isOpen || !hasNav) return undefined;
    const handler = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        goPrev();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        goNext();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, hasNav, currentIndex, navigationIds]);

  const record = useAppSelector((state) => selectAgentById(state, currentId));
  const isReady = useAppSelector((state) =>
    selectAgentReadyForBuilder(state, currentId),
  );
  const showFooter = isReady && !!record;

  const handleSelect = () => {
    onSelect?.();
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="max-w-xl bg-card border border-border p-5 gap-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 pr-6">
          {hasNav && (
            <div className="flex items-center gap-0.5 shrink-0">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={goPrev}
                disabled={!hasPrev}
                title="Previous (←)"
              >
                <ChevronLeft />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={goNext}
                disabled={!hasNext}
                title="Next (→)"
              >
                <ChevronRight />
              </Button>
              {navigationIds && (
                <span className="text-[10px] font-medium tabular-nums text-muted-foreground ml-1">
                  {currentIndex + 1} / {navigationIds.length}
                </span>
              )}
            </div>
          )}
          <DialogTitle className="text-base font-semibold text-foreground truncate">
            {record?.name ?? "Agent"}
          </DialogTitle>
        </div>

        <div ref={bodyRef} className="overflow-y-auto max-h-[65dvh] -mr-2 pr-2">
          <AgentSneakPeekContent agentId={currentId} active={isOpen} />
        </div>

        {showFooter && (
          <div className="flex items-center gap-2 border-t border-border pt-3">
            <AgentSneakPeekCopyMenu agentId={currentId} />
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="ml-auto"
            >
              Close
            </Button>
            <Link href={`/agents/${currentId}/build`} onClick={onClose}>
              <Button variant={onSelect ? "ghost" : "outline"} size="sm">
                <Pencil />
                Edit
              </Button>
            </Link>
            <Link href={`/agents/${currentId}/run`} onClick={onClose}>
              <Button variant={onSelect ? "outline" : "default"} size="sm">
                <Play />
                Run
              </Button>
            </Link>
            {onSelect && (
              <Button size="sm" onClick={handleSelect}>
                <CircleCheck />
                {selectLabel}
              </Button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
