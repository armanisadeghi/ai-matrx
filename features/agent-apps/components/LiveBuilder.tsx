"use client";

/**
 * LiveBuilder — split-pane no-code builder for shell-based apps.
 *
 * Left: numbered-step wizard (Layout → Variable input style → Settings →
 * History). Right: live preview that mounts the real shell against the
 * user's real agent. Every left-side change re-renders the right-side
 * preview instantly — no AI generation, no Babel sandbox, no code.
 *
 * On "Create app" the user's selections are written into `shell_kind` +
 * `shell_config` on a fresh `aga_apps` row (no `component_code`). The
 * row's UUID is its initial slug to avoid collisions; the user renames
 * it in Settings before publishing.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Box,
  Check,
  ChevronRight,
  FileText,
  Loader2,
  MessageCircle,
  Rocket,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/lib/toast-service";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectAgentById } from "@/features/agents/redux/agent-definition/selectors";
import { fetchFullAgent } from "@/features/agents/redux/agent-definition/thunks";
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

type ShellChoice = Extract<AgentAppShellKind, "chat" | "form_to_result" | "widget">;

const VARIABLE_STYLES: NonNullable<
  AgentAppShellConfigCommon["variableInputStyle"]
>[] = ["form", "inline", "wizard", "compact", "guided", "cards"];

const HISTORY_VIEWS: NonNullable<AgentAppShellConfigCommon["historyView"]>[] = [
  "sidebar",
  "drawer",
  "hidden",
];

export function LiveBuilder({
  agentId,
  onCancel,
  onSuccess,
}: LiveBuilderProps) {
  const router = useRouter();
  const dispatch = useAppDispatch();

  const agent = useAppSelector((state) => selectAgentById(state, agentId));

  // Seed Redux with the agent so the preview's `useAgentApp` finds it
  // immediately. Idempotent — fetchFullAgent skips if already loaded.
  useEffect(() => {
    if (agent) return;
    void dispatch(fetchFullAgent(agentId));
  }, [agent, agentId, dispatch]);

  const agentName = agent?.name ?? "App";

  const [shellKind, setShellKind] = useState<ShellChoice>("chat");
  const [variableInputStyle, setVariableInputStyle] = useState<
    NonNullable<AgentAppShellConfigCommon["variableInputStyle"]>
  >("form");
  const [historyView, setHistoryView] = useState<
    NonNullable<AgentAppShellConfigCommon["historyView"]>
  >("sidebar");
  const [autoRun, setAutoRun] = useState(false);
  const [allowChat, setAllowChat] = useState(true);
  const [compact, setCompact] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Shell-specific defaults the first time the user picks a shell.
  useEffect(() => {
    if (shellKind === "widget") setCompact(true);
    if (shellKind === "form_to_result") setAllowChat(false);
    if (shellKind === "chat") setAllowChat(true);
  }, [shellKind]);

  const shellConfig: AgentAppShellConfigCommon = useMemo(
    () => ({
      autoRun,
      allowChat,
      compact,
      variableInputStyle,
      historyView,
      // Always-hide the in-shell title — the run-page renders its own
      // header. (Embed deployments later override via Settings.)
      hideTitle: true,
    }),
    [autoRun, allowChat, compact, variableInputStyle, historyView],
  );

  // Synthetic PublicAgentApp for the preview. Stable id-per-agent so the
  // preview's launcher reuses one Redux conversation across config changes,
  // rather than spawning a fresh instance on every keystroke.
  const previewApp: PublicAgentApp = useMemo(
    () => ({
      id: `live-preview-${agentId}`,
      slug: `live-preview-${agentId}`,
      name: `${agentName} App`,
      agent_id: agentId,
      agent_version_id: null,
      use_latest: true,
      tagline: null,
      description: null,
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
    [agentId, agentName, shellKind, shellConfig],
  );

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
          name: `${agentName} App`,
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
      toast.error(
        err instanceof Error ? err.message : "Failed to create app",
      );
    } finally {
      setSubmitting(false);
    }
  }, [agentId, agentName, shellKind, shellConfig, onSuccess, router]);

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] gap-4">
      <div className="grid grid-cols-1 lg:grid-cols-[420px_1fr] gap-4 flex-1 min-h-0">
        <div className="overflow-y-auto pr-2 space-y-6">
          <Step number={1} label="Choose Your Layout">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <ShellCard
                icon={<FileText className="w-5 h-5 text-green-600 dark:text-green-400" />}
                iconBg="bg-green-100 dark:bg-green-900/30"
                title="Form → Result"
                description="Variables on top, response below."
                selected={shellKind === "form_to_result"}
                onClick={() => setShellKind("form_to_result")}
              />
              <ShellCard
                icon={<MessageCircle className="w-5 h-5 text-blue-600 dark:text-blue-400" />}
                iconBg="bg-blue-100 dark:bg-blue-900/30"
                title="Chat"
                description="Conversation with history + follow-up turns."
                selected={shellKind === "chat"}
                onClick={() => setShellKind("chat")}
              />
              <ShellCard
                icon={<Box className="w-5 h-5 text-purple-600 dark:text-purple-400" />}
                iconBg="bg-purple-100 dark:bg-purple-900/30"
                title="Widget"
                description="Compact, embed-friendly. For iframes."
                selected={shellKind === "widget"}
                onClick={() => setShellKind("widget")}
              />
            </div>
          </Step>

          {(shellKind === "form_to_result" || shellKind === "chat") && (
            <Step number={2} label="Variable Input Style">
              <Select
                value={variableInputStyle}
                onValueChange={(v) =>
                  setVariableInputStyle(
                    v as NonNullable<
                      AgentAppShellConfigCommon["variableInputStyle"]
                    >,
                  )
                }
              >
                <SelectTrigger className="h-9 w-full max-w-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {VARIABLE_STYLES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s.charAt(0).toUpperCase() + s.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Step>
          )}

          {shellKind === "chat" && (
            <Step number={3} label="History View">
              <Select
                value={historyView}
                onValueChange={(v) =>
                  setHistoryView(
                    v as NonNullable<AgentAppShellConfigCommon["historyView"]>,
                  )
                }
              >
                <SelectTrigger className="h-9 w-full max-w-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {HISTORY_VIEWS.map((v) => (
                    <SelectItem key={v} value={v}>
                      {v.charAt(0).toUpperCase() + v.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Step>
          )}

          <Step
            number={
              shellKind === "chat" ? 4 : shellKind === "form_to_result" ? 3 : 2
            }
            label="Behavior"
          >
            <div className="space-y-3">
              <ToggleRow
                label="Auto-run on open"
                description="Fire the first execution as soon as the app mounts."
                checked={autoRun}
                onCheckedChange={setAutoRun}
              />
              <ToggleRow
                label="Allow follow-up chat"
                description="Let users continue the conversation past turn 1."
                checked={allowChat}
                onCheckedChange={setAllowChat}
              />
              <ToggleRow
                label="Compact density"
                description="Tighter spacing — useful for embeds."
                checked={compact}
                onCheckedChange={setCompact}
              />
            </div>
          </Step>
        </div>

        <div className="relative rounded-lg border border-border bg-card overflow-hidden min-h-0">
          <div className="absolute top-2 right-3 z-10 flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground font-medium bg-card/90 px-2 py-0.5 rounded">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            Live preview
          </div>
          <div className="h-full">
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

      <div className="flex items-center justify-between gap-3 pt-2 border-t border-border">
        <div className="text-xs text-muted-foreground">
          {agent ? (
            <>
              Building an app for <span className="font-medium text-foreground">{agentName}</span>
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

function Step({
  number,
  label,
  children,
}: {
  number: number;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="flex items-center justify-center w-7 h-7 rounded-full bg-primary text-primary-foreground font-bold text-xs">
          {number}
        </div>
        <Label className="text-sm font-semibold">{label}</Label>
      </div>
      <div className="pl-9">{children}</div>
    </div>
  );
}

interface ShellCardProps {
  icon: React.ReactNode;
  iconBg: string;
  title: string;
  description: string;
  selected: boolean;
  onClick: () => void;
}

function ShellCard({
  icon,
  iconBg,
  title,
  description,
  selected,
  onClick,
}: ShellCardProps) {
  return (
    <Card
      onClick={onClick}
      className={cn(
        "cursor-pointer transition-all p-3 relative",
        selected
          ? "ring-2 ring-primary border-primary"
          : "hover:shadow-md hover:scale-[1.01]",
      )}
    >
      <CardContent className="p-0 space-y-1.5">
        <div className={cn("w-9 h-9 rounded-md flex items-center justify-center", iconBg)}>
          {icon}
        </div>
        <div className="text-sm font-medium text-foreground">{title}</div>
        <p className="text-[11px] text-muted-foreground leading-snug">
          {description}
        </p>
        {selected && (
          <Check className="absolute top-2 right-2 w-4 h-4 text-primary" />
        )}
      </CardContent>
    </Card>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onCheckedChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex-1 min-w-0">
        <div className="text-sm text-foreground">{label}</div>
        <p className="text-xs text-muted-foreground leading-snug mt-0.5">
          {description}
        </p>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}
