"use client";

import { useState, useTransition } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import {
  AppWindow,
  Eye,
  History,
  LayoutGrid,
  Pencil,
  Play,
  Plus,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectAgentIsDirty } from "@/features/agents/redux/agent-definition/selectors";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export type AgentPageMode =
  | "view"
  | "edit"
  | "run"
  | "shortcuts"
  | "apps"
  | "versions"
  | "widgets";
export type ModeOption = AgentPageMode | "new";

export const MODES: { id: ModeOption; label: string; icon: typeof Eye }[] = [
  { id: "view", label: "View", icon: Eye },
  { id: "edit", label: "Build", icon: Pencil },
  { id: "run", label: "Run", icon: Play },
  { id: "shortcuts", label: "Shortcuts", icon: Zap },
  { id: "apps", label: "Apps", icon: AppWindow },
  { id: "versions", label: "Versions", icon: History },
  { id: "widgets", label: "Widgets", icon: LayoutGrid },
  { id: "new", label: "New", icon: Plus },
];

/** Shared resolver for `${basePath}/${agentId}/<mode-suffix>` URLs. Exported so
 *  the mobile header + "more" sheet can reuse the same mapping. */
export function getAgentModeHref(
  mode: ModeOption,
  agentId: string,
  basePath: string,
): string {
  if (mode === "new") return `${basePath}/new`;
  const map: Record<AgentPageMode, string> = {
    view: `${basePath}/${agentId}`,
    edit: `${basePath}/${agentId}/build`,
    run: `${basePath}/${agentId}/run`,
    shortcuts: `${basePath}/${agentId}/shortcuts`,
    apps: `${basePath}/${agentId}/apps`,
    versions: `${basePath}/${agentId}/latest`,
    widgets: `${basePath}/${agentId}/widgets`,
  };
  return map[mode];
}

export function deriveAgentMode(
  pathname: string,
  agentId: string,
  basePath: string,
): AgentPageMode {
  const base = `${basePath}/${agentId}`;
  if (pathname.startsWith(`${base}/run`)) return "run";
  if (pathname.startsWith(`${base}/build`)) return "edit";
  if (pathname.startsWith(`${base}/shortcuts`)) return "shortcuts";
  if (pathname.startsWith(`${base}/apps`)) return "apps";
  if (pathname.startsWith(`${base}/widgets`)) return "widgets";
  const versionPattern = new RegExp(
    `^${basePath.replace(/\//g, "\\/")}\\/[^/]+\\/v\\/\\d+$`,
  );
  if (pathname.startsWith(`${base}/latest`) || versionPattern.test(pathname))
    return "versions";
  return "view";
}

type AgentModeControllerProps = {
  agentId: string;
  /** Base path for mode URLs. Defaults to `/agents`. */
  basePath?: string;
  /** SSR-friendly current path. Optional — body uses `usePathname()` when
   *  omitted (which is fine for the active-tab indicator since this is a
   *  client component). Accepted so callers can pass it through without
   *  conditional spreads. */
  currentPath?: string;
};

export function AgentModeController({
  agentId,
  basePath = "/agents",
  currentPath,
}: AgentModeControllerProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [, startTransition] = useTransition();
  const isDirty = useAppSelector((state) => selectAgentIsDirty(state, agentId));
  const [showDirtyDialog, setShowDirtyDialog] = useState(false);
  const [pendingNew, setPendingNew] = useState(false);

  const mode = deriveAgentMode(pathname, agentId, basePath);

  const navigateTo = (path: string) => {
    startTransition(() => router.push(path));
  };

  const handleModeChange = (next: ModeOption) => {
    if (next === mode) return;

    if (next === "new") {
      if (isDirty) {
        setPendingNew(true);
        setShowDirtyDialog(true);
      } else {
        navigateTo(`${basePath}/new`);
      }
      return;
    }

    navigateTo(getAgentModeHref(next, agentId, basePath));
  };

  const getModeHref = (id: ModeOption): string =>
    getAgentModeHref(id, agentId, basePath);

  return (
    <>
      <div className="matrx-glass-thin-border flex items-center gap-0 rounded-full p-0.5">
        {MODES.map(({ id, label, icon: Icon }) => {
          const isActive = id === mode;
          return (
            <Link
              key={id}
              href={getModeHref(id)}
              onClick={(e) => {
                if (e.metaKey || e.ctrlKey) return;
                e.preventDefault();
                handleModeChange(id);
              }}
              title={label}
              className={cn(
                "flex items-center justify-center gap-1 py-0.5 text-[0.6875rem] font-medium rounded-full transition-colors cursor-pointer",
                "px-2.5",
                "[&_svg]:w-3.5 [&_svg]:h-3.5",
                isActive
                  ? "bg-[var(--matrx-glass-bg-active)] text-[var(--shell-nav-text-hover)]"
                  : "text-[var(--shell-nav-text)] hover:text-[var(--shell-nav-text-hover)]",
              )}
            >
              <Icon />
              <span className="hidden xl:inline">{label}</span>
            </Link>
          );
        })}
      </div>

      <AlertDialog open={showDirtyDialog} onOpenChange={setShowDirtyDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unsaved Changes</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes to this agent. If you leave now, your
              changes will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setShowDirtyDialog(false);
                setPendingNew(false);
              }}
            >
              Stay
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setShowDirtyDialog(false);
                if (pendingNew) {
                  setPendingNew(false);
                  navigateTo(`${basePath}/new`);
                }
              }}
            >
              Discard & Continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
