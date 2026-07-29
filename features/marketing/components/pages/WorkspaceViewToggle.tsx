"use client";

// The three-state view control for the marketing page workspace (Arman,
// ratified 2026-07-29): **Current** shows only observed/evidence cards,
// **Plan** shows only desired/entry cards, **Studio** shows both as a split
// view (Current left, Plan right). The names are canonical UI vocabulary —
// do not rename without a ruling.

import { useCallback, useState } from "react";
import { Columns2, Eye, PenLine } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

export type WorkspaceViewMode = "current" | "plan" | "studio";

const STORAGE_KEY = "matrx:marketing-page-view-mode";

function isWorkspaceViewMode(value: unknown): value is WorkspaceViewMode {
  return value === "current" || value === "plan" || value === "studio";
}

/**
 * Style-only local preference (search/filter state never persists — this is
 * how the user likes to LOOK at page workspaces, shared across all pages).
 * Defaults: Studio on desktop, Current on mobile, until the user chooses.
 */
export function useWorkspaceViewMode(): [
  WorkspaceViewMode,
  (mode: WorkspaceViewMode) => void,
] {
  const isMobile = useIsMobile();
  const [stored, setStored] = useState<WorkspaceViewMode | null>(() => {
    if (typeof window === "undefined") return null;
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return isWorkspaceViewMode(raw) ? raw : null;
  });
  // Derived, not synced: with no stored preference the default follows the
  // viewport (useIsMobile flips on after mount) — no effect, no re-render loop.
  const mode: WorkspaceViewMode = stored ?? (isMobile ? "current" : "studio");

  const choose = useCallback((next: WorkspaceViewMode) => {
    setStored(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Storage unavailable (private mode) — the choice still applies live.
    }
  }, []);

  return [mode, choose];
}

const OPTIONS: Array<{
  value: WorkspaceViewMode;
  label: string;
  title: string;
  icon: typeof Eye;
}> = [
  {
    value: "current",
    label: "Current",
    title: "Current — everything observed on the page today",
    icon: Eye,
  },
  {
    value: "plan",
    label: "Plan",
    title: "Plan — everything you intend: targets, drafts, tasks",
    icon: PenLine,
  },
  {
    value: "studio",
    label: "Studio",
    title: "Studio — Current and Plan side by side",
    icon: Columns2,
  },
];

export function WorkspaceViewToggle({
  mode,
  onChange,
  className,
}: {
  mode: WorkspaceViewMode;
  onChange: (mode: WorkspaceViewMode) => void;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label="Workspace view"
      className={cn(
        "flex items-center rounded-md border border-border bg-card",
        className,
      )}
    >
      {OPTIONS.map(({ value, label, title, icon: Icon }, index) => (
        <button
          key={value}
          type="button"
          onClick={() => onChange(value)}
          aria-pressed={mode === value}
          title={title}
          className={cn(
            "flex h-8 items-center gap-1.5 px-2.5 text-xs font-medium transition-colors",
            index === 0 && "rounded-l-[5px]",
            index === OPTIONS.length - 1 && "rounded-r-[5px]",
            mode === value
              ? "bg-muted text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Icon className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">{label}</span>
        </button>
      ))}
    </div>
  );
}
