"use client";

/**
 * LiveBuilder — split-pane no-code builder for shell-based apps.
 *
 * Left: card-driven option groups. Right: live preview that mounts the
 * real shell against the user's real agent. Most options dispatch
 * instance-ui-state setters live so the preview reflects the change
 * instantly — switching variable input style, hiding reasoning, etc.
 * Options without setters yet are marked [Not yet wired] so the user
 * can see the surface but knows the toggle is a no-op until wired.
 *
 * `autoRun` is intentionally absent — apps need user input to make
 * sense; auto-running a default-state agent burns tokens on nothing.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Box,
  Check,
  ChevronRight,
  Eye,
  EyeOff,
  FileText,
  Loader2,
  MessageCircle,
  RefreshCw,
  Rocket,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "@/lib/toast-service";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectAgentById } from "@/features/agents/redux/agent-definition/selectors";
import { fetchFullAgent } from "@/features/agents/redux/agent-definition/thunks";
import { selectFocusedConversation } from "@/features/agents/redux/execution-system/conversation-focus/conversation-focus.selectors";
import { destroyInstance } from "@/features/agents/redux/execution-system/conversations/conversations.slice";
// Alias these — local useState setters in this component share these names.
import {
  setVariablesPanelStyle as setVariablesPanelStyleAction,
  setShowVariablePanel as setShowVariablePanelAction,
  setAllowChat as setAllowChatAction,
  setHideReasoning as setHideReasoningAction,
  setHideToolResults as setHideToolResultsAction,
  setResponseDensity as setResponseDensityAction,
  setSubmitOnEnter as setSubmitOnEnterAction,
} from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.slice";
import { AgentAppChatShell } from "./shells/AgentAppChatShell";
import { AgentAppFormToResultShell } from "./shells/AgentAppFormToResultShell";
import { AgentAppWidgetShell } from "./shells/AgentAppWidgetShell";
import type {
  AgentAppShellConfigCommon,
  AgentAppShellKind,
  PublicAgentApp,
} from "@/features/agent-apps/types";

interface LiveBuilderProps {
  agentId: string;
  onCancel?: () => void;
  onSuccess?: (appId: string) => void;
}

type ShellChoice = Extract<
  AgentAppShellKind,
  "chat" | "form_to_result" | "widget"
>;

type VariableStyle =
  | "hidden"
  | "form"
  | "inline"
  | "wizard"
  | "compact"
  | "guided"
  | "cards";

type ResultRenderer = "matrx" | "custom";

type ResponseDelivery = "stream" | "all-at-once";

export function LiveBuilder({
  agentId,
  onCancel,
  onSuccess,
}: LiveBuilderProps) {
  const router = useRouter();
  const dispatch = useAppDispatch();

  const agent = useAppSelector((state) => selectAgentById(state, agentId));
  useEffect(() => {
    if (agent) return;
    void dispatch(fetchFullAgent(agentId));
  }, [agent, agentId, dispatch]);

  // ── User selections ────────────────────────────────────────────────────
  const [name, setName] = useState<string>("");
  useEffect(() => {
    if (!name && agent?.name) setName(`${agent.name} App`);
  }, [agent?.name, name]);
  const [description, setDescription] = useState<string>("");

  const [shellKind, setShellKind] = useState<ShellChoice>("chat");
  const [variableStyle, setVariableStyle] = useState<VariableStyle>("form");

  // Multi-select: chat options
  const [allowCustomUserInput, setAllowCustomUserInput] = useState(true);
  const [allowChat, setAllowChat] = useState(true);

  // Single-select: result renderer (PLACEHOLDER — wired in Phase 2 with slot system)
  const [resultRenderer, setResultRenderer] =
    useState<ResultRenderer>("matrx");

  // Multi-select: result filters
  const [hideReasoning, setHideReasoning] = useState(false);
  const [hideToolResults, setHideToolResults] = useState(false);

  // Single-select: response delivery (PLACEHOLDER — server controls stream)
  const [responseDelivery, setResponseDelivery] =
    useState<ResponseDelivery>("stream");

  // Custom tweaks
  const [density, setDensity] = useState<"default" | "compact">("default");
  const [allowAttachments, setAllowAttachments] = useState(true); // PLACEHOLDER
  const [showMicrophone, setShowMicrophone] = useState(true); // PLACEHOLDER
  const [submitOnEnter, setSubmitOnEnterLocal] = useState(true);
  const [showUserMessageOptions, setShowUserMessageOptions] = useState(true); // PLACEHOLDER
  const [showAssistantMessageOptions, setShowAssistantMessageOptions] =
    useState(true); // PLACEHOLDER
  const [inputPlaceholder, setInputPlaceholder] = useState(""); // PLACEHOLDER

  const [submitting, setSubmitting] = useState(false);
  const [previewSeed, setPreviewSeed] = useState(0); // bumped to force preview remount

  const surfaceKey = `agent-app:live-preview-${agentId}`;
  const previewConversationId = useAppSelector(
    selectFocusedConversation(surfaceKey),
  );

  // ── Live dispatch: when user changes options, update existing instance
  useEffect(() => {
    if (!previewConversationId) return;
    if (variableStyle === "hidden") {
      dispatch(
        setShowVariablePanelAction({
          conversationId: previewConversationId,
          value: false,
        }),
      );
    } else {
      dispatch(
        setShowVariablePanelAction({
          conversationId: previewConversationId,
          value: true,
        }),
      );
      dispatch(
        setVariablesPanelStyleAction({
          conversationId: previewConversationId,
          style: variableStyle,
        }),
      );
    }
  }, [variableStyle, previewConversationId, dispatch]);

  useEffect(() => {
    if (!previewConversationId) return;
    dispatch(
      setAllowChatAction({
        conversationId: previewConversationId,
        allow: allowChat,
      }),
    );
  }, [allowChat, previewConversationId, dispatch]);

  useEffect(() => {
    if (!previewConversationId) return;
    dispatch(
      setHideReasoningAction({
        conversationId: previewConversationId,
        value: hideReasoning,
      }),
    );
  }, [hideReasoning, previewConversationId, dispatch]);

  useEffect(() => {
    if (!previewConversationId) return;
    dispatch(
      setHideToolResultsAction({
        conversationId: previewConversationId,
        value: hideToolResults,
      }),
    );
  }, [hideToolResults, previewConversationId, dispatch]);

  useEffect(() => {
    if (!previewConversationId) return;
    dispatch(
      setResponseDensityAction({
        conversationId: previewConversationId,
        density,
      }),
    );
  }, [density, previewConversationId, dispatch]);

  useEffect(() => {
    if (!previewConversationId) return;
    dispatch(
      setSubmitOnEnterAction({
        conversationId: previewConversationId,
        value: submitOnEnter,
      }),
    );
  }, [submitOnEnter, previewConversationId, dispatch]);

  // ── Shell config sent to the DB on Create ──────────────────────────────
  const shellConfig: AgentAppShellConfigCommon & Record<string, unknown> =
    useMemo(
      () => ({
        allowChat,
        showVariablePanel: variableStyle !== "hidden",
        variableInputStyle: variableStyle === "hidden" ? undefined : variableStyle,
        hideReasoning,
        hideToolResults,
        compact: density === "compact",
        hideTitle: true,
        // Below: not yet wired in the runtime — saved so options aren't lost.
        allowCustomUserInput,
        resultRenderer,
        responseDelivery,
        allowAttachments,
        showMicrophone,
        submitOnEnter,
        showUserMessageOptions,
        showAssistantMessageOptions,
        inputPlaceholder: inputPlaceholder || undefined,
      }),
      [
        allowChat,
        variableStyle,
        hideReasoning,
        hideToolResults,
        density,
        allowCustomUserInput,
        resultRenderer,
        responseDelivery,
        allowAttachments,
        showMicrophone,
        submitOnEnter,
        showUserMessageOptions,
        showAssistantMessageOptions,
        inputPlaceholder,
      ],
    );

  const previewApp: PublicAgentApp = useMemo(
    () =>
      ({
        id: `live-preview-${agentId}`,
        slug: `live-preview-${agentId}`,
        name: name || `${agent?.name ?? "App"}`,
        agent_id: agentId,
        agent_version_id: null,
        use_latest: true,
        tagline: null,
        description: description || null,
        category: null,
        tags: [],
        preview_image_url: null,
        favicon_url: null,
        component_code: "",
        component_language: "tsx",
        allowed_imports: [],
        variable_schema: [],
        layout_config: {},
        styling_config: {},
        shell_kind: shellKind,
        shell_config: shellConfig,
        slot_overrides: {},
        slot_code: {},
        total_executions: 0,
        success_rate: 0,
        app_kind: "single",
        shared_context_slots: null,
        search_tsv: null,
      }) as unknown as PublicAgentApp,
    [agentId, agent?.name, name, description, shellKind, shellConfig],
  );

  const handleResetPreview = useCallback(() => {
    if (previewConversationId) {
      dispatch(destroyInstance(previewConversationId));
    }
    setPreviewSeed((n) => n + 1);
  }, [previewConversationId, dispatch]);

  const handleCreate = useCallback(async () => {
    setSubmitting(true);
    try {
      const slug =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `app-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
      const res = await fetch("/api/agent-apps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agent_id: agentId,
          slug,
          name: name || `${agent?.name ?? "App"} App`,
          description: description || undefined,
          shell_kind: shellKind,
          shell_config: shellConfig,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `Create failed (HTTP ${res.status})`);
      }
      const created = (await res.json()) as { id: string };
      toast.success("App created.");
      onSuccess?.(created.id);
      router.push(`/agent-apps/${created.id}/run`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create app");
    } finally {
      setSubmitting(false);
    }
  }, [
    agentId,
    agent?.name,
    name,
    description,
    shellKind,
    shellConfig,
    onSuccess,
    router,
  ]);

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] gap-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 flex-1 min-h-0">
        {/* ── Options panel ─────────────────────────────────────────────── */}
        <div className="overflow-y-auto pr-2 space-y-8">
          <Section number={1} label="Choose Your App Format">
            <CardGrid columns={3}>
              <ChoiceCard
                icon={<FileText className="w-4 h-4 text-green-600 dark:text-green-400" />}
                iconBg="bg-green-100 dark:bg-green-900/30"
                title="Form → Result"
                selected={shellKind === "form_to_result"}
                onClick={() => setShellKind("form_to_result")}
              />
              <ChoiceCard
                icon={<MessageCircle className="w-4 h-4 text-blue-600 dark:text-blue-400" />}
                iconBg="bg-blue-100 dark:bg-blue-900/30"
                title="Chat"
                selected={shellKind === "chat"}
                onClick={() => setShellKind("chat")}
              />
              <ChoiceCard
                icon={<Box className="w-4 h-4 text-purple-600 dark:text-purple-400" />}
                iconBg="bg-purple-100 dark:bg-purple-900/30"
                title="Widget"
                selected={shellKind === "widget"}
                onClick={() => setShellKind("widget")}
              />
            </CardGrid>
          </Section>

          <Section number={2} label="Configure Input Fields">
            <CardGrid columns={4}>
              {(
                [
                  { value: "hidden", label: "Hide Variables", icon: <EyeOff className="w-3.5 h-3.5" /> },
                  { value: "form", label: "Form" },
                  { value: "inline", label: "Inline" },
                  { value: "wizard", label: "Wizard" },
                  { value: "compact", label: "Compact" },
                  { value: "guided", label: "Guided" },
                  { value: "cards", label: "Cards" },
                ] as Array<{ value: VariableStyle; label: string; icon?: React.ReactNode }>
              ).map((opt) => (
                <ChoiceCard
                  key={opt.value}
                  title={opt.label}
                  icon={opt.icon}
                  selected={variableStyle === opt.value}
                  onClick={() => setVariableStyle(opt.value)}
                />
              ))}
            </CardGrid>
          </Section>

          <Section number={3} label="Chat Options" hint="Select all that apply">
            <CardGrid columns={2}>
              <ChoiceCard
                title="Allow Custom User Input"
                selected={allowCustomUserInput}
                onClick={() => setAllowCustomUserInput((v) => !v)}
                placeholder
              />
              <ChoiceCard
                title="Allow Follow-up Chat"
                selected={allowChat}
                onClick={() => setAllowChat((v) => !v)}
              />
            </CardGrid>
          </Section>

          <Section number={4} label="How Should Results Display?">
            <CardGrid columns={2}>
              <ChoiceCard
                icon={<Sparkles className="w-4 h-4 text-primary" />}
                iconBg="bg-primary/10"
                title="Matrx Custom Formatted Display"
                description="Full AI Matrx experience with rich formatting, flashcards, code blocks, and all custom UIs."
                selected={resultRenderer === "matrx"}
                onClick={() => setResultRenderer("matrx")}
              />
              <ChoiceCard
                title="Custom Display"
                description="Fully customized UI designed specifically for your output structure. Requires a highly reliable agent output."
                selected={resultRenderer === "custom"}
                onClick={() => setResultRenderer("custom")}
                placeholder
              />
            </CardGrid>
          </Section>

          <Section
            number={5}
            label="Want to filter the results?"
            hint="Select all that apply"
          >
            <CardGrid columns={2}>
              <ChoiceCard
                title="Hide Reasoning"
                description="False by default"
                selected={hideReasoning}
                onClick={() => setHideReasoning((v) => !v)}
              />
              <ChoiceCard
                title="Hide Tool Results"
                description="False by default"
                selected={hideToolResults}
                onClick={() => setHideToolResults((v) => !v)}
              />
            </CardGrid>
          </Section>

          <Section number={6} label="Response Delivery Style">
            <CardGrid columns={2}>
              <ChoiceCard
                title="Real-time Streaming"
                description="Content appears as it's generated. Feels responsive and clearly AI-powered."
                selected={responseDelivery === "stream"}
                onClick={() => setResponseDelivery("stream")}
                placeholder
              />
              <ChoiceCard
                title="Show All at Once"
                description="Loading screen, then complete result. Feels like a traditional app, less &quot;AI-like&quot;."
                selected={responseDelivery === "all-at-once"}
                onClick={() => setResponseDelivery("all-at-once")}
                placeholder
              />
            </CardGrid>
          </Section>

          <Section number={7} label="Custom tweaks">
            <div className="space-y-3">
              <div>
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                  Density
                </Label>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <ChoiceCard
                    title="Default"
                    selected={density === "default"}
                    onClick={() => setDensity("default")}
                  />
                  <ChoiceCard
                    title="Compact"
                    selected={density === "compact"}
                    onClick={() => setDensity("compact")}
                  />
                </div>
              </div>
              <CardGrid columns={2}>
                <ChoiceCard
                  title="Allow Attachments"
                  selected={allowAttachments}
                  onClick={() => setAllowAttachments((v) => !v)}
                  placeholder
                />
                <ChoiceCard
                  title="Show Microphone"
                  selected={showMicrophone}
                  onClick={() => setShowMicrophone((v) => !v)}
                  placeholder
                />
                <ChoiceCard
                  title="Submit on Enter"
                  selected={submitOnEnter}
                  onClick={() => setSubmitOnEnterLocal((v) => !v)}
                />
                <ChoiceCard
                  title="User Message Options"
                  selected={showUserMessageOptions}
                  onClick={() => setShowUserMessageOptions((v) => !v)}
                  placeholder
                />
                <ChoiceCard
                  title="Assistant Message Options"
                  selected={showAssistantMessageOptions}
                  onClick={() => setShowAssistantMessageOptions((v) => !v)}
                  placeholder
                />
              </CardGrid>
              <div>
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                  Custom User Input Placeholder
                  <span className="ml-2 inline-flex items-center text-[10px] text-amber-600 dark:text-amber-400 font-medium">
                    Not yet wired
                  </span>
                </Label>
                <Input
                  value={inputPlaceholder}
                  onChange={(e) => setInputPlaceholder(e.target.value)}
                  placeholder="e.g. Ask the agent…"
                  className="mt-2 h-9 text-[16px]"
                />
              </div>
            </div>
          </Section>
        </div>

        {/* ── Preview panel ─────────────────────────────────────────────── */}
        <div className="flex flex-col min-h-0 gap-3">
          <div className="space-y-2">
            <div className="grid grid-cols-1 gap-2">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="App name"
                className="text-[16px] font-semibold"
              />
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Description (optional)"
                rows={2}
                className="text-sm resize-none"
              />
            </div>
          </div>

          <div className="relative rounded-lg border border-border bg-card overflow-hidden flex-1 min-h-0">
            <div className="absolute top-2 right-3 z-10 flex items-center gap-2 bg-card/90 px-2 py-1 rounded">
              <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                Live preview
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={handleResetPreview}
                title="Reset preview conversation"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </Button>
            </div>
            <div className="h-full" key={`${shellKind}-${previewSeed}`}>
              {!agent ? (
                <div className="h-full flex items-center justify-center text-sm text-muted-foreground gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading agent…
                </div>
              ) : shellKind === "chat" ? (
                <AgentAppChatShell app={previewApp} />
              ) : shellKind === "form_to_result" ? (
                <AgentAppFormToResultShell app={previewApp} />
              ) : (
                <AgentAppWidgetShell app={previewApp} />
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 pt-2 border-t border-border">
        <div className="text-xs text-muted-foreground">
          {agent ? (
            <>
              Building an app for{" "}
              <span className="font-medium text-foreground">
                {agent.name}
              </span>
            </>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {onCancel && (
            <Button variant="ghost" onClick={onCancel} disabled={submitting}>
              Cancel
            </Button>
          )}
          <Button
            onClick={handleCreate}
            disabled={submitting || !agent}
            size="lg"
            className="gap-2"
          >
            {submitting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Rocket className="w-4 h-4" />
            )}
            {submitting ? "Creating…" : "Create app"}
            {!submitting && <ChevronRight className="w-4 h-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────

function Section({
  number,
  label,
  hint,
  children,
}: {
  number: number;
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-baseline gap-2">
        <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground font-bold text-[11px] shrink-0">
          {number}
        </div>
        <Label className="text-base font-semibold">{label}</Label>
        {hint && (
          <span className="text-xs text-muted-foreground">{hint}</span>
        )}
      </div>
      <div>{children}</div>
    </div>
  );
}

function CardGrid({
  columns,
  children,
}: {
  columns: number;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn("grid gap-2", {
        "grid-cols-1 sm:grid-cols-2": columns === 2,
        "grid-cols-2 sm:grid-cols-3": columns === 3,
        "grid-cols-2 sm:grid-cols-4": columns === 4,
      })}
    >
      {children}
    </div>
  );
}

interface ChoiceCardProps {
  icon?: React.ReactNode;
  iconBg?: string;
  title: string;
  description?: string;
  selected: boolean;
  onClick: () => void;
  /** Show a small "Not yet wired" badge for option surfaces awaiting backend hooks. */
  placeholder?: boolean;
}

function ChoiceCard({
  icon,
  iconBg,
  title,
  description,
  selected,
  onClick,
  placeholder,
}: ChoiceCardProps) {
  return (
    <Card
      onClick={onClick}
      className={cn(
        "cursor-pointer transition-all relative p-3 group",
        selected
          ? "ring-2 ring-primary border-primary"
          : "hover:shadow-md hover:scale-[1.01]",
      )}
    >
      <CardContent className="p-0 space-y-1.5">
        {(icon || iconBg) && (
          <div
            className={cn(
              "w-8 h-8 rounded-md flex items-center justify-center",
              iconBg ?? "bg-muted",
            )}
          >
            {icon}
          </div>
        )}
        <div className="flex items-center gap-1.5 pr-5">
          <span className="text-sm font-medium text-foreground">{title}</span>
        </div>
        {description && (
          <p className="text-[11px] text-muted-foreground leading-snug">
            {description}
          </p>
        )}
        {selected && (
          <Check className="absolute top-2 right-2 w-4 h-4 text-primary" />
        )}
        {placeholder && (
          <span
            title="Not yet wired in the runtime"
            className="absolute bottom-1.5 right-2 text-[9px] uppercase tracking-wider text-amber-600 dark:text-amber-400 font-medium"
          >
            placeholder
          </span>
        )}
      </CardContent>
    </Card>
  );
}
