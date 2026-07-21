import {
  NotebookPen,
  StickyNote,
  CheckSquare,
  MessageSquare,
  Database,
  FolderOpen,
  Zap,
  Gem,
  Rocket,
  LayoutGrid,
  Megaphone,
  Bug,
  Settings,
  LogOut,
  LogIn,
  Shield,
  Bell,
  UserPlus,
  Lock,
  Mic,
  AudioLines,
  MonitorSpeaker,
  Building2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export const MENU_ICON_REGISTRY = {
  NotebookPen,
  StickyNote,
  CheckSquare,
  MessageSquare,
  Database,
  FolderOpen,
  Zap,
  Gem,
  Rocket,
  LayoutGrid,
  Megaphone,
  Bug,
  Settings,
  LogOut,
  LogIn,
  Shield,
  Bell,
  UserPlus,
  Lock,
  Mic,
  AudioLines,
  MonitorSpeaker,
  Building2,
} as const;

export type MenuIconKey = keyof typeof MENU_ICON_REGISTRY;

export function getMenuIcon(key: MenuIconKey): LucideIcon {
  return MENU_ICON_REGISTRY[key];
}
