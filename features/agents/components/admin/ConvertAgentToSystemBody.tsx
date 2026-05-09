"use client";

/**
 * ConvertAgentToSystemBody
 *
 * Step-based flow for promoting an agent to a system ("builtin") agent or
 * updating an existing one. Mirrors the legacy prompt `ConvertToBuiltinModal`
 * but simplified: system agents live in the same `agx_agent` table with
 * `agent_type = 'builtin'`, and there's no separate shortcut linking step.
 *
 * Flow:
 *   checking  → builtin-choice  → processing  → complete
 *                       └── (no existing)──────┘
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectAgentById } from "@/features/agents/redux/agent-definition/selectors";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Clock,
  ExternalLink,
  Loader2,
  Plus,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { toast } from "@/lib/toast-service";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type FlowStep =
  | "checking"
  | "builtin-choice"
  | "processing"
  | "complete"
  | "error";

interface SystemAgentSummary {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  tags: string[] | null;
  version: number;
  source_agent_id: string | null;
  source_snapshot_at: string | null;
  created_at: string;
  updated_at: string;
  variable_definitions: unknown;
}

interface ConvertAgentToSystemBodyProps {
  agentId: string;
  onClose: () => void;
}

// Every system agent is administered through the system-agents admin route
// family. Linking to `/agents/{id}` from this flow drops the user back into
// the personal-agents shell where edits look like they're touching a
// different object than what they just promoted — that's the bug Arman saw
// after a successful convert.
const SYSTEM_AGENT_ADMIN_BASE_PATH = "/administration/system-agents/agents";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTimestamp(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ConvertAgentToSystemBody({
  agentId,
  onClose,
}: ConvertAgentToSystemBodyProps) {
  const agent = useAppSelector((state) => selectAgentById(state, agentId));
  const agentName = agent?.name ?? "this agent";

  const [step, setStep] = useState<FlowStep>("checking");
  const [error, setError] = useState<string | null>(null);
  const [existing, setExisting] = useState<SystemAgentSummary[]>([]);
  const [selectedExistingId, setSelectedExistingId] = useState<string | null>(
    null,
  );
  const [action, setAction] = useState<"update" | "create-new">("create-new");
  const [resultId, setResultId] = useState<string | null>(null);
  const [resultIsUpdate, setResultIsUpdate] = useState(false);

  const hasExisting = existing.length > 0;
  const selectedExisting = useMemo(
    () => existing.find((e) => e.id === selectedExistingId) ?? null,
    [existing, selectedExistingId],
  );

  const fetchExisting = useCallback(async () => {
    setError(null);
    setStep("checking");
    try {
      const res = await fetch(
        `/api/admin/agent-builtins/by-source?source_agent_id=${encodeURIComponent(agentId)}`,
        { cache: "no-store" },
      );
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(
          payload.error ?? `Failed to check for existing system agents`,
        );
      }
      const body = (await res.json()) as {
        system_agents: SystemAgentSummary[];
      };
      const rows = body.system_agents ?? [];
      setExisting(rows);
      if (rows.length > 0) {
        setSelectedExistingId(rows[0].id);
        setAction("update");
      } else {
        setSelectedExistingId(null);
        setAction("create-new");
      }
      setStep("builtin-choice");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unexpected error while checking";
      setError(message);
      setStep("error");
    }
  }, [agentId]);

  useEffect(() => {
    fetchExisting();
  }, [fetchExisting]);

  const handleSubmit = useCallback(async () => {
    if (action === "update" && !selectedExistingId) return;

    setError(null);
    setStep("processing");

    try {
      const res = await fetch("/api/admin/agent-builtins/convert-from-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agent_id: agentId,
          system_agent_id: action === "update" ? selectedExistingId : undefined,
        }),
      });

      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload.error ?? `Operation failed (${res.status})`);
      }

      const body = (await res.json()) as {
        system_agent_id: string;
        is_update: boolean;
      };

      setResultId(body.system_agent_id);
      setResultIsUpdate(body.is_update);
      toast.success(
        body.is_update
          ? "System agent updated successfully"
          : "System agent created successfully",
      );
      setStep("complete");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unexpected error during save";
      setError(message);
      setStep("builtin-choice");
    }
  }, [action, agentId, selectedExistingId]);

  // ─── Renderers ──────────────────────────────────────────────────────────────

  const renderChecking = (
    <div className="flex items-center justify-center gap-3 py-12 text-sm text-muted-foreground">
      <Loader2 className="w-4 h-4 animate-spin text-primary" />
      Checking for existing system agents…
    </div>
  );

  const renderError = (
    <div className="space-y-3 py-2">
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>{error}</AlertDescription>
      </Alert>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>
          Close
        </Button>
        <Button onClick={fetchExisting} variant="default" className="gap-1.5">
          <RefreshCw className="w-3.5 h-3.5" />
          Retry
        </Button>
      </div>
    </div>
  );

  const renderChoice = (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-md border border-border bg-muted/30 px-3 py-2.5">
        <ShieldCheck className="w-4 h-4 text-primary mt-0.5 shrink-0" />
        <div className="text-xs leading-relaxed text-muted-foreground">
          <span className="font-medium text-foreground">{agentName}</span> will
          be copied into the system agent library. System agents are visible to
          every user across the platform.
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <RadioGroup
        value={action}
        onValueChange={(v) => setAction(v as "update" | "create-new")}
        className="space-y-2"
      >
        <div
          className={cn(
            "rounded-md border p-3",
            hasExisting
              ? action === "update"
                ? "border-primary/60 bg-primary/5"
                : "border-border"
              : "border-border/60 opacity-60",
          )}
        >
          <div className="flex items-center gap-2">
            <RadioGroupItem
              value="update"
              id="convert-update"
              disabled={!hasExisting}
            />
            <Label
              htmlFor="convert-update"
              className="flex-1 text-sm font-medium cursor-pointer"
            >
              Update existing system agent
              {!hasExisting && (
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  (none found)
                </span>
              )}
            </Label>
            <RefreshCw className="w-3.5 h-3.5 text-muted-foreground" />
          </div>

          {hasExisting && action === "update" && (
            <ScrollArea className="mt-3 max-h-44 pr-2">
              <div className="space-y-1.5">
                {existing.map((row) => {
                  const isSelected = selectedExistingId === row.id;
                  return (
                    <div
                      key={row.id}
                      className={cn(
                        "flex gap-1.5 rounded-md border transition-colors",
                        isSelected
                          ? "border-primary bg-primary/10"
                          : "border-border bg-card",
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => setSelectedExistingId(row.id)}
                        className={cn(
                          "min-w-0 flex-1 text-left px-3 py-2 rounded-l-md transition-colors",
                          !isSelected && "hover:bg-muted/40",
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium truncate flex-1">
                            {row.name}
                          </span>
                          <Badge variant="outline" className="text-[10px]">
                            v{row.version}
                          </Badge>
                        </div>
                        <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                          <Clock className="w-3 h-3 shrink-0" />
                          last snapshot{" "}
                          {formatTimestamp(
                            row.source_snapshot_at ?? row.updated_at,
                          )}
                        </div>
                      </button>
                      <Button
                        asChild
                        variant="ghost"
                        size="icon"
                        className="h-auto min-h-10 w-9 shrink-0 rounded-l-none rounded-r-md text-muted-foreground hover:text-foreground"
                        title="Open system agent in new tab"
                      >
                        <Link
                          href={`${SYSTEM_AGENT_ADMIN_BASE_PATH}/${row.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          <span className="sr-only">
                            Open {row.name} in new tab
                          </span>
                        </Link>
                      </Button>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </div>

        <div
          className={cn(
            "rounded-md border p-3",
            action === "create-new"
              ? "border-primary/60 bg-primary/5"
              : "border-border",
          )}
        >
          <div className="flex items-center gap-2">
            <RadioGroupItem value="create-new" id="convert-create" />
            <Label
              htmlFor="convert-create"
              className="flex-1 text-sm font-medium cursor-pointer"
            >
              Create a new system agent
            </Label>
            <Plus className="w-3.5 h-3.5 text-muted-foreground" />
          </div>
          <p className="mt-1.5 pl-6 text-xs text-muted-foreground">
            Adds a brand-new System Agent. Use this when there's no prior system
            agent linked to this source.
          </p>
        </div>
      </RadioGroup>

      <div className="flex justify-end gap-2 pt-1">
        <Button variant="ghost" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button
          size="sm"
          onClick={handleSubmit}
          disabled={action === "update" && !selectedExistingId}
          className="gap-1.5"
        >
          {action === "update" ? (
            <>
              <RefreshCw className="w-3.5 h-3.5" />
              Update system agent
            </>
          ) : (
            <>
              <Plus className="w-3.5 h-3.5" />
              Create system agent
            </>
          )}
          <ArrowRight className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );

  const renderProcessing = (
    <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
      <Loader2 className="w-5 h-5 animate-spin text-primary" />
      <div className="text-sm text-foreground">
        {action === "update"
          ? "Updating system agent…"
          : "Creating system agent…"}
      </div>
      <p className="text-xs text-muted-foreground max-w-xs">
        Copying definition, messages, variables, tools, and settings.
      </p>
    </div>
  );

  const renderComplete = (
    <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
      <div className="flex items-center justify-center w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-500">
        <CheckCircle2 className="w-6 h-6" />
      </div>
      <div className="space-y-1">
        <div className="text-sm font-medium text-foreground">
          {resultIsUpdate ? "System agent updated" : "System agent created"}
        </div>
        <p className="text-xs text-muted-foreground max-w-sm">
          {resultIsUpdate
            ? "The existing system agent has been refreshed with the latest definition."
            : "A new system agent is now available to every user on the platform."}
        </p>
      </div>

      <div className="flex items-center gap-2 pt-2">
        {resultId && (
          <Button asChild variant="outline" size="sm" className="gap-1.5">
            <Link
              href={`${SYSTEM_AGENT_ADMIN_BASE_PATH}/${resultId}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={onClose}
            >
              <ExternalLink className="w-3.5 h-3.5" />
              View system agent
            </Link>
          </Button>
        )}
        <Button size="sm" onClick={onClose}>
          Done
        </Button>
      </div>
    </div>
  );

  return (
    <div className="p-4">
      {step === "checking" && renderChecking}
      {step === "error" && renderError}
      {step === "builtin-choice" && renderChoice}
      {step === "processing" && renderProcessing}
      {step === "complete" && renderComplete}
    </div>
  );
}
