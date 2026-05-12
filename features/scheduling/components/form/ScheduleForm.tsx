// features/scheduling/components/form/ScheduleForm.tsx
//
// Full create/edit form. Six sections per docs/SCHEDULING.md §7.C plus the
// extras (variables, expires_at, max_concurrent, persistent_conversation_id).
//
// Cron triggers compute next_due_at server-side via aidream so the Python
// parser stays authoritative. Other trigger types use the FE shim (it's
// closed-form math). The Zod schema is the canonical validator.

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import { useAppDispatch } from "@/lib/redux/hooks";
import { cn } from "@/lib/utils";
import { TRIGGER_TYPES } from "../../constants/triggerTypes";
import { SURFACE_META, SURFACE_VALUES } from "../../constants/surfaces";
import {
  createScheduledTask,
  updateScheduledTask,
} from "../../redux/tasks/thunks";
import {
  createTaskFormSchema,
  type CreateTaskFormValues,
} from "../../utils/validation";
import type {
  AgendaTask,
  CreateAgentTaskInput,
  Surface,
  TriggerConfig,
  TriggerType,
} from "../../types";
import { OneShotForm } from "./triggers/OneShotForm";
import { IntervalForm } from "./triggers/IntervalForm";
import { CronForm } from "./triggers/CronForm";
import { HeartbeatForm } from "./triggers/HeartbeatForm";
import { ContextMatchForm } from "./triggers/ContextMatchForm";
import { VariablesEditor } from "./VariablesEditor";
import { AgentListDropdown } from "@/features/agents/components/agent-listings/AgentListDropdown";

interface FormState {
  title: string;
  description: string;
  surfaces: Surface[];
  tags: string[];
  prompt: string;
  agentId: string | null;
  variables: Record<string, unknown>;
  persistentConversationId: string;
  authMode: "ask" | "auto";
  maxRuntimeSeconds: number;
  maxConcurrent: number;
  expiresAt: string;
  triggerType: TriggerType;
  triggerConfig: Record<string, unknown>;
}

function makeDefault(task?: AgendaTask): FormState {
  if (task) {
    const t = task.triggers[0];
    return {
      title: task.title,
      description: task.description ?? "",
      surfaces: task.surfaces,
      tags: task.tags,
      prompt: task.prompt,
      agentId: task.agentId,
      variables: task.variables,
      persistentConversationId: task.persistentConversationId ?? "",
      authMode: task.authMode,
      maxRuntimeSeconds: task.maxRuntimeSeconds,
      maxConcurrent: task.maxConcurrent,
      expiresAt: task.expiresAt ? toLocalDateTime(task.expiresAt) : "",
      triggerType: t?.type ?? "interval",
      triggerConfig: (t?.config ?? {}) as Record<string, unknown>,
    };
  }
  return {
    title: "",
    description: "",
    surfaces: ["any"],
    tags: [],
    prompt: "",
    agentId: null,
    variables: {},
    persistentConversationId: "",
    authMode: "ask",
    maxRuntimeSeconds: 600,
    maxConcurrent: 1,
    expiresAt: "",
    triggerType: "interval",
    triggerConfig: { every_seconds: 3600 },
  };
}

function toLocalDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return "";
  }
}

function fromLocalDateTime(value: string): string {
  if (!value) return "";
  return new Date(value).toISOString();
}

interface Props {
  /** Provided in edit mode. */
  task?: AgendaTask;
}

