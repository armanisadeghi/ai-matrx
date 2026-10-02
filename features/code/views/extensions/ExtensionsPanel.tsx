"use client";

import React, { useEffect, useState } from "react";
import {
  Blocks,
  FileCode,
  FileSearch,
  FolderTree,
  PenLine,
  Terminal as TerminalIcon,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCodeWorkspace } from "../../CodeWorkspaceProvider";
import { listWorkspaceIds, subscribeWorkspace } from "../../runtime/workspaceRegistry";
import { SidePanelHeader } from "../SidePanelChrome";
import { getToolDisplayName } from "@ai-matrx/chat/tool-call-visualization/registry/registry";

interface ExtensionsPanelProps {
  className?: string;
}

interface ToolEntry {
  name: string;
  icon: LucideIcon;
  description: string;
  signature: string;
}

const AGENT_TOOLS: ToolEntry[] = [
  {
    name: "runShellCommand",
    icon: TerminalIcon,
    description:
      "Run a shell command in the active workspace. Output is mirrored into the terminal tab with an agent badge.",
    signature:
      "runShellCommand({ command, cwd?, timeoutSec?, workspaceId? }) → Promise<ProcessResult>",
  },
  {
    name: "readWorkspaceFile",
    icon: FileCode,
    description: "Read file contents via the active filesystem adapter.",
    signature: "readWorkspaceFile({ path, workspaceId? }) → Promise<string>",
  },
  {
    name: "writeWorkspaceFile",
    icon: PenLine,
    description:
      "Overwrite a file's contents. Requires a writable adapter (sandbox).",
    signature:
      "writeWorkspaceFile({ path, content, workspaceId? }) → Promise<void>",
  },
  {
    name: "listWorkspaceDirectory",
    icon: FolderTree,
    description: "Enumerate the immediate children of a directory path.",
    signature:
      "listWorkspaceDirectory({ path, workspaceId? }) → Promise<FilesystemNode[]>",
  },
  {
    name: "openWorkspaceFile",
    icon: FileSearch,
    description:
      "Open a file in the editor, pushing a new tab and setting it active.",
    signature:
      "openWorkspaceFile({ path, language?, workspaceId? }) → Promise<void>",
  },
];

export const ExtensionsPanel: React.FC<ExtensionsPanelProps> = ({
  className,
}) => {
  const { workspaceId } = useCodeWorkspace();
  const [registeredIds, setRegisteredIds] = useState<string[]>(() =>
    listWorkspaceIds(),
  );

  useEffect(() => {
    // Re-poll on any workspace change for this id — lightweight; registry is small.
    const unsub = subscribeWorkspace(workspaceId, () => {
      setRegisteredIds(listWorkspaceIds());
    });
    return unsub;
  }, [workspaceId]);

  return (
    <div className={cn("flex h-full min-h-0 flex-col", className)}>
      <SidePanelHeader
        title="Agent Tools"
        subtitle={`workspace: ${workspaceId}`}
      />
      <div className="flex-1 overflow-y-auto">
        <div className="border-b border-neutral-200 p-3 text-[11px] text-neutral-600 dark:border-neutral-800 dark:text-neutral-400">
          <div className="flex items-start gap-2">
            <Blocks size={14} className="mt-[2px] shrink-0 text-neutral-500" />
            <div>
              These are the programmatic tools agent runners can call against
              this workspace. Import them from{" "}
              <code className="font-mono">@/features/code</code>.
              <div className="mt-1 text-[10px] text-neutral-500">
                Registered workspaces: {registeredIds.join(", ") || "none"}
              </div>
            </div>
          </div>
        </div>
        {AGENT_TOOLS.map((tool) => (
          <div
            key={tool.name}
            className="border-b border-neutral-100 px-3 py-2 dark:border-neutral-900"
          >
            <div className="flex items-center gap-1.5 text-[12px] font-medium text-neutral-800 dark:text-neutral-100">
              <tool.icon size={12} className="text-neutral-500" />
              {getToolDisplayName(tool.name)}
            </div>
            <div className="mt-0.5 text-[11px] text-neutral-500 dark:text-neutral-400">
              {tool.description}
            </div>
            <code className="mt-1 block whitespace-pre-wrap break-words font-mono text-[10px] text-neutral-500 dark:text-neutral-400">
              {tool.signature}
            </code>
          </div>
        ))}
      </div>
    </div>
  );
};
