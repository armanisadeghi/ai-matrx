"use client";

import { PartyPopper, Layers, Database } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import type { OverlayId } from "@/features/window-panels/registry/overlay-ids";
import { AgentComingSoonContent } from "@/features/agents/components/coming-soon/AgentComingSoonContent";

// ── Shared wrapper ──────────────────────────────────────────────────────────

interface PlaceholderWindowShellProps {
  isOpen: boolean;
  onClose: () => void;
  agentId?: string | null;
  slug: string;
  overlayId: OverlayId;
  title: string;
  icon: LucideIcon;
  description: string;
  bullets?: string[];
  width?: number;
  height?: number;
}

function PlaceholderWindowShell({
  isOpen,
  onClose,
  agentId,
  slug,
  overlayId,
  title,
  icon,
  description,
  bullets,
  width = 720,
  height = 520,
}: PlaceholderWindowShellProps) {
  if (!isOpen) return null;
  return (
    <WindowPanel
      id={slug}
      title={title}
      onClose={onClose}
      width={width}
      height={height}
      minWidth={420}
      minHeight={320}
      overlayId={overlayId}
    >
      <AgentComingSoonContent
        icon={icon}
        title={title}
        description={description}
        bullets={bullets}
        agentId={agentId ?? null}
      />
    </WindowPanel>
  );
}

// ── User-facing placeholders ───────────────────────────────────────────────

interface PlaceholderProps {
  isOpen: boolean;
  onClose: () => void;
  agentId?: string | null;
}

export function AgentOptimizerWindow(props: PlaceholderProps) {
  return (
    <PlaceholderWindowShell
      {...props}
      slug="agent-optimizer-window"
      overlayId="agentOptimizerWindow"
      title="Matrx Agent Optimizer"
      icon={PartyPopper}
      description="Automated tuning for this agent. Analyzes prompts, variables, and tool usage to suggest concrete improvements."
      bullets={[
        "Prompt quality & clarity scoring",
        "Variable coverage and redundancy checks",
        "Tool selection & parameter suggestions",
        "One-click apply of recommendations",
      ]}
    />
  );
}

export function AgentInterfaceVariationsWindow(props: PlaceholderProps) {
  return (
    <PlaceholderWindowShell
      {...props}
      slug="agent-interface-variations-window"
      overlayId="agentInterfaceVariationsWindow"
      title="Interface Variations"
      icon={Layers}
      description="Try this agent across every surface — modals, sidebars, inline panels, floating bubbles, toasts, and background processes — from one place."
      bullets={[
        "Full Modal · Compact Modal · Inline",
        "Sidebar · Flexible Panel · Floating",
        "Toast · Background · Direct",
        "Side-by-side comparison of layouts",
      ]}
    />
  );
}

// AgentCreateAppWindow used to be a coming-soon placeholder here. It now
// lives in `AgentCreateAppWindow.tsx` with a real implementation, wired
// directly from OverlayController.

export function AgentDataStorageWindow(props: PlaceholderProps) {
  return (
    <PlaceholderWindowShell
      {...props}
      slug="agent-data-storage-window"
      overlayId="agentDataStorageWindow"
      title="Data Storage Support"
      icon={Database}
      description="Give this agent persistent data storage — structured tables, vector memory, and cross-conversation recall."
      bullets={[
        "Typed tables with schema validation",
        "Vector search across conversations",
        "Long-term memory with retention rules",
        "Per-user, per-org, or shared scopes",
      ]}
    />
  );
}

// AgentFindUsagesWindow + AgentAdminFindUsagesWindow used to be coming-soon
// placeholders here. They now live in `AgentFindUsagesWindow.tsx` /
// `AgentAdminFindUsagesWindow.tsx` with real implementations (the find-usages
// + drift detection engine), wired directly from OverlayController.

// ── Admin placeholders ─────────────────────────────────────────────────────

// AgentConvertSystemWindow used to be a coming-soon placeholder here.
// It now lives in `AgentConvertSystemWindow.tsx` with a real implementation,
// wired directly from OverlayController.

// AgentAdminShortcutWindow used to be a coming-soon placeholder here.
// It now lives in `AgentShortcutQuickCreateWindow.tsx` with a real
// implementation, and is wired directly from OverlayController.
