"use client";

import { AlertTriangle, Bot, Check, CircleDashed, Clock, History } from "lucide-react";
import { StatusBadge, type StatusTone } from "@/components/official/status-badge/StatusBadge";
import type { CellStatus } from "../model";

const LOOK: Record<CellStatus, { label: string; tone: StatusTone; icon: typeof Check; title: string }> = {
  approved: { label: "Approved", tone: "success", icon: Check, title: "A person approved this rule." },
  agent: { label: "Agent", tone: "info", icon: Bot, title: "Decided by the agent with high confidence." },
  proposed: { label: "Proposed", tone: "warning", icon: Clock, title: "On the wire now; waiting for your review." },
  inherited: { label: "Inherited", tone: "neutral", icon: History, title: "Copied from the old rules; not yet reviewed." },
  missing: { label: "Missing", tone: "danger", icon: CircleDashed, title: "No rule anywhere; the engine computes it." },
};

export function CellStateBadge({ status, size = "sm" }: { status: CellStatus; size?: "sm" | "md" }) {
  const look = LOOK[status];
  return <StatusBadge label={look.label} tone={look.tone} icon={look.icon} size={size} title={look.title} />;
}

export function ConflictBadge({ kind }: { kind: "conflict" | "rejection" }) {
  return (
    <StatusBadge
      label={kind === "conflict" ? "Conflict" : "Rejected"}
      tone="danger"
      icon={AlertTriangle}
      size="sm"
      title={
        kind === "conflict"
          ? "Another source says something different."
          : "A provider rejected a request this rule produced."
      }
    />
  );
}
