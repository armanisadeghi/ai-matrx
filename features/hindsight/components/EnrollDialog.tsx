"use client";

/**
 * EnrollDialog — put an agent, workflow, tool, or environment under continuous
 * review.
 *
 * A half-filled form must NEVER be destroyed by a stray click. Radix dismisses
 * on any pointer-down it judges "outside" — which includes the overlay strip
 * when a tall form overflows a short viewport, and scrollbar drags. Only
 * Cancel, the X, and Escape close this, and the body scrolls internally so the
 * actions stay reachable on a short screen. (Reported bug, fixed here too.)
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { toast } from "@/lib/toast";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { supabase } from "@/utils/supabase/client";

import { enroll, listToolSubjects } from "../api";
import type { EnrollRequest, SubjectKind } from "../types";
import { ENROLLABLE_KINDS, KIND_LABEL } from "./tokens";

type WindowMode = NonNullable<EnrollRequest["window_mode"]>;
type LensVisibility = NonNullable<EnrollRequest["lens_visibility"]>;

/**
 * The lens, in the user's language. Our user is a subject-matter expert, not an
 * engineer: "since_watermark" and "unit_only" mean nothing to them, so each
 * option states what the reviewer will DO, and the hint states the trade.
 */
const WINDOW_MODE_OPTIONS: Array<{
  value: WindowMode;
  label: string;
  hint: string;
}> = [
  {
    value: "since_watermark",
    label: "Everything new since the last review",
    hint: "Nothing is ever reviewed twice, and nothing is skipped.",
  },
  {
    value: "last_n_runs",
    label: "The most recent runs, every time",
    hint: "Always looks at fresh behaviour, even if that means re-reading a run.",
  },
];

const LENS_VISIBILITY_OPTIONS: Array<{
  value: LensVisibility;
  label: string;
  hint: string;
}> = [
  {
    value: "with_context",
    label: "The full picture",
    hint: "Conversations, tool calls, failures and cost — how it got there.",
  },
  {
    value: "unit_only",
    label: "Only what it was asked and what it produced",
    hint: "Hides the machinery so the reviewer judges the results on their own.",
  },
];

interface PickerRow {
  id: string;
  name: string;
}

const ENVIRONMENT_PRESETS: Array<{
  label: string;
  hint: string;
  selector: Record<string, string>;
}> = [
  {
    label: "Sandbox",
    hint: "Agent runs inside an isolated sandbox container",
    selector: { conversation_type: "sandbox" },
  },
  {
    label: "Matrx Local (desktop)",
    hint: "Runs coming from the desktop app's local tools",
    selector: { source_app: "matrx-local" },
  },
  {
    label: "Chrome extension",
    hint: "Browser-agent runs from matrx-extend",
    selector: { source_app: "matrx-extend" },
  },
];

