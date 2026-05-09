import Link from "next/link";
import {
  AppWindow,
  Code,
  History,
  Settings as SettingsIcon,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type AgentAppHeaderTab =
  | "overview"
  | "code"
  | "versions"
  | "settings";

interface TabDef {
  key: AgentAppHeaderTab;
  label: string;
  shortLabel: string;
  icon: LucideIcon;
  hrefSuffix: string;
}

const TABS: TabDef[] = [
  {
    key: "overview",
    label: "Overview",
    shortLabel: "Overview",
    icon: AppWindow,
    hrefSuffix: "",
  },
  {
    key: "code",
    label: "Code",
    shortLabel: "Code",
    icon: Code,
    hrefSuffix: "/code",
  },
  {
    key: "versions",
    label: "Versions",
    shortLabel: "Versions",
    icon: History,
    hrefSuffix: "/versions",
  },
  {
    key: "settings",
    label: "Settings",
    shortLabel: "Settings",
    icon: SettingsIcon,
    hrefSuffix: "/settings",
  },
];

interface AgentAppHeaderTabsProps {
  basePath: string;
  appId: string;
  active: AgentAppHeaderTab;
}

export function AgentAppHeaderTabs({
  basePath,
  appId,
  active,
}: AgentAppHeaderTabsProps) {
  return (
    <nav
      aria-label="App sections"
      className="flex items-center gap-0.5 overflow-x-auto"
    >
      {TABS.map((t) => {
        const isActive = active === t.key;
        const href = `${basePath}/${appId}${t.hrefSuffix}`;
        const Icon = t.icon;
        return (
          <Link
            key={t.key}
            href={href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "flex items-center gap-1.5 px-2.5 h-7 rounded-md text-xs font-medium transition-colors whitespace-nowrap",
              isActive
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-muted",
            )}
          >
            <Icon className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{t.label}</span>
            <span className="sm:hidden">{t.shortLabel}</span>
          </Link>
        );
      })}
    </nav>
  );
}