export function ScheduleForm({ task }: Props) {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const [pending, startTransition] = useTransition();
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState<FormState>(() => makeDefault(task));
  const [tagInput, setTagInput] = useState("");

  const patch = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((s) => ({ ...s, [k]: v }));

  const setTrigger = (type: TriggerType, config: Record<string, unknown>) => {
    setForm((s) => ({ ...s, triggerType: type, triggerConfig: config }));
  };

  const submit = async () => {
    const trigger = buildTriggerConfig(form.triggerType, form.triggerConfig);
    if (!trigger) {
      setErrors({ trigger: "Invalid trigger configuration" });
      return;
    }

    // Zod validation — canonical.
    const candidate: CreateTaskFormValues = {
      title: form.title,
      description: form.description || null,
      surfaces: form.surfaces,
      tags: form.tags,
      queue: "default",
      expiresAt: form.expiresAt ? fromLocalDateTime(form.expiresAt) : null,
      agentId: form.agentId || null,
      prompt: form.prompt,
      variables: form.variables,
      persistentConversationId: form.persistentConversationId || null,
      authMode: form.authMode,
      maxRuntimeSeconds: form.maxRuntimeSeconds,
      maxConcurrent: form.maxConcurrent,
      trigger,
    };

    const parsed = createTaskFormSchema.safeParse(candidate);
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const path = issue.path.join(".") || "_form";
        if (!errs[path]) errs[path] = issue.message;
      }
      setErrors(errs);
      return;
    }
    setErrors({});

    setSubmitting(true);
    try {
      if (task) {
        await dispatch(
          updateScheduledTask(task.id, {
            taskPatch: {
              title: parsed.data.title,
              description: parsed.data.description ?? null,
              surfaces: parsed.data.surfaces as Surface[],
              tags: parsed.data.tags,
              expires_at: parsed.data.expiresAt ?? null,
            },
            agentPatch: {
              agent_id: parsed.data.agentId ?? null,
              prompt: parsed.data.prompt,
              variables: parsed.data.variables,
              persistent_conversation_id:
                parsed.data.persistentConversationId ?? null,
              auth_mode: parsed.data.authMode,
              max_runtime_seconds: parsed.data.maxRuntimeSeconds,
              max_concurrent: parsed.data.maxConcurrent,
            },
            trigger,
          }),
        );
        toast.success("Schedule updated");
        startTransition(() => router.push(`/schedules/${task.id}`));
      } else {
        const input: CreateAgentTaskInput = {
          title: parsed.data.title,
          description: parsed.data.description ?? null,
          surfaces: parsed.data.surfaces as Surface[],
          tags: parsed.data.tags,
          expiresAt: parsed.data.expiresAt ?? null,
          agentId: parsed.data.agentId ?? null,
          prompt: parsed.data.prompt,
          variables: parsed.data.variables,
          persistentConversationId:
            parsed.data.persistentConversationId ?? null,
          authMode: parsed.data.authMode,
          maxRuntimeSeconds: parsed.data.maxRuntimeSeconds,
          maxConcurrent: parsed.data.maxConcurrent,
          trigger,
        };
        const newId = await dispatch(createScheduledTask(input));
        toast.success("Schedule created");
        startTransition(() => router.push(`/schedules/${newId}`));
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to save schedule",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      className="space-y-6"
    >
      {/* 1. Basics */}
      <Section title="Basics">
        <Field label="Title" htmlFor="title" error={errors.title}>
          <Input
            id="title"
            value={form.title}
            onChange={(e) => patch("title", e.target.value)}
            placeholder="Daily morning briefing"
            maxLength={200}
          />
        </Field>
        <Field label="Description" htmlFor="description" optional>
          <Textarea
            id="description"
            value={form.description}
            onChange={(e) => patch("description", e.target.value)}
            placeholder="What does this schedule do? (optional)"
            rows={2}
            maxLength={2000}
          />
        </Field>
      </Section>

      {/* 2. What to run */}
      <Section title="What to run">
        <AgentListDropdown
          onSelect={(id) => patch("agentId", id)}
          label="Select the agent"
        />
        <Field label="Prompt" htmlFor="prompt" error={errors.prompt}>
          <Textarea
            id="prompt"
            value={form.prompt}
            onChange={(e) => patch("prompt", e.target.value)}
            placeholder="What should the agent do every time this fires?"
            rows={6}
            className="font-mono text-sm"
            maxLength={10000}
          />
          <div className="text-xs text-muted-foreground mt-1">
            {form.prompt.length} / 10,000
          </div>
        </Field>
        <Field label="Variables" optional>
          <VariablesEditor
            value={form.variables}
            onChange={(v) => patch("variables", v)}
          />
        </Field>
        <Field
          label="Persistent conversation ID"
          htmlFor="conv-id"
          optional
          error={errors.persistentConversationId}
        >
          <Input
            id="conv-id"
            value={form.persistentConversationId}
            onChange={(e) => patch("persistentConversationId", e.target.value)}
            placeholder="conversation UUID — leave blank for heartbeat to auto-bind on first run"
            className="font-mono text-xs"
          />
          <p className="text-xs text-muted-foreground mt-1">
            For heartbeat triggers, all runs append to this conversation. Leave
            blank to let the first run create one.
          </p>
        </Field>
      </Section>

      {/* 3. When to run */}
      <Section title="When to run">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          {TRIGGER_TYPES.map((meta) => {
            const Icon = meta.icon;
            const selected = form.triggerType === meta.type;
            return (
              <button
                key={meta.type}
                type="button"
                onClick={() => setTrigger(meta.type, defaultsFor(meta.type))}
                className={cn(
                  "flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors",
                  selected
                    ? "border-primary bg-primary/5"
                    : "border-border hover:bg-accent/40",
                )}
              >
                <Icon
                  className={cn(
                    "h-4 w-4",
                    selected ? "text-primary" : "text-muted-foreground",
                  )}
                />
                <div className="text-sm font-medium leading-tight">
                  {meta.label}
                </div>
                <div className="text-[11px] text-muted-foreground leading-snug">
                  {meta.description}
                </div>
              </button>
            );
          })}
        </div>

        <div className="pt-3">
          {form.triggerType === "one-shot" && (
            <OneShotForm
              value={form.triggerConfig as { at?: string }}
              onChange={(v) => setTrigger("one-shot", v)}
              error={errors["trigger.at"] ?? errors.trigger}
            />
          )}
          {form.triggerType === "interval" && (
            <IntervalForm
              value={form.triggerConfig as { every_seconds?: number }}
              onChange={(v) => setTrigger("interval", v)}
              error={errors["trigger.every_seconds"] ?? errors.trigger}
            />
          )}
          {form.triggerType === "cron" && (
            <CronForm
              value={form.triggerConfig as { expression?: string; tz?: string }}
              onChange={(v) => setTrigger("cron", v)}
              error={errors["trigger.expression"] ?? errors.trigger}
            />
          )}
          {form.triggerType === "heartbeat" && (
            <HeartbeatForm
              value={form.triggerConfig as { every_seconds?: number }}
              onChange={(v) => setTrigger("heartbeat", v)}
              error={errors["trigger.every_seconds"] ?? errors.trigger}
            />
          )}
          {form.triggerType === "context-match" && (
            <ContextMatchForm
              value={
                form.triggerConfig as {
                  kind?: string;
                  url_pattern?: string;
                  hostname?: string;
                }
              }
              onChange={(v) => setTrigger("context-match", v)}
              error={errors["trigger.kind"] ?? errors.trigger}
            />
          )}
        </div>
      </Section>

      {/* 4. Where to run */}
      <Section title="Where to run">
        <Field label="Surfaces" error={errors.surfaces}>
          <div className="flex flex-wrap gap-2">
            {SURFACE_VALUES.map((s) => {
              const meta = SURFACE_META[s];
              const selected = form.surfaces.includes(s);
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => {
                    if (selected) {
                      patch(
                        "surfaces",
                        form.surfaces.filter((x) => x !== s) as Surface[],
                      );
                    } else {
                      patch("surfaces", [...form.surfaces, s] as Surface[]);
                    }
                  }}
                  title={meta.description}
                  className={cn(
                    "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
                    selected
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border hover:bg-accent/40",
                  )}
                >
                  {meta.label}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            <Badge variant="secondary" className="text-[10px] mr-1">
              Any
            </Badge>
            is the safe default — the first online executor picks it up.
          </p>
        </Field>
      </Section>

      {/* 5. How to run */}
      <Section title="How to run">
        <Field label="Auth mode" htmlFor="auth">
          <div className="flex items-center gap-3">
            <Switch
              id="auth"
              checked={form.authMode === "auto"}
              onCheckedChange={(checked) =>
                patch("authMode", checked ? "auto" : "ask")
              }
            />
            <span className="text-sm">
              {form.authMode === "auto"
                ? "Auto — runs immediately when due"
                : "Ask — notifies user, they click to run"}
            </span>
          </div>
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field
            label="Max runtime (seconds)"
            htmlFor="runtime"
            error={errors.maxRuntimeSeconds}
          >
            <Input
              id="runtime"
              type="number"
              min={5}
              max={86400}
              value={form.maxRuntimeSeconds}
              onChange={(e) =>
                patch("maxRuntimeSeconds", Number(e.target.value) || 600)
              }
            />
            <p className="text-xs text-muted-foreground mt-1">5 – 86,400</p>
          </Field>
          <Field
            label="Max concurrent runs"
            htmlFor="concurrent"
            error={errors.maxConcurrent}
          >
            <Input
              id="concurrent"
              type="number"
              min={1}
              max={10}
              value={form.maxConcurrent}
              onChange={(e) =>
                patch("maxConcurrent", Number(e.target.value) || 1)
              }
            />
            <p className="text-xs text-muted-foreground mt-1">1 – 10</p>
          </Field>
        </div>
        <Field label="Expires at" htmlFor="expires" optional>
          <Input
            id="expires"
            type="datetime-local"
            value={form.expiresAt}
            onChange={(e) => patch("expiresAt", e.target.value)}
            className="max-w-xs"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Task auto-disables after this time. Leave blank for no expiry.
          </p>
        </Field>
      </Section>

      {/* 6. Tags */}
      <Section title="Tags">
        <div className="flex flex-wrap items-center gap-1.5">
          {form.tags.map((t) => (
            <Badge key={t} variant="secondary" className="gap-1">
              {t}
              <button
                type="button"
                onClick={() =>
                  patch(
                    "tags",
                    form.tags.filter((x) => x !== t),
                  )
                }
                className="hover:text-destructive"
                aria-label={`Remove tag ${t}`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
          <Input
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                const t = tagInput.trim();
                if (t && !form.tags.includes(t) && form.tags.length < 50) {
                  patch("tags", [...form.tags, t]);
                }
                setTagInput("");
              }
            }}
            placeholder="Add tag, press Enter"
            className="w-44 h-7 text-xs"
            maxLength={100}
          />
        </div>
      </Section>

      <Separator />

      {Object.keys(errors).length > 0 && (
        <Alert variant="destructive">
          <AlertDescription>
            Please fix the highlighted fields above before saving.
          </AlertDescription>
        </Alert>
      )}

      <div className="flex items-center justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          onClick={() => router.back()}
          disabled={submitting || pending}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={submitting || pending}>
          {(submitting || pending) && (
            <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
          )}
          {!submitting && !pending && <Save className="h-4 w-4 mr-1.5" />}
          {task ? "Save changes" : "Create schedule"}
        </Button>
      </div>
    </form>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Field({
  label,
  htmlFor,
  optional,
  error,
  children,
}: {
  label: string;
  htmlFor?: string;
  optional?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor} className="text-sm">
        {label}
        {optional && (
          <span className="text-xs text-muted-foreground ml-1">(optional)</span>
        )}
      </Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function defaultsFor(type: TriggerType): Record<string, unknown> {
  switch (type) {
    case "one-shot":
      return { at: new Date(Date.now() + 60 * 60 * 1000).toISOString() };
    case "interval":
      return { every_seconds: 3600 };
    case "cron":
      return {
        expression: "0 9 * * 1-5",
        tz: Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC",
      };
    case "heartbeat":
      return { every_seconds: 60 };
    case "context-match":
      return {};
    default:
      return {};
  }
}

function buildTriggerConfig(
  type: TriggerType,
  config: Record<string, unknown>,
): TriggerConfig | null {
  switch (type) {
    case "one-shot":
      if (!config.at) return null;
      return { type, at: String(config.at) };
    case "interval":
    case "heartbeat": {
      const n = Number(config.every_seconds);
      if (!Number.isFinite(n) || n < 60) return null;
      return { type, every_seconds: n };
    }
    case "cron":
      if (!config.expression || !config.tz) return null;
      return {
        type,
        expression: String(config.expression),
        tz: String(config.tz),
      };
    case "context-match": {
      const c = config as {
        kind?: string;
        url_pattern?: string;
        hostname?: string;
      };
      if (!c.kind && !c.url_pattern && !c.hostname) return null;
      return { type, ...c };
    }
    default:
      return null;
  }
}
