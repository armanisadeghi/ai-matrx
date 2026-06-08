"use client";

/**
 * AgentSyncBody
 *
 * Unified panel for the link between a user agent and its system ("builtin")
 * twin. Handles, from either side of the pair:
 *
 *   - Pull  (system → my personal copy) — owner-gated, behavior-only by default
 *   - Push  (user → system)             — super-admin-gated, identity included
 *   - Create my personal copy           — idempotent (opens an existing copy)
 *   - Convert to a new system agent      — when a user agent has no twin yet
 *
 * The DB (`agx_sync_linked_agents`) is the real authority on linkage + write
 * gating; this component only enables/labels the actions. Direction-agnostic by
 * design: the link lives on whichever side was derived, and we resolve the twin
 * from either end via `fetchLinkedCounterpart`.
 */

import { useEffect, useState } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectAgentById } from "@/features/agents/redux/agent-definition/selectors";
import { selectIsSuperAdmin } from "@/lib/redux/selectors/userSelectors";
import {
  fetchLinkedCounterpart,
  syncLinkedAgents,
  createPersonalCopy,
} from "@/features/agents/redux/agent-definition/thunks";
import type {
  LinkedAgentRef,
  LinkedCounterpartResult,
} from "@/features/agents/types/agent-definition.types";
import { ConvertAgentToSystemBody } from "@/features/agents/components/admin/ConvertAgentToSystemBody";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  AlertCircle,
  ArrowDownToLine,
  ArrowUpFromLine,
  Clock,
  Copy,
  ExternalLink,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Unlink,
} from "lucide-react";
import Link from "next/link";
import { toast } from "@/lib/toast-service";
import { cn } from "@/lib/utils";

const SYSTEM_AGENT_ADMIN_BASE_PATH = "/administration/system-agents/agents";
const USER_AGENT_BASE_PATH = "/agents";

interface AgentSyncBodyProps {
  agentId: string;
  onClose: () => void;
}

