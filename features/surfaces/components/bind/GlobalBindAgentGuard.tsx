"use client";

/**
 * GlobalBindAgentGuard
 *
 * Awareness gate shown when someone is about to create a GLOBAL surface
 * binding with a PERSONAL (non-builtin) agent. A global binding broadcasts to
 * every viewer, but `agent.menu_surface` only surfaces agents whose card the
 * viewer can see — so a global bind of a personal agent silently reaches
 * almost nobody, and usually the binder actually meant the agent's linked
 * SYSTEM twin (Linked Agent Sync lineage).
 *
 * Checks, in order (Arman-specified, 2026-07-19):
 *   1. Linked system twin exists → offer it as the primary action.
 *   2. No twin → offer "Linked Agent Sync…" (create a synced system agent /
 *      promote to system) via the existing `agentConvertSystemWindow` overlay.
 *   3. Always: loud visibility note when the agent's card is not public.
 *   4. "Continue with this agent" stays available — awareness, not a block.
 *
 * Builtin agents pass through instantly (onProceed fires, no dialog).
 *
 * Consumers: SurfaceAgentBindPanel (surface-first bind), BindingColumn
 * (per-agent admin shell — passes `onUseSystemTwin` to ROUTE to the twin's
 * surfaces page instead of silently binding a different agent).
 */

import { useEffect, useState } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { fetchLinkedCounterpart } from "@/features/agents/redux/agent-definition/thunks";
import type { LinkedAgentRef } from "@/features/agents/types/agent-definition.types";
import { useOpenAgentConvertSystemWindow } from "@/features/overlays/openers/agentConvertSystemWindow";
import { createClient } from "@/utils/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle, Link2, Loader2, ShieldCheck } from "lucide-react";

interface GuardAudit {
  agentType: string;
  agentName: string;
  cardVisibility: string | null;
  systemTwin: { id: string; name: string } | null;
}

export interface GlobalBindAgentGuardProps {
  open: boolean;
  agentId: string;
  /** Proceed with the ORIGINAL agent (user chose "Continue anyway"). */
  onProceed: (agentId: string) => void;
  /**
   * User chose the linked system twin. Surface-first consumers bind the twin;
   * the per-agent admin shell routes to the twin's surfaces page instead.
   */
  onUseSystemTwin: (twin: { id: string; name: string }) => void;
  onCancel: () => void;
}

export function GlobalBindAgentGuard({
  open,
  agentId,
  onProceed,
  onUseSystemTwin,
  onCancel,
}: GlobalBindAgentGuardProps) {
  const dispatch = useAppDispatch();
  const openConvertSystem = useOpenAgentConvertSystemWindow();
  const [audit, setAudit] = useState<GuardAudit | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setAudit(null);
      setError(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const counterpart = await dispatch(
          fetchLinkedCounterpart(agentId),
        ).unwrap();
        if (!counterpart) throw new Error("Agent not found");
        const { self, source, derived } = counterpart;

        // Builtin agents need no guard — pass straight through.
        if (self.agentType === "builtin") {
          if (!cancelled) onProceed(agentId);
          return;
        }

        const candidates = [source, ...derived].filter(
          Boolean,
        ) as LinkedAgentRef[];
        const twin =
          candidates.find((c) => c.agentType === "builtin") ?? null;

        const sb = createClient();
        const { data: card } = await sb
          .schema("agent")
          .from("card")
          .select("card_visibility")
          .eq("id", agentId)
          .maybeSingle();

        if (!cancelled) {
          setAudit({
            agentType: self.agentType,
            agentName: self.name,
            cardVisibility: card?.card_visibility ?? null,
            systemTwin: twin ? { id: twin.id, name: twin.name } : null,
          });
        }
      } catch (e) {
        if (!cancelled) {
          setError(
            e instanceof Error ? e.message : "Could not audit the agent",
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // onProceed intentionally captured per open cycle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, agentId, dispatch]);

  if (!open) return null;

  const nonPublic = audit != null && audit.cardVisibility !== "public";

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            Global binding with your personal agent
          </DialogTitle>
          <DialogDescription>
            A global binding is offered to every user — but personal agents
            usually shouldn&apos;t be the ones behind it.
          </DialogDescription>
        </DialogHeader>

        {!audit && !error && (
          <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Checking agent lineage…
          </div>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {audit && (
          <div className="space-y-3">
            {audit.systemTwin ? (
              <Alert>
                <ShieldCheck className="h-4 w-4" />
                <AlertDescription>
                  <span className="font-medium">{audit.agentName}</span> has a
                  linked system version:{" "}
                  <span className="font-medium">{audit.systemTwin.name}</span>.
                  Did you mean to bind that one?
                </AlertDescription>
              </Alert>
            ) : (
              <Alert>
                <Link2 className="h-4 w-4" />
                <AlertDescription>
                  <span className="font-medium">{audit.agentName}</span> has no
                  linked system version. For a global binding, create a synced
                  system agent (or promote this one) via Linked Agent Sync.
                </AlertDescription>
              </Alert>
            )}

            {nonPublic && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  This agent&apos;s visibility is{" "}
                  <span className="font-mono">
                    {audit.cardVisibility ?? "unknown"}
                  </span>{" "}
                  — users outside its audience will NOT see this binding even
                  though it is global.
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={onCancel}>
              Cancel
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!audit}
              onClick={() => {
                openConvertSystem({ agentId });
                onCancel();
              }}
              className="gap-1.5"
            >
              <Link2 className="h-3.5 w-3.5" />
              Linked Agent Sync…
            </Button>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={!audit}
              onClick={() => audit && onProceed(agentId)}
            >
              Continue with mine
            </Button>
            {audit?.systemTwin && (
              <Button
                size="sm"
                onClick={() => onUseSystemTwin(audit.systemTwin!)}
              >
                Use system version
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
