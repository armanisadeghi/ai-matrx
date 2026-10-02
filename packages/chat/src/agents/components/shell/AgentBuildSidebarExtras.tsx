import {
  Variable,
  Wrench,
  Database,
  TestTube2,
  FileCode2,
  MenuSquare,
  Keyboard,
  AppWindow,
  History,
} from "lucide-react";

function SoonBadge() {
  return (
    <span className="ml-auto text-[10px] font-medium text-muted-foreground/50 bg-muted rounded px-1 py-0.5 leading-none">
      Soon
    </span>
  );
}

interface BuildNavItemProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}

function BuildNavItem({ icon: Icon, label }: BuildNavItemProps) {
  return (
    <div className="flex items-center gap-2 px-2 py-1 text-xs text-muted-foreground cursor-not-allowed select-none rounded-md">
      <Icon className="w-3.5 h-3.5 shrink-0" />
      <span className="flex-1 truncate">{label}</span>
      <SoonBadge />
    </div>
  );
}

/**
 * Placeholder build-specific sidebar section injected below the main nav
 * when the user is on /agents/[id]/build.
 * All items are "coming soon" — this establishes the layout pattern.
 */
export function AgentBuildSidebarExtras() {
  return (
    <div className="shrink-0 border-y border-border ">
      <BuildNavItem icon={AppWindow} label="Agent Apps" />
      <BuildNavItem icon={MenuSquare} label="Context Menu" />
      <BuildNavItem icon={Keyboard} label="Agent Shortcuts" />
      <BuildNavItem icon={TestTube2} label="Agent Tests" />
      <BuildNavItem icon={History} label="Agent History" />
    </div>
  );
}
