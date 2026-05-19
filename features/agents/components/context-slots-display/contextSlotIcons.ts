import {
  Type,
  Braces,
  Link2,
  Database,
  User,
  Building2,
  Briefcase,
  FolderKanban,
  CheckSquare,
  AtSign,
  Boxes,
  type LucideIcon,
} from "lucide-react";
import type { ContextObjectType } from "@/features/agents/types/agent-api-types";

export const CONTEXT_TYPE_ICON: Record<ContextObjectType, LucideIcon> = {
  text: Type,
  json: Braces,
  file_url: Link2,
  db_ref: Database,
  user: User,
  org: Building2,
  workspace: Briefcase,
  project: FolderKanban,
  task: CheckSquare,
  variable: AtSign,
};

export const FALLBACK_CONTEXT_ICON: LucideIcon = Boxes;

export const CONTEXT_TYPE_CHIP_CLASS: Record<ContextObjectType, string> = {
  text: "bg-blue-50 text-blue-700 border-blue-300 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-700",
  json: "bg-purple-50 text-purple-700 border-purple-300 dark:bg-purple-950/30 dark:text-purple-400 dark:border-purple-700",
  file_url:
    "bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-700",
  db_ref:
    "bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-700",
  user: "bg-rose-50 text-rose-700 border-rose-300 dark:bg-rose-950/30 dark:text-rose-400 dark:border-rose-700",
  org: "bg-indigo-50 text-indigo-700 border-indigo-300 dark:bg-indigo-950/30 dark:text-indigo-400 dark:border-indigo-700",
  workspace:
    "bg-violet-50 text-violet-700 border-violet-300 dark:bg-violet-950/30 dark:text-violet-400 dark:border-violet-700",
  project:
    "bg-cyan-50 text-cyan-700 border-cyan-300 dark:bg-cyan-950/30 dark:text-cyan-400 dark:border-cyan-700",
  task: "bg-pink-50 text-pink-700 border-pink-300 dark:bg-pink-950/30 dark:text-pink-400 dark:border-pink-700",
  variable:
    "bg-slate-50 text-slate-700 border-slate-300 dark:bg-slate-900/40 dark:text-slate-300 dark:border-slate-700",
};
