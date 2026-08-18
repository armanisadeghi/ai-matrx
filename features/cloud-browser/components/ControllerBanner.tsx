"use client";

/**
 * ControllerBanner — the visible controller banner (PLAN §Human control protocol).
 *
 * Always states WHO is driving (agent / me / another person / system) and offers
 * the accessible, non-canvas control: Take control, Return control, or Request
 * control when someone else holds it. There are never two input paths.
 */

import React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/cn";
import { Bot, User, Cog, Hand, LogOut, MousePointerClick } from "lucide-react";
import type { ControllerState } from "../types";

export function ControllerBanner({
  controller,
  onTake,
  onReturn,
  onRequest,
  busy,
  className,
}: {
  controller: ControllerState | null;
  onTake: () => void;
  onReturn: () => void;
  onRequest?: () => void;
  busy?: boolean;
  className?: string;
}) {
  if (!controller) return null;

  const { kind, isMe, displayName } = controller;

  let icon = <Bot className="h-4 w-4" aria-hidden />;
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

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm",
        tone,
        className,
      )}
    >
      <span className="flex items-center gap-2 font-medium text-foreground">
        {icon}
        {label}
      </span>

      <div className="flex items-center gap-2">
        {kind === "human" && isMe ? (
          <Button size="sm" variant="outline" onClick={onReturn} disabled={busy}>
            <LogOut className="mr-1.5 h-3.5 w-3.5" />
            Return control
          </Button>
        ) : kind === "human" && !isMe ? (
          <Button size="sm" variant="outline" onClick={onRequest ?? onTake} disabled={busy}>
            <Hand className="mr-1.5 h-3.5 w-3.5" />
            Request control
          </Button>
        ) : (
          <Button size="sm" onClick={onTake} disabled={busy}>
            <MousePointerClick className="mr-1.5 h-3.5 w-3.5" />
            Take control
          </Button>
        )}
      </div>
    </div>
  );
}
