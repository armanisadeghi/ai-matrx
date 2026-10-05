"use client";

import {
  Zap,
  FolderKanban,
  Image,
  Video,
  AudioLines,
  ChevronRight,
  Building,
  ListCheck,
  FileText,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@ai-matrx/design-system";
import { Tile } from "@ai-matrx/design-system/controls";

// ============================================================================
// TYPES
// ============================================================================

interface SidebarActionsProps {
  onNewChat: () => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  newChatHref?: string;
}

// ============================================================================
// PLACEHOLDER DROPDOWN ROW
// ============================================================================

function PlaceholderDropdownRow({
  icon: Icon,
  label,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Tile variant="quiet" icon={<Icon />} title={label} end={<ChevronRight />} />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        side="right"
        sideOffset={8}
        className="w-44"
      >
        <DropdownMenuItem
          disabled
          className="text-[11px] text-muted-foreground"
        >
          Coming soon
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ============================================================================
// SIDEBAR ACTIONS
// ============================================================================

export function SidebarActions({
  onNewChat,
  searchQuery,
  onSearchChange,
  newChatHref = "/demos/chat",
}: SidebarActionsProps) {
  return (
    <div className="px-1.5 py-1">
      {/* Context Setting Dropdowns */}
      <PlaceholderDropdownRow icon={Building} label="Organization" />
      <PlaceholderDropdownRow icon={FolderKanban} label="Project" />
      <PlaceholderDropdownRow icon={ListCheck} label="Tasks" />
    </div>
  );
}

export default SidebarActions;
