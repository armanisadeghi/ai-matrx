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
import IconInputWithValidation from "@/components/official/icons/IconInputWithValidation";
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
  setDisplayNameOverride as setDisplayNameOverrideAction,
  setDisplayDescriptionOverride as setDisplayDescriptionOverrideAction,
  setDisplayIconNameOverride as setDisplayIconNameOverrideAction,
  setShowAttachments as setShowAttachmentsAction,
  setShowMicrophone as setShowMicrophoneAction,
  setShowUserMessageOptions as setShowUserMessageOptionsAction,
  setShowAssistantMessageOptions as setShowAssistantMessageOptionsAction,
  setInputPlaceholder as setInputPlaceholderAction,
} from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.slice";
import { AgentAppChatShell } from "./shells/AgentAppChatShell";
import { AgentAppFormToResultShell } from "./shells/AgentAppFormToResultShell";
import { AgentAppWidgetShell } from "./shells/AgentAppWidgetShell";
import { SLOT_STUBS } from "@/features/agent-apps/utils/slot-stubs";
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
  // Name + description live in the LEFT options panel as the first section
  // so the user can edit them and watch the preview header update in real
  // time. Both pre-fill from the agent so the user sees and saves the
  // resolved value — defaults aren't silent. If the agent's name or
  // description changes upstream later, the saved app stays as the user
  // captured it.
  const [name, setName] = useState<string>("");
  const [nameTouched, setNameTouched] = useState(false);
  useEffect(() => {
    if (nameTouched) return;
    if (!agent?.name) return;
    setName(`${agent.name} App`);
  }, [agent?.name, nameTouched]);

  const [description, setDescription] = useState<string>("");
  const [descTouched, setDescTouched] = useState(false);
  useEffect(() => {
    if (descTouched) return;
    if (agent?.description == null) return;
    setDescription(agent.description ?? "");
  }, [agent?.description, descTouched]);

  // Icon for the centered hero. Lucide name (e.g. "Sparkles", "Webhook")
  // or a Matrx `svg:…` path — both work with IconResolver. Default
  // matches the built-in "Webhook" fallback so the user sees the
  // current value pre-filled (defaults-as-values).
  const [iconName, setIconName] = useState<string>("Webhook");

  const [shellKind, setShellKind] = useState<ShellChoice>("chat");
  const [variableStyle, setVariableStyle] = useState<VariableStyle>("form");

  // Multi-select: chat options
  const [allowCustomUserInput, setAllowCustomUserInput] = useState(true);
  const [allowChat, setAllowChat] = useState(true);

  // Single-select: result renderer (PLACEHOLDER — wired in Phase 2 with slot system)
  const [resultRenderer, setResultRenderer] = useState<ResultRenderer>("matrx");

  // Multi-select: result filters
  const [hideReasoning, setHideReasoning] = useState(false);
  const [hideToolResults, setHideToolResults] = useState(false);

  // Single-select: response delivery (PLACEHOLDER — server controls stream)
  const [responseDelivery, setResponseDelivery] =
    useState<ResponseDelivery>("stream");

  // History sidebar scope (chat shell only).
  const [historyView, setHistoryView] =
    useState<NonNullable<AgentAppShellConfigCommon["historyView"]>>("app");

  // Custom tweaks — density uses the real ResponseDensity type
  // ("comfortable" | "compact") from instance-ui-state.slice.ts.
  const [density, setDensity] = useState<"comfortable" | "compact">(
    "comfortable",
  );
  const [allowAttachments, setAllowAttachments] = useState(true); // PLACEHOLDER
  const [showMicrophone, setShowMicrophone] = useState(true); // PLACEHOLDER
  const [submitOnEnter, setSubmitOnEnterLocal] = useState(true);
  const [showUserMessageOptions, setShowUserMessageOptions] = useState(true); // PLACEHOLDER
  const [showAssistantMessageOptions, setShowAssistantMessageOptions] =
    useState(true); // PLACEHOLDER
  // Pre-filled with the live runtime default so the user sees the
  // exact value that will be saved on the app — defaults-as-values.
  const [inputPlaceholder, setInputPlaceholder] = useState<string>(
    "Type your message...",
  );

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

  // App identity → centered hero of the preview shell. Setting these
  // makes AgentEmptyMessageDisplay show the app's name + description
  // instead of the agent's, and updates as the user types.
  useEffect(() => {
    if (!previewConversationId) return;
    dispatch(
      setDisplayNameOverrideAction({
        conversationId: previewConversationId,
        value: name || null,
      }),
    );
  }, [name, previewConversationId, dispatch]);

  useEffect(() => {
    if (!previewConversationId) return;
    dispatch(
      setDisplayDescriptionOverrideAction({
        conversationId: previewConversationId,
        value: description || null,
      }),
    );
  }, [description, previewConversationId, dispatch]);

  useEffect(() => {
    if (!previewConversationId) return;
    dispatch(
      setDisplayIconNameOverrideAction({
        conversationId: previewConversationId,
        value: iconName || null,
      }),
    );
  }, [iconName, previewConversationId, dispatch]);

  // Newly-wired input/display settings — dispatched on change so the
  // preview reflects them live.
  useEffect(() => {
    if (!previewConversationId) return;
    dispatch(
      setShowAttachmentsAction({
        conversationId: previewConversationId,
        value: allowAttachments,
      }),
    );
  }, [allowAttachments, previewConversationId, dispatch]);

  useEffect(() => {
    if (!previewConversationId) return;
    dispatch(
      setShowMicrophoneAction({
        conversationId: previewConversationId,
        value: showMicrophone,
      }),
    );
  }, [showMicrophone, previewConversationId, dispatch]);

  useEffect(() => {
    if (!previewConversationId) return;
    dispatch(
      setShowUserMessageOptionsAction({
        conversationId: previewConversationId,
        value: showUserMessageOptions,
      }),
    );
  }, [showUserMessageOptions, previewConversationId, dispatch]);

  useEffect(() => {
    if (!previewConversationId) return;
    dispatch(
      setShowAssistantMessageOptionsAction({
        conversationId: previewConversationId,
        value: showAssistantMessageOptions,
      }),
    );
  }, [showAssistantMessageOptions, previewConversationId, dispatch]);

  useEffect(() => {
    if (!previewConversationId) return;
    dispatch(
      setInputPlaceholderAction({
        conversationId: previewConversationId,
        value: inputPlaceholder || null,
      }),
    );
  }, [inputPlaceholder, previewConversationId, dispatch]);

  // ── Shell config sent to the DB on Create ──────────────────────────────
  // Note: NO `hideTitle` — the shells never draw their own title bar;
  // the app's name + description show in the centered hero
  // (AgentEmptyMessageDisplay) via the display overrides we dispatched.
  const shellConfig: AgentAppShellConfigCommon & Record<string, unknown> =
    useMemo(
      () => ({
        // Variables + chat
        allowChat,
        showVariablePanel: variableStyle !== "hidden",
        variableInputStyle:
          variableStyle === "hidden" ? undefined : variableStyle,
        // Transcript filters + density
        hideReasoning,
        hideToolResults,
        compact: density === "compact",
        // Chat-specific
        historyView,
        // Wired in Redux — explicit so saved apps lock in the user's
        // selections even if defaults change later.
        showAttachments: allowAttachments,
        showMicrophone,
        submitOnEnter,
        showUserMessageOptions,
        showAssistantMessageOptions,
        inputPlaceholder: inputPlaceholder || null,
        showFreeformInput: allowCustomUserInput,
        bufferStream: responseDelivery === "all-at-once",
        displayIconName: iconName || null,
        // Saved for completeness — drives slot_overrides / slot_code on create.
        resultRenderer,
        responseDelivery,
      }),
      [
        allowChat,
        variableStyle,
        hideReasoning,
        hideToolResults,
        density,
        historyView,
        allowCustomUserInput,
        resultRenderer,
        responseDelivery,
        allowAttachments,
        showMicrophone,
        submitOnEnter,
        showUserMessageOptions,
        showAssistantMessageOptions,
        inputPlaceholder,
        iconName,
      ],
    );

  // Slot overrides + slot code derived from the user's selections.
  //  - Custom Display → resultRenderer slot is custom, with a starter stub
  //    populated so the slot editor opens to working code post-create.
  //  - Buffer Stream → loadingComponent slot stub is seeded so the user
  //    can edit a custom loader. The default (built-in spinner) renders
  //    until the user overrides it.
  const slotOverrides = useMemo(() => {
    const out: Record<string, "custom"> = {};
    if (resultRenderer === "custom") out["resultRenderer"] = "custom";
    return out;
  }, [resultRenderer]);

  const slotCode = useMemo(() => {
    const out: Record<string, string> = {};
    if (resultRenderer === "custom") {
      out["resultRenderer"] = SLOT_STUBS.resultRenderer;
    }
    if (responseDelivery === "all-at-once") {
      // Seed the loading-component stub. The runtime renders the built-in
      // default loader; the user replaces this code via Settings → Layout
      // → Slot overrides when they want a custom loading look.
      out["loadingComponent"] = SLOT_STUBS.loadingComponent;
    }
    return out;
  }, [resultRenderer, responseDelivery]);

  const previewApp: PublicAgentApp = useMemo(
    () =>
      ({
        id: `live-preview-${agentId}`,
        slug: `live-preview-${agentId}`,
        name: name || `${agent?.name ?? "App"}`,
        agent_id: agentId,
        agent_version_id: null,
        use_latest: true,
        tagline: description || null,
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
        slot_overrides: slotOverrides,
        slot_code: slotCode,
        total_executions: 0,
        success_rate: 0,
        app_kind: "single",
        shared_context_slots: null,
        search_tsv: null,
      }) as unknown as PublicAgentApp,
    [
      agentId,
      agent?.name,
      name,
      description,
      shellKind,
      shellConfig,
      slotOverrides,
      slotCode,
    ],
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
          slot_overrides: slotOverrides,
          slot_code: slotCode,
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
    slotOverrides,
    slotCode,
    onSuccess,
    router,
  ]);

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-4">
      <div className="grid grid-cols-1 lg:grid-cols-[440px_minmax(0,1fr)] gap-4 flex-1 min-h-0">
        {/* ── Options panel — fixed width on lg+, scrolls vertically ───── */}
        <div className="overflow-y-auto pr-1 space-y-6">
          {/* App identity — name + description. Edits flow live into the
              preview's title row / form_to_result header. The saved
              shell_config still hides the title on the published run
              page (where the page header takes over). */}
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                App name
              </Label>
              <Input
                value={name}
                onChange={(e) => {
                  setNameTouched(true);
                  setName(e.target.value);
                }}
                placeholder={`${agent?.name ?? "App"} App`}
                className="text-[16px] font-medium"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                Description
              </Label>
              <Textarea
                value={description}
                onChange={(e) => {
                  setDescTouched(true);
                  setDescription(e.target.value);
                }}
                placeholder="One-line tagline — shown on the public page (optional)"
                rows={2}
                className="text-sm resize-none"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                Icon
              </Label>
              <IconInputWithValidation
                value={iconName}
                onChange={(next) => setIconName(next)}
                placeholder="e.g. Webhook, Sparkles, Bot"
                showLucideLink
                showCuratedIconGallery
              />
            </div>
          </div>

          <Section number={1} label="Choose Your App Format">
            <CardGrid columns={3}>
              <ChoiceCard
                icon={
                  <FileText className="w-4 h-4 text-green-600 dark:text-green-400" />
                }
                iconBg="bg-green-100 dark:bg-green-900/30"
                title="Form → Result"
                selected={shellKind === "form_to_result"}
                onClick={() => setShellKind("form_to_result")}
              />
              <ChoiceCard
                icon={
                  <MessageCircle className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                }
                iconBg="bg-blue-100 dark:bg-blue-900/30"
                title="Chat"
                selected={shellKind === "chat"}
                onClick={() => setShellKind("chat")}
              />
              <ChoiceCard
                icon={
                  <Box className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                }
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
                  { value: "hidden", label: "Hide" },
                  { value: "form", label: "Form" },
                  { value: "inline", label: "Inline" },
                  { value: "wizard", label: "Wizard" },
                  { value: "compact", label: "Compact" },
                  { value: "guided", label: "Guided" },
                  { value: "cards", label: "Cards" },
                ] as Array<{
                  value: VariableStyle;
                  label: string;
                  icon?: React.ReactNode;
                }>
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

          {shellKind === "chat" && (
            <Section number={3} label="History Sidebar">
              <CardGrid columns={3}>
                <ChoiceCard
                  title="Hide"
                  selected={historyView === "hidden"}
                  onClick={() => setHistoryView("hidden")}
                />
                <ChoiceCard
                  title="App Chats Only"
                  selected={historyView === "app"}
                  onClick={() => setHistoryView("app")}
                />
                <ChoiceCard
                  title="All Chats"
                  selected={historyView === "all"}
                  onClick={() => setHistoryView("all")}
                />
              </CardGrid>
            </Section>
          )}

          <Section number={4} label="Chat Options" hint="Select all that apply">
            <CardGrid columns={2}>
              <ChoiceCard
                title="Allow Custom User Input"
                selected={allowCustomUserInput}
                onClick={() => setAllowCustomUserInput((v) => !v)}
              />
              <ChoiceCard
                title="Allow Follow-up Chat"
                selected={allowChat}
                onClick={() => setAllowChat((v) => !v)}
              />
            </CardGrid>
          </Section>

          <Section number={5} label="How Should Results Display?">
            <CardGrid columns={2}>
              <ChoiceCard
                title="Matrx Display"
                description="Full AI Matrx experience with rich formatting, flashcards, code blocks, and all custom UIs."
                selected={resultRenderer === "matrx"}
                onClick={() => setResultRenderer("matrx")}
              />
              <ChoiceCard
                title="Custom Display"
                description="Fully customized UI designed specifically for your output structure. Requires a highly reliable agent output."
                selected={resultRenderer === "custom"}
                onClick={() => setResultRenderer("custom")}
              />
            </CardGrid>
          </Section>

          <Section
            number={6}
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

          <Section number={7} label="Response Delivery Style">
            <CardGrid columns={2}>
              <ChoiceCard
                title="Real-time Streaming"
                description="Content appears as it's generated. Feels responsive and clearly AI-powered."
                selected={responseDelivery === "stream"}
                onClick={() => setResponseDelivery("stream")}
              />
              <ChoiceCard
                title="Show All at Once"
                description='Loading screen, then complete result. Feels like a traditional app, less "AI-like".'
                selected={responseDelivery === "all-at-once"}
                onClick={() => setResponseDelivery("all-at-once")}
              />
            </CardGrid>
          </Section>

          <Section number={8} label="Custom tweaks">
            <div className="space-y-3">
              <div>
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                  Density
                </Label>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <ChoiceCard
                    title="Comfortable"
                    selected={density === "comfortable"}
                    onClick={() => setDensity("comfortable")}
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
                />
                <ChoiceCard
                  title="Show Microphone"
                  selected={showMicrophone}
                  onClick={() => setShowMicrophone((v) => !v)}
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
                />
                <ChoiceCard
                  title="Assistant Message Options"
                  selected={showAssistantMessageOptions}
                  onClick={() => setShowAssistantMessageOptions((v) => !v)}
                />
              </CardGrid>
              <div>
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                  Custom User Input Placeholder
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

          {/* Create — lives at the bottom of the options list so the preview
              owns the entire right side. App name defaults to "<Agent> App"
              and can be renamed later in Settings. */}
          <div className="pt-3 border-t border-border">
            <Button
              onClick={handleCreate}
              disabled={submitting || !agent}
              size="lg"
              className="w-full gap-2"
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

        {/* ── Preview panel — owns the full right side ─────────────────── */}
        {/* Pinned to bottom-right so it stays out of the way of the
            chat shell's own header (back / app name / collapse / +).
            The Reset stays accessible at the bottom corner. */}
        <div className="relative rounded-lg border border-border bg-card overflow-hidden min-h-0">
          <div className="absolute bottom-2 right-3 z-10 flex items-center gap-2 bg-card/90 px-2 py-1 rounded border border-border/60 shadow-sm">
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
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
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
