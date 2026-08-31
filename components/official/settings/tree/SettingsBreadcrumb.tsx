"use client";

import { Loader2, Slash } from "lucide-react";
import { type SettingsTreeNode, findAncestorPath, findNodeById } from "./types";

type SettingsBreadcrumbProps = {
  nodes: SettingsTreeNode[];
  activeId: string | null;
  /** Root label shown as the first crumb. */
  rootLabel?: string;
  /** Click handler for crumbs — usually navigates via the registry. */
  onNavigate?: (id: string | null) => void;
  /** Disables duplicate navigation and announces the active route change. */
  navigationPending?: boolean;
};

/**
 * Renders a compact breadcrumb trail for the active settings path:
 * "Settings / Appearance / Theme"
 */
export function SettingsBreadcrumb({
  nodes,
  activeId,
  rootLabel = "Settings",
  onNavigate,
  navigationPending = false,
}: SettingsBreadcrumbProps) {
  const ancestors = activeId ? findAncestorPath(nodes, activeId) : [];
  const active = activeId ? findNodeById(nodes, activeId) : null;

  return (
    <nav
      aria-label="Breadcrumb"
      aria-busy={navigationPending}
      className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground"
    >
      <Crumb
        label={rootLabel}
        onClick={onNavigate ? () => onNavigate(null) : undefined}
        interactive
        disabled={navigationPending}
      />
      {ancestors.map((id) => {
        const node = findNodeById(nodes, id);
        if (!node) return null;
        return (
          <span key={id} className="flex items-center gap-1">
            <Slash className="h-3 w-3 opacity-40" />
            <Crumb
              label={node.label}
              onClick={onNavigate ? () => onNavigate(id) : undefined}
              interactive
              disabled={navigationPending}
            />
          </span>
        );
      })}
      {active && (
        <span className="flex items-center gap-1">
          <Slash className="h-3 w-3 opacity-40" />
          <span className="font-medium text-foreground">{active.label}</span>
        </span>
      )}
      {navigationPending ? (
        <Loader2
          className="ml-1 h-3.5 w-3.5 shrink-0 animate-spin"
          aria-label="Opening settings section"
        />
      ) : null}
    </nav>
  );
}

function Crumb({
  label,
  onClick,
  interactive,
  disabled,
}: {
  label: string;
  onClick?: () => void;
  interactive?: boolean;
  disabled?: boolean;
}) {
  if (interactive && onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className="inline-flex min-h-11 items-center transition-colors hover:text-foreground disabled:cursor-wait disabled:opacity-60 sm:min-h-0"
      >
        {label}
      </button>
    );
  }
  return <span>{label}</span>;
}
