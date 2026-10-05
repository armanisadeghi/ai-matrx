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
              icon={<ChevronDown />} aria-label="Decrease frequency"
              variant="quiet"
              onClick={onHeartbeatDown}
              title="Decrease frequency"
            />
            <span className="text-[10px] text-muted-foreground tabular-nums w-7 text-center">
              {heartbeatInterval > 0 ? `${heartbeatInterval}s` : "off"}
            </span>
            <Button
              icon={<ChevronUp />} aria-label="Increase frequency"
              variant="quiet"
              onClick={onHeartbeatUp}
              title="Increase frequency"
            />
          </div>

          {onHistoryToggle && (
            <Button
              icon={<History />} aria-label="History"
              variant="quiet"
              onClick={onHistoryToggle}
              title="History"
            />
          )}

          {onSettingsToggle && (
            <Button
              icon={<Settings />} aria-label="Settings"
              variant="quiet"
              onClick={onSettingsToggle}
              title="Settings"
            />
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
