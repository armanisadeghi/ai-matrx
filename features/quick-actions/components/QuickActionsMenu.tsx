// features/quick-actions/components/QuickActionsMenu.tsx
"use client";

import React from "react";
import {
  StickyNote,
  LayoutGrid,
  CheckSquare,
  MessageSquare,
  Database,
  FolderOpen,
  NotebookPen,
  Star,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { ZapTapButton } from "@/components/icons/tap-buttons";
import { useQuickActions } from "../hooks/useQuickActions";

export function QuickActionsMenu() {
  const {
    openScratchpad,
    openQuickNotes,
    openQuickTasks,
    openQuickChat,
    openQuickData,
    openQuickFiles,
    openQuickUtilities,
    openQuickChatHistory,
  } = useQuickActions();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <ZapTapButton ariaLabel="Quick actions" tooltip="Quick Actions" />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Quick Access</DropdownMenuLabel>
        <DropdownMenuSeparator />

        {/* Scratchpad Option — the user's always-there notepad */}
        <DropdownMenuItem
          onClick={() => openScratchpad()}
          className="cursor-pointer"
        >
          <NotebookPen className="h-4 w-4 mr-2" />
          <div className="flex flex-col">
            <span>Scratchpad</span>
            <span className="text-xs text-zinc-500">
              Your notepad, everywhere you go
            </span>
          </div>
        </DropdownMenuItem>

        {/* Notes Option */}
        <DropdownMenuItem
          onClick={() => openQuickNotes()}
          className="cursor-pointer"
        >
          <StickyNote className="h-4 w-4 mr-2" />
          <div className="flex flex-col">
            <span>Notes</span>
            <span className="text-xs text-zinc-500">
              Quick capture & retrieve
            </span>
          </div>
        </DropdownMenuItem>

        {/* Tasks Option */}
        <DropdownMenuItem
          onClick={() => openQuickTasks()}
          className="cursor-pointer"
        >
          <CheckSquare className="h-4 w-4 mr-2" />
          <div className="flex flex-col">
            <span>Tasks</span>
            <span className="text-xs text-zinc-500">
              Manage tasks & projects
            </span>
          </div>
        </DropdownMenuItem>

        {/* Chat Option */}
        <DropdownMenuItem
          onClick={() => openQuickChat()}
          className="cursor-pointer"
        >
          <MessageSquare className="h-4 w-4 mr-2" />
          <div className="flex flex-col">
            <span>Chat</span>
            <span className="text-xs text-zinc-500">
              AI conversation assistant
            </span>
          </div>
        </DropdownMenuItem>

        {/* Data Option */}
        <DropdownMenuItem
          onClick={() => openQuickData()}
          className="cursor-pointer"
        >
          <Database className="h-4 w-4 mr-2" />
          <div className="flex flex-col">
            <span>Data</span>
            <span className="text-xs text-zinc-500">View & manage tables</span>
          </div>
        </DropdownMenuItem>

        {/* Files Option */}
        <DropdownMenuItem
          onClick={() => openQuickFiles()}
          className="cursor-pointer"
        >
          <FolderOpen className="h-4 w-4 mr-2" />
          <div className="flex flex-col">
            <span>Files</span>
            <span className="text-xs text-zinc-500">Upload & browse files</span>
          </div>
        </DropdownMenuItem>

        {/* Chat History Option */}
        <DropdownMenuItem
          onClick={() => openQuickChatHistory()}
          className="cursor-pointer"
        >
          <Star className="h-4 w-4 mr-2" />
          <div className="flex flex-col">
            <span>Chat History</span>
            <span className="text-xs text-zinc-500">
              Cross-agent conversation history
            </span>
          </div>
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        {/* Utilities Hub Option */}
        <DropdownMenuItem
          onClick={() => openQuickUtilities()}
          className="cursor-pointer"
        >
          <LayoutGrid className="h-4 w-4 mr-2" />
          <div className="flex flex-col">
            <span>Utilities Hub</span>
            <span className="text-xs text-zinc-500">
              Full view with all tools
            </span>
          </div>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
