"use client";

/**
 * DesktopPresenceIndicator — small passive badge in the smart-input toolbar
 * shown ONLY while the user's matrx-local desktop engine is online
 * (app_instances heartbeat). Signals that this turn will declare the
 * `desktop-native` capability, i.e. the agent can delegate desktop tools
 * (files, shell, windows, media, …) to that machine.
 *
 * Renders nothing when no desktop is live — absence is the "off" state, the
 * same rule the capability provider follows.
 */

import React from "react";
import { Laptop } from "lucide-react";
import { useDesktopPresence } from "@/features/agents/hooks/useDesktopPresence";

export function DesktopPresenceIndicator() {
  const desktop = useDesktopPresence();
  if (!desktop) return null;

  return (
    <span
      title={`Desktop connected — the agent can run tools on "${desktop.instanceName}"`}
      aria-label={`Desktop connected: ${desktop.instanceName}`}
      className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground/60"
    >
      <Laptop className="h-4 w-4" />
      <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-emerald-500" />
    </span>
  );
}
