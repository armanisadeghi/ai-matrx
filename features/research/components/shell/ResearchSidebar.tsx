"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
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
  Sparkles,
  Info,
  ChevronDown,
} from "lucide-react";
import { RESEARCH_NAV_ITEMS } from "../../constants";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useTopicDescription } from "../../context/ResearchContext";

const ICON_MAP: Record<string, typeof LayoutDashboard> = {
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
  Sparkles,
};

interface ResearchSidebarProps {
  topicId: string;
}

export function ResearchSidebar({ topicId }: ResearchSidebarProps) {
  const pathname = usePathname();

  const primaryItems = RESEARCH_NAV_ITEMS.filter((i) => i.group === "primary");
  const secondaryItems = RESEARCH_NAV_ITEMS.filter(
    (i) => i.group === "secondary",
  );

  const renderItem = (item: (typeof RESEARCH_NAV_ITEMS)[number]) => {
    const Icon = ICON_MAP[item.icon];
    const href = item.href(topicId);
    const isActive =
      item.key === "topic" ? pathname === href : pathname.startsWith(href);

    if (item.comingSoon) {
      return (
        <div
          key={item.key}
          className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground cursor-default select-none"
        >
          {Icon && <Icon className="h-3.5 w-3.5 shrink-0" />}
          <span className="truncate flex-1">{item.label}</span>
          <Badge
            variant="secondary"
            className="text-[8px] px-1 py-0 h-3.5 font-normal shrink-0"
          >
            Soon
          </Badge>
        </div>
      );
    }

    return (
      <Tooltip key={item.key} delayDuration={300}>
        <TooltipTrigger asChild>
          <Link
            href={href}
            className={cn(
              "flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition-colors",
              isActive
                ? "bg-primary/8 text-primary"
                : "text-muted-foreground/70 hover:bg-accent/50 hover:text-foreground",
            )}
          >
            {Icon && <Icon className="h-3.5 w-3.5 shrink-0" />}
            <span className="truncate">{item.label}</span>
          </Link>
        </TooltipTrigger>
        <TooltipContent side="right" className="md:hidden">
          {item.label}
        </TooltipContent>
      </Tooltip>
    );
  };

  return (
    <aside className="hidden md:flex w-44 flex-col border-r border-border/50 bg-card/30 backdrop-blur-sm shrink-0">
      <nav className="flex-1 py-1.5 px-1.5 overflow-y-auto">
        <div className="space-y-px">{primaryItems.map(renderItem)}</div>

        <div className="mx-1 my-1.5 h-px bg-border/30" />

        <div className="space-y-px">{secondaryItems.map(renderItem)}</div>
      </nav>

      {/* Topic description — collapsible footer so the user can recall what
          this topic is about without it eating prime real estate on the page. */}
      <TopicAbout />
    </aside>
  );
}

function TopicAbout() {
  const rawDescription = useTopicDescription();
  const [open, setOpen] = useState(false);
  const description = rawDescription?.trim();
  if (!description) return null;

  return (
    <div className="border-t border-border/40 bg-card/20">
      <button
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "w-full flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-medium uppercase tracking-wider",
          "text-muted-foreground/70 hover:text-foreground hover:bg-accent/40 transition-colors",
        )}
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
        <div className="px-2.5 pb-2 text-[11px] leading-snug text-muted-foreground/85">
          {description}
        </div>
      )}
    </div>
  );
}
