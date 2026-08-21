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

import React from "react";
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
            disabled={busy}
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
