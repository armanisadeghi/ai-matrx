"use client";

/**
 * The Research topic menu, rendered INSIDE the app shell sidebar in place of
 * the global nav (registered in `features/shell/constants/route-menu-registry.ts`
 * against `RESEARCH_TOPIC_PATH_PATTERN`). It replaced the topic workspace's own
 * second sidebar and its mobile dock: `RouteMenuSlot` now owns switching,
 * collapse, the mobile drawer, and the reversible Main Menu control. This
 * component only renders `RESEARCH_NAV_ITEMS`.
 *
 * The menu lives in the shell tree, outside the page's `TopicProvider`, so the
 * topic id comes from the URL and the About footer reads the topic itself.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  Brain,
  ChevronDown,
  ChevronLeft,
  Cpu,
  DollarSign,
  FileText,
  FlaskConical,
  Globe,
  GraduationCap,
  Image,
  Info,
  LayoutDashboard,
  ListChecks,
  ListTree,
  Package,
  Search,
  Settings2,
  Tags,
  Video,
  type LucideIcon,
} from "lucide-react";
import { INTELLIGENCE_ICON } from "@/components/icons/domain-icons";
import { resolveActiveRouteMode } from "@/features/shell/components/header/route-mode-match";
import {
  ROUTE_MENU_ICON_SIZE,
  ROUTE_MENU_ICON_STROKE_WIDTH,
  ROUTE_MENU_NAV_ITEM_CLASS,
} from "@/features/shell/constants/route-menu-style";
import { cn } from "@/lib/utils";
import { RESEARCH_NAV_ITEMS, type ResearchNavItem } from "../../constants";
import { getTopic } from "../../service";
import { researchTopicIdFromPath } from "./research-topic-route";

const ICON_MAP: Record<string, LucideIcon> = {
  LayoutDashboard,
  Globe,
  FileText,
  Tags,
  Search,
  Image,
  DollarSign,
  BookOpen,
  FlaskConical,
  Cpu,
  Settings2,
  Brain,
  ListChecks,
  ListTree,
  Package,
  BrainCircuit: INTELLIGENCE_ICON,
  Video,
  GraduationCap,
};

interface ResearchTopicSidebarMenuProps {
  expanded: boolean;
}

function Divider() {
  return <div className="mx-2 my-1 border-t border-border/70" />;
}

function NavRow({
  item,
  topicId,
  active,
}: {
  item: ResearchNavItem;
  topicId: string;
  active: boolean;
}) {
  const Icon = ICON_MAP[item.icon] ?? LayoutDashboard;
  return (
    <Link
      href={item.href(topicId)}
      title={item.label}
      aria-label={item.label}
      aria-current={active ? "page" : undefined}
      className={cn(ROUTE_MENU_NAV_ITEM_CLASS, active && "shell-active-pill")}
    >
      <span className="shell-nav-icon">
        <Icon
          size={ROUTE_MENU_ICON_SIZE}
          strokeWidth={ROUTE_MENU_ICON_STROKE_WIDTH}
        />
      </span>
      <span className="shell-nav-label truncate">{item.label}</span>
    </Link>
  );
}

/**
 * What this topic is about — a collapsed footer so the user can recall the
 * brief without it taking space from the page. Hidden in the collapsed rail.
 */
function TopicAbout({ topicId }: { topicId: string }) {
  const [description, setDescription] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setDescription(null);
    getTopic(topicId)
      .then((topic) => {
        if (!cancelled) setDescription(topic?.description?.trim() || null);
      })
      .catch((error: unknown) => {
        // The page body resolves access and load failures; the footer just
        // stays absent rather than showing a stale or wrong brief.
        console.error("[research] topic About could not load", error);
      });
    return () => {
      cancelled = true;
    };
  }, [topicId]);

  if (!description) return null;

  return (
    <div className="mt-auto border-t border-border/40 pt-1">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        data-keep-mobile-menu-open
        className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground"
      >
        <Info className="h-3 w-3 shrink-0" />
        <span className="flex-1 text-left">About</span>
        <ChevronDown
          className={cn(
            "h-3 w-3 shrink-0 transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      {open && (
        <p className="px-2 pb-2 text-[11px] leading-snug text-muted-foreground">
          {description}
        </p>
      )}
    </div>
  );
}

export default function ResearchTopicSidebarMenu({
  expanded,
}: ResearchTopicSidebarMenuProps) {
  const pathname = usePathname();
  const topicId = researchTopicIdFromPath(pathname);
  if (!topicId) return null;

  const items = RESEARCH_NAV_ITEMS.map((item) => ({
    item,
    href: item.href(topicId),
    // The overview must match exactly so it never lights up for sub-routes.
    exact: item.key === "topic",
  }));
  const active = resolveActiveRouteMode(items, pathname);
  const primary = items.filter((entry) => entry.item.group === "primary");
  const secondary = items.filter((entry) => entry.item.group === "secondary");

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-0.5">
      <Link
        href="/research/topics"
        title="All topics"
        aria-label="All topics"
        className={ROUTE_MENU_NAV_ITEM_CLASS}
      >
        <span className="shell-nav-icon">
          <ChevronLeft
            size={ROUTE_MENU_ICON_SIZE}
            strokeWidth={ROUTE_MENU_ICON_STROKE_WIDTH}
          />
        </span>
        <span className="shell-nav-label truncate">All topics</span>
      </Link>
      <Divider />
      {primary.map(({ item }) => (
        <NavRow
          key={item.key}
          item={item}
          topicId={topicId}
          active={active?.item.key === item.key}
        />
      ))}
      <Divider />
      {secondary.map(({ item }) => (
        <NavRow
          key={item.key}
          item={item}
          topicId={topicId}
          active={active?.item.key === item.key}
        />
      ))}
      {expanded && <TopicAbout topicId={topicId} />}
    </div>
  );
}
