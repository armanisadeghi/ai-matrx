import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { ChevronLeftTapButton } from "@/components/icons/tap-buttons";
import { AgentAppHeaderTabs } from "./AgentAppHeaderTabs";
import type { AgentAppHeaderTab } from "./AgentAppHeaderTabs";

interface AgentAppHeaderProps {
  appId: string;
  appName: string;
  active: AgentAppHeaderTab;
  /** Defaults to `/agent-apps`. Admin/org variants pass their own root. */
  basePath?: string;
  backHref?: string;
}

/**
 * Header shell for /agent-apps/[id] and its sub-routes.
 *
 * Desktop: back arrow + name + tab strip (Overview / Code / Versions / Settings).
 * Mobile: collapses tabs into a horizontally scrollable strip; no menu yet.
 *
 * Server Component — fully prerenderable. The active tab is passed in by the
 * page component so we don't need a client hook to read pathname.
 */
export function AgentAppHeader({
  appId,
  appName,
  active,
  basePath = "/agent-apps",
  backHref = "/agent-apps",
}: AgentAppHeaderProps) {
  const titleHref = `${basePath}/${appId}`;
  return (
    <div className="flex items-center justify-between w-full gap-2 px-0 min-w-0">
      <div className="flex items-center gap-1 min-w-0 shrink">
        <ChevronLeftTapButton href={backHref} aria-label="Back to Apps" />
        <Link
          href={titleHref}
          className="text-sm font-semibold text-foreground hover:text-primary transition-colors truncate min-w-0"
          title={appName}
        >
          {appName}
        </Link>
      </div>
      <AgentAppHeaderTabs
        basePath={basePath}
        appId={appId}
        active={active}
      />
      <div className="w-[40px] shrink-0" aria-hidden />
    </div>
  );
}
