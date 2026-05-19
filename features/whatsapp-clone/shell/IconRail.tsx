"use client";

import {
  Archive,
  CircleDot,
  Images,
  MessageCircle,
  PhoneIncoming,
  Settings,
  Zap,
  Star,
  Users
} from "lucide-react";
import { IconRailButton } from "./IconRailButton";
import { WAAvatar } from "../shared/WAAvatar";

export type RailKey =
  | "chats"
  | "calls"
  | "status"
  | "channels"
  | "communities"
  | "ai"
  | "archive"
  | "starred"
  | "media"
  | "settings";

interface IconRailProps {
  active: RailKey;
  onSelect: (key: RailKey) => void;
  onSettings: () => void;
  onOpenMedia: () => void;
  unreadChats?: number;
  hasMissedCalls?: boolean;
  userName?: string;
  userAvatarUrl?: string | null;
}

const TOP_ITEMS: Array<{
  key: RailKey;
  icon: typeof MessageCircle;
  label: string;
}> = [
  { key: "chats", icon: MessageCircle, label: "Chats" },
  { key: "calls", icon: PhoneIncoming, label: "Calls" },
  { key: "status", icon: CircleDot, label: "Status" },
  { key: "channels", icon: Zap, label: "Channels" },
  { key: "communities", icon: Users, label: "Communities" },
];

const SECONDARY_ITEMS: Array<{
  key: RailKey;
  icon: typeof Archive;
  label: string;
}> = [
  { key: "archive", icon: Archive, label: "Archived" },
  { key: "starred", icon: Star, label: "Starred messages" },
];

export function IconRail({
  active,
  onSelect,
  onSettings,
  onOpenMedia,
  unreadChats,
  hasMissedCalls,
  userName = "You",
  userAvatarUrl,
}: IconRailProps) {
  return (
    <div className="flex h-full w-[58px] shrink-0 flex-col items-center gap-1 border-r border-border bg-card py-2">
      <div className="flex flex-col items-center gap-1">
        {TOP_ITEMS.map((item) => (
          <IconRailButton
            key={item.key}
            icon={item.icon}
            label={item.label}
            active={active === item.key}
            badge={item.key === "chats" ? unreadChats : undefined}
            hasIndicator={item.key === "calls" ? hasMissedCalls : undefined}
            onClick={() => onSelect(item.key)}
          />
        ))}
      </div>

      <div className="mx-auto my-2 h-px w-7 bg-border" />

      <div className="flex flex-col items-center gap-1">
        {SECONDARY_ITEMS.map((item) => (
          <IconRailButton
            key={item.key}
            icon={item.icon}
            label={item.label}
            active={active === item.key}
            onClick={() => onSelect(item.key)}
          />
        ))}
      </div>

      <div className="flex-1" />

      <div className="flex flex-col items-center gap-2 pb-1">
        <IconRailButton
          icon={Images}
          label="Media, links and docs"
          onClick={onOpenMedia}
        />
        <IconRailButton
          icon={Settings}
          label="Settings"
          onClick={onSettings}
        />
        <button
          type="button"
          aria-label="Profile"
          title={userName}
          className="rounded-full transition hover:ring-2 hover:ring-accent"
        >
          <WAAvatar
            name={userName}
            src={userAvatarUrl}
            size="sm"
            className="h-9 w-9"
          />
        </button>
      </div>
    </div>
  );
}
