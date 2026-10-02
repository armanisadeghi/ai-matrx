"use client";

import { Button } from "@/components/ui/button";
import {
  MessageSquare,
  History,
  Settings,
  ChevronUp,
  ChevronDown,
} from "lucide-react";

interface AssistantControlBarProps {
  isOpen: boolean;
  onToggle: () => void;
  unreadCount?: number;
  heartbeatInterval: number;
  onHeartbeatUp: () => void;
  onHeartbeatDown: () => void;
  onHistoryToggle?: () => void;
  onSettingsToggle?: () => void;
}

export function AssistantControlBar({
  isOpen,
  onToggle,
  unreadCount = 0,
  heartbeatInterval,
  onHeartbeatUp,
  onHeartbeatDown,
  onHistoryToggle,
  onSettingsToggle,
}: AssistantControlBarProps) {
  return (
    <div className="flex items-center gap-1">
      {/* Control icons — visible when the assistant panel is open */}
      {isOpen && (
        <div className="flex items-center gap-0.5 mr-1 animate-in fade-in-0 slide-in-from-right-2 duration-200">
          {/* Heartbeat frequency controls */}
          <div className="flex items-center gap-0 bg-muted/50 rounded-lg border border-border">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={onHeartbeatDown}
              title="Decrease frequency"
            >
              <ChevronDown className="w-3 h-3" />
            </Button>
            <span className="text-[10px] text-muted-foreground tabular-nums w-7 text-center">
              {heartbeatInterval > 0 ? `${heartbeatInterval}s` : "off"}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={onHeartbeatUp}
              title="Increase frequency"
            >
              <ChevronUp className="w-3 h-3" />
            </Button>
          </div>

          {onHistoryToggle && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground"
              onClick={onHistoryToggle}
              title="History"
            >
              <History className="w-3.5 h-3.5" />
            </Button>
          )}

          {onSettingsToggle && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground"
              onClick={onSettingsToggle}
              title="Settings"
            >
              <Settings className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
      )}

      {/* FAB toggle button */}
      <button
        onClick={onToggle}
        className="relative rounded-full p-2.5 shadow-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors focus:outline-none focus:ring-2 focus:ring-primary/50 focus:ring-offset-2"
      >
        <MessageSquare className="w-5 h-5" />
        {unreadCount > 0 && !isOpen && (
          <span className="absolute -top-1 -right-1 flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold rounded-full bg-destructive text-destructive-foreground animate-in zoom-in-50 duration-200">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>
    </div>
  );
}
