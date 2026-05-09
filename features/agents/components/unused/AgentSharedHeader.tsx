"use client";

import { useState, useTransition } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Eye, Pencil, Play, History, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppSelector } from "@/lib/redux/hooks";
import {
  selectAgentIsDirty,
  selectAgentById,
  selectAgentVersion,
} from "@/features/agents/redux/agent-definition/selectors";
import { AgentListDropdown } from "@/features/agents/components/agent-listings/AgentListDropdown";
import { AgentSaveStatus } from "../shared/AgentSaveStatus";
import { AgentOptionsMenu } from "../shared/AgentOptionsMenu";
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

type AgentPageMode = "view" | "edit" | "run" | "versions";
type ModeOption = AgentPageMode | "new";

const MODES: { id: ModeOption; label: string; icon: typeof Eye }[] = [
  { id: "view", label: "View", icon: Eye },
  { id: "edit", label: "Build", icon: Pencil },
  { id: "run", label: "Run", icon: Play },
  { id: "versions", label: "Versions", icon: History },
  { id: "new", label: "New", icon: Plus },
];

function deriveMode(pathname: string, agentId: string): AgentPageMode {
  const base = `/agents/${agentId}`;
  if (pathname.startsWith(`${base}/run`)) return "run";
  if (pathname.startsWith(`${base}/build`)) return "edit";
  if (
    pathname.startsWith(`${base}/latest`) ||
    /^\/agents\/[^/]+\/\d+$/.test(pathname)
  )
    return "versions";
  return "view";
}

export function AgentSharedHeader({ agentId }: { agentId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [, startTransition] = useTransition();
  const agentName =
    useAppSelector((state) => selectAgentById(state, agentId)?.name) ?? "";
  const version = useAppSelector((state) => selectAgentVersion(state, agentId));
  const isDirty = useAppSelector((state) => selectAgentIsDirty(state, agentId));
  const [showDirtyDialog, setShowDirtyDialog] = useState(false);
  const [pendingNew, setPendingNew] = useState(false);

  const mode = deriveMode(pathname, agentId);

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
        navigateTo("/agents/new");
      }
      return;
    }

    const pathMap: Record<AgentPageMode, string> = {
      view: `/agents/${agentId}`,
      edit: `/agents/${agentId}/build`,
      run: `/agents/${agentId}/run`,
      versions: `/agents/${agentId}/latest`,
    };
    navigateTo(pathMap[next]);
  };

  const handleAgentSelect = (selectedId: string) => {
    const suffixByMode: Record<AgentPageMode, string> = {
      view: "",
      edit: "/build",
      run: "/run",
      versions: "/latest",
    };
    const suffix = suffixByMode[mode];
    navigateTo(`/agents/${selectedId}${suffix}`);
  };

  const handleDirtyDiscard = () => {
    setShowDirtyDialog(false);
    if (pendingNew) {
      setPendingNew(false);
      navigateTo("/agents/new");
    }
  };

  const handleDirtyCancel = () => {
    setShowDirtyDialog(false);
    setPendingNew(false);
  };

  return (
    <>
      <div className="flex items-center justify-between w-full gap-2 px-1">
        <div className="flex items-center gap-2 min-w-0 shrink">
          <AgentListDropdown
            onSelect={handleAgentSelect}
            label={agentName}
            className="max-w-[120px] md:max-w-[180px]"
          />
          {version != null && (
            <span className="text-[0.625rem] font-medium text-[var(--shell-nav-text)] tabular-nums shrink-0">
              v{version}
            </span>
          )}
        </div>

        <div className="matrx-glass-thin-border flex items-center gap-0.5 rounded-full p-0.5">
          {MODES.map(({ id, label, icon: Icon }) => {
            const isActive = id === mode;
            return (
              <button
                key={id}
                onClick={() => handleModeChange(id)}
                title={label}
                className={cn(
                  "flex items-center justify-center gap-1 py-0.5 text-[0.6875rem] font-medium rounded-full transition-colors cursor-pointer",
                  "px-1.5 md:px-2.5",
                  "[&_svg]:w-3.5 [&_svg]:h-3.5",
                  isActive
                    ? "bg-[var(--matrx-glass-bg-active)] text-[var(--shell-nav-text-hover)]"
                    : "text-[var(--shell-nav-text)] hover:text-[var(--shell-nav-text-hover)]",
                )}
              >
                <Icon />
                <span className="hidden md:inline">{label}</span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <AgentSaveStatus agentId={agentId} />
          <div className="w-px h-4 bg-border/50" />
          <AgentOptionsMenu agentId={agentId} />
        </div>
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
            <AlertDialogCancel onClick={handleDirtyCancel}>
              Stay
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleDirtyDiscard}>
              Discard & Continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
