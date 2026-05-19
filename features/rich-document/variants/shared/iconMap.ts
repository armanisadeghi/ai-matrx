// features/rich-document/variants/shared/iconMap.ts
//
// Resolves an `iconName` (string stored in Redux for remote surfaces) back
// to a Lucide component. The action registry stores `LucideIcon` directly
// for in-process use, but specs serialized into Redux lose the function;
// the iconName field is the string label that re-anchors the icon.
//
// We import every icon used by any registered action so the static import
// graph stays analyzable. The list mirrors the icons used across
// actions/handlers/*.ts — if you add a new built-in action with a new
// icon, add it here too.

import {
  // copy
  Copy,
  FileText,
  FileType,
  Brain,
  // save
  Save,
  FileCode,
  CheckSquare,
  // export
  Eye,
  Globe,
  Mail,
  // print
  Printer,
  ScanLine,
  // edit
  Edit,
  History,
  GitBranch,
  Trash2,
  // creator
  BarChart3,
  Activity,
  // feedback
  ThumbsUp,
  ThumbsDown,
  // fullscreen
  Maximize2,
  // stubs
  Briefcase,
  BookText,
  // app
  Bug,
  Megaphone,
  Settings,
  // server-api admin
  GitFork,
  EyeOff,
  ListFilter,
  Scissors,
  Undo2,
  // fallback
  Circle,
  type LucideIcon,
} from "lucide-react";

const ICON_MAP: Record<string, LucideIcon> = {
  Copy,
  FileText,
  FileType,
  Brain,
  Save,
  FileCode,
  CheckSquare,
  Eye,
  Globe,
  Mail,
  Printer,
  ScanLine,
  Edit,
  History,
  GitBranch,
  Trash2,
  BarChart3,
  Activity,
  ThumbsUp,
  ThumbsDown,
  Maximize2,
  Briefcase,
  BookText,
  Bug,
  Megaphone,
  Settings,
  GitFork,
  EyeOff,
  ListFilter,
  Scissors,
  Undo2,
};

export function resolveIcon(iconName: string): LucideIcon {
  return ICON_MAP[iconName] ?? Circle;
}