function formatTimestamp(iso: string | null | undefined): string {
  if (!iso) return "never";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "never";
  return d.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function basePathFor(ref: LinkedAgentRef): string {
  return ref.agentType === "builtin"
    ? SYSTEM_AGENT_ADMIN_BASE_PATH
    : USER_AGENT_BASE_PATH;
}

/**
 * Resolve the (userSide, systemSide) pair around the viewed agent, plus the
 * derived side's last-reconciled timestamp.
 */
function resolvePair(
  selfType: "user" | "builtin",
  counterpart: LinkedCounterpartResult,
): {
  userSide: LinkedAgentRef | null;
  systemSide: LinkedAgentRef | null;
} {
  const { self, source, derived } = counterpart;
  const candidates = [source, ...derived].filter(Boolean) as LinkedAgentRef[];

  if (selfType === "builtin") {
    // Prefer my own user copy; fall back to any visible user-side twin.
    const userSide =
      candidates.find((c) => c.agentType === "user" && c.isOwnedByMe) ??
      candidates.find((c) => c.agentType === "user") ??
      null;
    return { userSide, systemSide: self };
  }

  // self is a user agent — find its system twin.
  const systemSide = candidates.find((c) => c.agentType === "builtin") ?? null;
  return { userSide: self, systemSide };
}

export function AgentSyncBody({ agentId, onClose }: AgentSyncBodyProps) {
  const agent = useAppSelector((state) => selectAgentById(state, agentId));
  const isSuperAdmin = useAppSelector(selectIsSuperAdmin);
  const dispatch = useAppDispatch();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [counterpart, setCounterpart] =
    useState<LinkedCounterpartResult | null>(null);
  const [busy, setBusy] = useState<null | "pull" | "push" | "copy">(null);
  const [pullIdentity, setPullIdentity] = useState(false);

  const selfType: "user" | "builtin" =
    agent?.agentType === "builtin" ? "builtin" : "user";

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await dispatch(fetchLinkedCounterpart(agentId)).unwrap();
      setCounterpart(result);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to resolve linked agent.",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId]);

  const pair = counterpart ? resolvePair(selfType, counterpart) : null;
  const userSide = pair?.userSide ?? null;
  const systemSide = pair?.systemSide ?? null;
  const hasPair = !!userSide && !!systemSide;

  // The reconciliation stamp lives on whichever side was derived.
  const derivedRef =
    userSide && userSide.sourceAgentId === systemSide?.id
      ? userSide
      : systemSide && systemSide.sourceAgentId === userSide?.id
        ? systemSide
        : null;
  const lastSyncedAt = derivedRef?.sourceSnapshotAt ?? null;

  const canPull = !!userSide && (userSide.isOwnedByMe || isSuperAdmin);
  const canPush = isSuperAdmin;

  const runPull = async () => {
    if (!userSide || !systemSide) return;
    setBusy("pull");
    try {
      await dispatch(
        syncLinkedAgents({
          fromId: systemSide.id,
          toId: userSide.id,
          includeIdentity: pullIdentity,
        }),
      ).unwrap();
      toast.success(`Pulled latest into "${userSide.name}".`);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Pull failed.");
    } finally {
      setBusy(null);
    }
  };

  const runPush = async () => {
    if (!userSide || !systemSide) return;
    setBusy("push");
    try {
      await dispatch(
        syncLinkedAgents({
          fromId: userSide.id,
          toId: systemSide.id,
          includeIdentity: true,
        }),
      ).unwrap();
      toast.success(`Pushed "${userSide.name}" to the system agent.`);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Push failed.");
    } finally {
      setBusy(null);
    }
  };

  const runCreateCopy = async () => {
    setBusy("copy");
    try {
      const result = await dispatch(createPersonalCopy(agentId)).unwrap();
      toast.success(
        result.alreadyExisted
          ? "Opened your existing personal copy."
          : "Created your personal copy.",
      );
      await load();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not create personal copy.",
      );
    } finally {
      setBusy(null);
    }
  };

  // ─── Loading / error ─────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-3 py-12 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin text-primary" />
        Resolving linked agent…
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-3 py-2">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button onClick={load} className="gap-1.5">
            <RefreshCw className="w-3.5 h-3.5" />
            Retry
          </Button>
        </div>
      </div>
    );
  }

  // ─── No twin: user agent, super-admin → convert-create flow ──────────────

  if (!hasPair && selfType === "user" && isSuperAdmin) {
    return <ConvertAgentToSystemBody agentId={agentId} onClose={onClose} />;
  }

  // ─── No twin: builtin → create my personal copy ──────────────────────────

  if (!hasPair && selfType === "builtin") {
    return (
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-md border border-border bg-muted/30 px-3 py-2.5">
          <Copy className="w-4 h-4 text-primary mt-0.5 shrink-0" />
          <div className="text-xs leading-relaxed text-muted-foreground">
            Create a personal, editable copy of{" "}
            <span className="font-medium text-foreground">
              {agent?.name ?? "this system agent"}
            </span>
            . Your copy stays linked, so you can pull future updates or (as an
            admin) push your changes back.
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" onClick={runCreateCopy} disabled={busy === "copy"}>
            {busy === "copy" ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
            Create my personal copy
          </Button>
        </div>
      </div>
    );
  }

  // ─── No twin: user agent, not admin ──────────────────────────────────────

  if (!hasPair) {
    return (
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-md border border-border bg-muted/30 px-3 py-2.5">
          <Unlink className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
          <div className="text-xs leading-relaxed text-muted-foreground">
            This agent isn&apos;t linked to a system agent.
          </div>
        </div>
        <div className="flex justify-end">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    );
  }

  // ─── Linked pair: push / pull ────────────────────────────────────────────

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-md border border-border bg-muted/30 px-3 py-2.5">
        <ShieldCheck className="w-4 h-4 text-primary mt-0.5 shrink-0" />
        <div className="text-xs leading-relaxed text-muted-foreground">
          These two agents are linked. Push your personal copy up to the shared
          system agent, or pull the system agent&apos;s latest down into your
          copy.
        </div>
      </div>

      {/* Pair card */}
      <div className="rounded-md border border-border bg-card divide-y divide-border">
        {[userSide, systemSide].map((ref) =>
          ref ? (
            <div key={ref.id} className="flex items-center gap-2 px-3 py-2">
              <Badge
                variant="outline"
                className={cn(
                  "text-[10px] shrink-0",
                  ref.agentType === "builtin"
                    ? "border-primary/40 text-primary"
                    : "text-muted-foreground",
                )}
              >
                {ref.agentType === "builtin" ? "System" : "User copy"}
              </Badge>
              <span className="text-sm font-medium truncate flex-1">
                {ref.name}
              </span>
              {ref.isOwnedByMe && (
                <Badge variant="outline" className="text-[10px] shrink-0">
                  mine
                </Badge>
              )}
              <Button
                asChild
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
                title="Open in new tab"
              >
                <Link
                  href={`${basePathFor(ref)}/${ref.id}/build`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span className="sr-only">Open {ref.name}</span>
                </Link>
              </Button>
            </div>
          ) : null,
        )}
      </div>

      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground px-0.5">
        <Clock className="w-3 h-3 shrink-0" />
        Last synced {formatTimestamp(lastSyncedAt)}
      </div>

      {/* Pull options */}
      {canPull && (
        <div className="flex items-center gap-2 rounded-md border border-border/60 px-3 py-2">
          <Checkbox
            id="pull-identity"
            checked={pullIdentity}
            onCheckedChange={(v) => setPullIdentity(v === true)}
          />
          <Label
            htmlFor="pull-identity"
            className="text-xs font-normal text-muted-foreground cursor-pointer"
          >
            On pull, also overwrite my copy&apos;s name, description &amp; tags
          </Label>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <Button variant="ghost" size="sm" onClick={onClose}>
          Close
        </Button>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={runPull}
            disabled={!canPull || busy !== null}
            className="gap-1.5"
            title={
              canPull
                ? "Overwrite the user copy with the system agent's config"
                : "You can only pull into a copy you own"
            }
          >
            {busy === "pull" ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <ArrowDownToLine className="w-3.5 h-3.5" />
            )}
            Pull from system
          </Button>
          <Button
            size="sm"
            onClick={runPush}
            disabled={!canPush || busy !== null}
            className="gap-1.5"
            title={
              canPush
                ? "Overwrite the system agent with the user copy's config"
                : "Only super admins can push to a system agent"
            }
          >
            {busy === "push" ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <ArrowUpFromLine className="w-3.5 h-3.5" />
            )}
            Push to system
          </Button>
        </div>
      </div>
    </div>
  );
}
