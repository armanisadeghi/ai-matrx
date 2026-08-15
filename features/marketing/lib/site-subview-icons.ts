/**
 * One icon per site SUB-VIEW, keyed `"<section>:<viewId>"`.
 *
 * The site header renders the active section's sub-views, and `RouteModeNav`
 * only reaches its compact icon variant when every item has an icon — without
 * these, a seven-item set collapses straight to a dropdown on a narrow window,
 * which is the failure this whole rework exists to remove.
 *
 * Same reasoning as `site-section-icons.ts`: kept out of the shell's curated
 * `shellIconMap` because these are marketing-only and that registry is carried
 * by every consumer.
 */

import {
  BookOpen,
  Briefcase,
  Building2,
  CircleDashed,
  ClipboardList,
  Columns3,
  FileSearch,
  FileText,
  Film,
  FlaskConical,
  FolderOpen,
  Globe,
  History,
  ImageDown,
  ImagePlus,
  LayoutDashboard,
  Lightbulb,
  Link2,
  ListTree,
  Map,
  MessageSquareQuote,
  Network,
  Newspaper,
  Radar,
  Route,
  Ruler,
  Swords,
  Table2,
  Tags,
  TrendingUp,
  Type,
  Users,
  type LucideIcon,
} from "lucide-react";

export const MARKETING_SUBVIEW_ICONS: Record<string, LucideIcon> = {
  "structure:tree": ListTree,
  "structure:columns": Columns3,

  "media:crawled": Globe,
  "media:videos": Film,
  "media:library": FolderOpen,
  "media:research": Lightbulb,
  "media:sources": ImageDown,
  "media:generate": ImagePlus,
  "media:standards": Ruler,

  "links:graph": Network,
  "links:external": Globe,
  "links:plan": ClipboardList,
  "links:table": Table2,

  "authority:map": Map,
  "authority:routes": Route,
  "authority:evidence": FileSearch,

  "backlinks:overview": LayoutDashboard,
  "backlinks:links": Link2,
  "backlinks:domains": Globe,
  "backlinks:anchors": Type,
  "backlinks:pages": FileText,
  "backlinks:competitors": Swords,
  "backlinks:insights": Lightbulb,

  "changes:tracked": FlaskConical,
  "changes:untracked": CircleDashed,

  "reputation:brief": FileText,
  "reputation:cases": Briefcase,
  "reputation:publications": Newspaper,
  "reputation:narratives": MessageSquareQuote,
  "reputation:evidence": FileSearch,

  "keywords:performance": TrendingUp,
  "keywords:classification": Tags,

  "ai-visibility:overview": LayoutDashboard,
  "ai-visibility:claims": MessageSquareQuote,
  "ai-visibility:sources": BookOpen,
  "ai-visibility:signals": Radar,
  "ai-visibility:history": History,

  "access:users": Users,
  "access:organizations": Building2,
  "access:public": Globe,
};

export function marketingSubViewIcon(
  section: string,
  viewId: string,
): LucideIcon | undefined {
  return MARKETING_SUBVIEW_ICONS[`${section}:${viewId}`];
}