export function EnrollDialog({
  open,
  onOpenChange,
  initialToolName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Deep-linked from a detector assist chip: open straight onto this tool. */
  initialToolName?: string | null;
}) {
  const queryClient = useQueryClient();
  const [kind, setKind] = useState<SubjectKind>(initialToolName ? "tool" : "agent");
  const [search, setSearch] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [toolName, setToolName] = useState(initialToolName ?? "");
  const [envType, setEnvType] = useState("");
  const [envApp, setEnvApp] = useState("");
  const [envFeature, setEnvFeature] = useState("");
  const [everyN, setEveryN] = useState(10);
  const [maxExamples, setMaxExamples] = useState(25);
  const [backfillDays, setBackfillDays] = useState(14);
  const [goal, setGoal] = useState("");
  const [windowMode, setWindowMode] = useState<WindowMode>("since_watermark");
  const [windowN, setWindowN] = useState(25);
  const [lensVisibility, setLensVisibility] =
    useState<LensVisibility>("with_context");

  // Switching kind must not carry a stale selection into the new form — but a
  // deep-linked tool IS the selection, so it survives the initial kind set.
  const deepLinked = useRef(Boolean(initialToolName));
  useEffect(() => {
    if (deepLinked.current) {
      deepLinked.current = false;
      return;
    }
    setSubjectId("");
    setToolName("");
    setSearch("");
  }, [kind]);

  // The dialog is never unmounted, so without this the NEXT open would still
  // hold the last enrollment's subject — with Enroll already enabled, one
  // click away from silently enrolling the wrong thing twice.
  useEffect(() => {
    if (!open) return;
    deepLinked.current = Boolean(initialToolName);
    setKind(initialToolName ? "tool" : "agent");
    setSearch("");
    setSubjectId("");
    setToolName(initialToolName ?? "");
    setEnvType("");
    setEnvApp("");
    setEnvFeature("");
    setEveryN(10);
    setMaxExamples(25);
    setBackfillDays(14);
    setGoal("");
    setWindowMode("since_watermark");
    setWindowN(25);
    setLensVisibility("with_context");
  }, [open, initialToolName]);

  const agents = useQuery<PickerRow[]>({
    queryKey: ["hindsight", "picker", "agent", search],
    queryFn: async () => {
      let q = supabase
        .schema("agent")
        .from("definition")
        .select("id, name")
        .is("deleted_at", null)
        .order("updated_at", { ascending: false })
        .limit(50);
      if (search) q = q.ilike("name", `%${search}%`);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return (data ?? []) as PickerRow[];
    },
    enabled: open && kind === "agent",
  });

  /**
   * Orchestras are not a table — an Orchestra is an orchestrator agent plus its
   * `platform.associations` member edges. So the picker lists the agents that
   * carry the orchestra marker self-edge, which is exactly what the server
   * validates on enroll (a plain agent is refused with the reason).
   */
  const orchestras = useQuery<PickerRow[]>({
    queryKey: ["hindsight", "picker", "orchestra", search],
    queryFn: async () => {
      const { data: markers, error: markerError } = await supabase
        .schema("platform")
        .from("associations")
        .select("source_id")
        .eq("source_type", "agent")
        .eq("target_type", "agent")
        .eq("role", "orchestra")
        .is("deleted_at", null)
        .limit(200);
      if (markerError) throw new Error(markerError.message);
      const ids = Array.from(
        new Set((markers ?? []).map((m) => m.source_id as string)),
      );
      if (ids.length === 0) return [];
      let q = supabase
        .schema("agent")
        .from("definition")
        .select("id, name")
        .in("id", ids)
        .is("deleted_at", null)
        .order("updated_at", { ascending: false })
        .limit(50);
      if (search) q = q.ilike("name", `%${search}%`);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return (data ?? []) as PickerRow[];
    },
    enabled: open && kind === "orchestra",
  });

  const workflows = useQuery<PickerRow[]>({
    queryKey: ["hindsight", "picker", "workflow", search],
    queryFn: async () => {
      let q = supabase
        .schema("workflow")
        .from("definition")
        .select("id, name")
        .is("deleted_at", null)
        .order("updated_at", { ascending: false })
        .limit(50);
      if (search) q = q.ilike("name", `%${search}%`);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return (data ?? []) as PickerRow[];
    },
    enabled: open && kind === "workflow",
  });

  const tools = useQuery({
    queryKey: ["hindsight", "picker", "tool"],
    queryFn: () => listToolSubjects(),
    enabled: open && kind === "tool",
  });

  const enrollMutation = useMutation({
    mutationFn: () => {
      const body: EnrollRequest = {
        subject_kind: kind,
        review_every_n: everyN,
        max_examples_per_review: maxExamples,
        backfill_days: backfillDays,
        window_mode: windowMode,
        // Only meaningful for `last_n_runs`, and the server refuses it
        // otherwise — the mode owns its parameter.
        ...(windowMode === "last_n_runs" ? { window_n: windowN } : {}),
        lens_visibility: lensVisibility,
        ...(goal ? { goal } : {}),
      };
      if (kind === "agent" || kind === "workflow" || kind === "orchestra") {
        body.subject_id = subjectId;
      }
      if (kind === "tool") body.subject_ref = toolName;
      if (kind === "environment") {
        body.subject_selector = {
          ...(envType ? { conversation_type: envType } : {}),
          ...(envApp ? { source_app: envApp } : {}),
          ...(envFeature ? { source_feature: envFeature } : {}),
        };
      }
      return enroll(body);
    },
    onSuccess: (row) => {
      toast.success(`Enrolled ${row.display_name} in Hindsight`);
      queryClient.invalidateQueries({ queryKey: ["hindsight"] });
      onOpenChange(false);
    },
    onError: (err: Error) => toast.error(`Enrollment failed: ${err.message}`),
  });

  const subjectChosen = useMemo(() => {
    if (kind === "agent" || kind === "workflow" || kind === "orchestra") {
      return subjectId.length > 0;
    }
    if (kind === "tool") return toolName.length > 0;
    return Boolean(envType || envApp || envFeature);
  }, [kind, subjectId, toolName, envType, envApp, envFeature]);

  const canSubmit = subjectChosen && !enrollMutation.isPending;

  const rows =
    kind === "agent" ? agents : kind === "orchestra" ? orchestras : workflows;
  const subjectNoun =
    kind === "orchestra" ? "orchestra" : kind === "agent" ? "agent" : "workflow";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex max-h-[85dvh] max-w-lg flex-col overflow-hidden"
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Enroll in Hindsight</DialogTitle>
          <DialogDescription>
            Every N real runs, a reviewer agent reads the actual transcripts and
            proposes fixes across four levers. Enroll the thing you most wish
            worked better.
          </DialogDescription>
        </DialogHeader>

        <div className="-mr-2 min-h-0 flex-1 space-y-4 overflow-y-auto pr-2">
          <div className="space-y-1.5">
            <Label>What kind of thing?</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as SubjectKind)}>
              <SelectTrigger data-testid="hindsight-kind-trigger">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ENROLLABLE_KINDS.map((k) => (
                  <SelectItem key={k} value={k}>
                    {KIND_LABEL[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {(kind === "agent" || kind === "workflow" || kind === "orchestra") && (
            <div className="space-y-1.5">
              <Label>{KIND_LABEL[kind]}</Label>
              {kind === "orchestra" && (
                <p className="text-xs text-muted-foreground">
                  Pick the orchestrator. The reviewer reads its runs and sees the
                  whole team it can delegate to.
                </p>
              )}
              <Input
                placeholder={`Search ${subjectNoun}s…`}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <div className="max-h-44 overflow-y-auto rounded-md border border-border">
                {rows.isLoading && <Skeleton className="m-2 h-6" />}
                {rows.isError && (
                  <p className="p-3 text-sm text-red-600 dark:text-red-400">
                    Could not load {subjectNoun}s: {(rows.error as Error).message}
                  </p>
                )}
                {rows.data?.length === 0 && (
                  <p className="p-3 text-sm text-muted-foreground">
                    {search
                      ? `No ${subjectNoun}s match “${search}”.`
                      : kind === "orchestra"
                        ? "No orchestras exist yet — build one on an agent first."
                        : `No ${subjectNoun}s yet.`}
                  </p>
                )}
                {(rows.data ?? []).map((row) => (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => setSubjectId(row.id)}
                    className={cn(
                      "flex w-full items-center justify-between px-3 py-1.5 text-left text-sm hover:bg-muted",
                      subjectId === row.id && "bg-muted font-medium",
                    )}
                  >
                    <span className="truncate">{row.name}</span>
                    {subjectId === row.id && <Check className="h-4 w-4 shrink-0" />}
                  </button>
                ))}
              </div>
            </div>
          )}

          {kind === "tool" && (
            <div className="space-y-1.5">
              <Label>Tool — ranked by failures in the last 7 days</Label>
              <div className="max-h-44 overflow-y-auto rounded-md border border-border">
                {tools.isLoading && <Skeleton className="m-2 h-6" />}
                {tools.isError && (
                  <p className="p-3 text-sm text-red-600 dark:text-red-400">
                    Could not load tools: {(tools.error as Error).message}
                  </p>
                )}
                {(tools.data ?? []).slice(0, 60).map((t) => (
                  <button
                    key={t.tool_name}
                    type="button"
                    onClick={() => setToolName(t.tool_name)}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm hover:bg-muted",
                      toolName === t.tool_name && "bg-muted font-medium",
                    )}
                  >
                    <span className="truncate font-mono text-xs">{t.tool_name}</span>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                      {t.fails}/{t.calls} failed ({Math.round(t.fail_ratio * 100)}%)
                    </span>
                  </button>
                ))}
                {tools.data?.length === 0 && (
                  <p className="p-3 text-sm text-muted-foreground">
                    No tool dispatches recorded in the last 7 days.
                  </p>
                )}
              </div>
            </div>
          )}

          {kind === "environment" && (
            <div className="space-y-2">
              <Label>Which environment?</Label>
              <div className="flex flex-wrap gap-1.5">
                {ENVIRONMENT_PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    title={preset.hint}
                    onClick={() => {
                      setEnvType(preset.selector.conversation_type ?? "");
                      setEnvApp(preset.selector.source_app ?? "");
                      setEnvFeature(preset.selector.source_feature ?? "");
                    }}
                    className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                An environment is a conversation selector — fill at least one.
              </p>
              <Input
                placeholder="conversation_type (e.g. sandbox)"
                value={envType}
                onChange={(e) => setEnvType(e.target.value)}
              />
              <Input
                placeholder="source_app (e.g. matrx-local, matrx-extend)"
                value={envApp}
                onChange={(e) => setEnvApp(e.target.value)}
              />
              <Input
                placeholder="source_feature"
                value={envFeature}
                onChange={(e) => setEnvFeature(e.target.value)}
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Review every N examples</Label>
              <Input
                type="number"
                min={1}
                max={500}
                value={everyN}
                onChange={(e) => setEveryN(Number(e.target.value) || 10)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Max examples per review</Label>
              <Input
                type="number"
                min={1}
                max={100}
                value={maxExamples}
                onChange={(e) => setMaxExamples(Number(e.target.value) || 25)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Which runs should the reviewer read?</Label>
            <Select
              value={windowMode}
              onValueChange={(v) => setWindowMode(v as WindowMode)}
            >
              <SelectTrigger data-testid="hindsight-window-mode-trigger">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WINDOW_MODE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {
                WINDOW_MODE_OPTIONS.find((o) => o.value === windowMode)?.hint
              }
            </p>
            {windowMode === "last_n_runs" && (
              <div className="space-y-1.5 pt-1">
                <Label>How many recent runs?</Label>
                <Input
                  type="number"
                  min={1}
                  max={500}
                  value={windowN}
                  onChange={(e) => setWindowN(Number(e.target.value) || 25)}
                  data-testid="hindsight-window-n"
                />
                {windowN > maxExamples && (
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    Only {maxExamples} will actually be read — raise “Max
                    examples per review” to {windowN} to read them all.
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>How much of each run should it see?</Label>
            <Select
              value={lensVisibility}
              onValueChange={(v) => setLensVisibility(v as LensVisibility)}
            >
              <SelectTrigger data-testid="hindsight-lens-visibility-trigger">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LENS_VISIBILITY_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {
                LENS_VISIBILITY_OPTIONS.find((o) => o.value === lensVisibility)
                  ?.hint
              }
            </p>
          </div>

          <div className="space-y-1.5">
            <Label>Backfill — count runs from the last N days</Label>
            <Input
              type="number"
              min={0}
              max={365}
              value={backfillDays}
              onChange={(e) => setBackfillDays(Number(e.target.value) || 0)}
            />
            <p className="text-xs text-muted-foreground">
              Starts the watermark in the past so a new enrollment has something
              to review immediately instead of waiting for fresh traffic.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label>Why enroll it? (guides the reviewer)</Label>
            <Textarea
              placeholder='e.g. "This agent burns tool calls searching for provider pages that block scraping — make it reliable."'
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              rows={3}
            />
          </div>
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-border pt-3">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!canSubmit}
            onClick={() => enrollMutation.mutate()}
            data-testid="hindsight-enroll-submit"
          >
            {enrollMutation.isPending ? "Enrolling…" : "Enroll"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
