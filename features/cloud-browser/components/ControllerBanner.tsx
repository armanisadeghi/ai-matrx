"use client";

/**
 * ControllerBanner — the visible controller banner (PLAN §Human control protocol).
 *
 * Always states WHO is driving (agent / me / another person / system) and offers
 * the accessible, non-canvas control: Take control, Return control, or Request
 * control when someone else holds it. There are never two input paths.
 *
 * Take control is available WHENEVER the browser is live (Arman 2026-08-21) —
 * it is not gated on the agent having asked for a person. Clicking it is
 * non-disruptive by default: the banner shows that the agent is being told and
 * offers the immediate escape, mirroring the composer's steer/interrupt duality
 * (`useCloudBrowserTakeover`).
 */

import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/cn";
import {
  Cpu,
  User,
  Cog,
  Hand,
  LogOut,
  MousePointerClick,
  Zap,
} from "lucide-react";
import type { ControllerState } from "../types";

/**
 * How long a button that just CHANGED MEANING under the cursor ignores clicks.
 *
 * Found live 2026-09-13: in the steer flow the person's cursor is on "Take over
 * immediately" at exactly the moment the agent reaches its boundary and control
 * arrives — and "Return control" renders in that same spot. Their click did the
 * OPPOSITE of what they meant (control went straight back to the agent). The
 * same morph turns a double-click on "Take control" into a return. A short
 * guard makes that click a no-op instead of a reversal.
 */
export const MORPH_GUARD_MS = 1200;

function useGuardAfterChange(changeKey: string | null): boolean {
  const [guarded, setGuarded] = useState(false);
  useEffect(() => {
    if (changeKey === null) return;
    setGuarded(true);
    const timer = window.setTimeout(() => setGuarded(false), MORPH_GUARD_MS);
    return () => window.clearTimeout(timer);
  }, [changeKey]);
  return guarded;
}

export function ControllerBanner({
  controller,
  onTake,
  onReturn,
  onRequest,
  canTake = false,
  /** A takeover is in motion: the agent is being told, control has not moved. */
  waitingForAgent = false,
  onTakeImmediately,
  busy,
  className,
}: {
  controller: ControllerState | null;
  onTake: () => void;
  onReturn: () => void;
  onRequest?: () => void;
  canTake?: boolean;
  waitingForAgent?: boolean;
  onTakeImmediately?: () => void;
  busy?: boolean;
  className?: string;
}) {
  // Hooks before any early return. Keyed on the control revision so it fires
  // each time control arrives with THIS person, not just on first mount.
  const returnGuarded = useGuardAfterChange(
    controller?.kind === "human" && controller.isMe
      ? `me:${controller.controlRevision}`
      : null,
  );

  if (!controller) return null;

  const { kind, isMe, displayName, pendingRequestFrom } = controller;

  let icon = <Cpu className="h-4 w-4" aria-hidden />;
  let label = "The agent is driving.";
  let tone = "border-border bg-muted";

  if (kind === "human" && isMe) {
    icon = <User className="h-4 w-4 text-primary" aria-hidden />;
    label = "You are driving this browser.";
    tone = "border-primary/40 bg-primary/10";
  } else if (kind === "human") {
    icon = <User className="h-4 w-4 text-amber-500" aria-hidden />;
    label = `${displayName ?? "Someone"} is driving this browser.`;
    tone = "border-amber-500/40 bg-amber-500/10";
  } else if (kind === "system") {
    icon = <Cog className="h-4 w-4 text-muted-foreground" aria-hidden />;
    label = "The system is running a maintenance step.";
  }

  // While the agent is being told, the wait IS the banner — one message, one
  // way out. Never a bare spinner.
  if (waitingForAgent) {
    return (
      <div
        role="status"
        aria-live="polite"
        className={cn(
          "flex flex-wrap items-center justify-between gap-2 rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-sm",
          className,
        )}
      >
        <span className="flex items-center gap-2 font-medium text-foreground">
          <MousePointerClick className="h-4 w-4 text-primary" aria-hidden />
          Please wait while we tell your agent you&apos;re taking over.
        </span>
        {onTakeImmediately ? (
          <Button size="sm" variant="outline" onClick={onTakeImmediately}>
            <Zap className="mr-1.5 h-3.5 w-3.5" />
            Take over immediately
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm",
        tone,
        className,
      )}
    >
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1 font-medium text-foreground">
        {icon}
        {label}
        {/* The one person who can grant a queued request is the one driving. */}
        {isMe && pendingRequestFrom ? (
          <span className="text-xs font-normal text-muted-foreground">
            {pendingRequestFrom.displayName} asked to take over — return control
            to hand it to them.
          </span>
        ) : null}
      </span>

      <div className="flex items-center gap-2">
        {kind === "human" && isMe ? (
          <Button
            size="sm"
            variant={pendingRequestFrom ? "default" : "outline"}
            onClick={onReturn}
            disabled={busy || returnGuarded}
          >
            <LogOut className="mr-1.5 h-3.5 w-3.5" />
            Return control
          </Button>
        ) : kind === "human" && !isMe ? (
          <Button
            size="sm"
            variant="outline"
            onClick={onRequest}
            disabled={busy || !onRequest}
          >
            <Hand className="mr-1.5 h-3.5 w-3.5" />
            Request control
          </Button>
        ) : canTake ? (
          <Button size="sm" onClick={onTake} disabled={busy}>
            <MousePointerClick className="mr-1.5 h-3.5 w-3.5" />
            Take control
          </Button>
        ) : null}
      </div>
    </div>
  );
}
