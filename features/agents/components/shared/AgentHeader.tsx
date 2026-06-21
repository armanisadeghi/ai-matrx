import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { AgentSelectorIsland } from "./AgentSelectorIsland";
import { AgentModeController } from "./AgentModeController";
import { AgentSaveStatus } from "./AgentSaveStatus";
import { AgentOptionsMenu } from "./AgentOptionsMenu";
import { AgentReferenceCopyButton } from "./AgentReferenceCopyButton";
import { AgentHeaderMobile } from "./AgentHeaderMobile";
import { ChevronLeftTapButton } from "@/components/icons/tap-buttons";

interface AgentHeaderProps {
  agentId: string;
  agentName: string;
  /** Base path for nested mode routes. Defaults to `/agents` for the user
   *  surface; admin passes `/administration/system-agents/agents`. */
  basePath?: string;
  /** SSR-friendly current path. Optional — falls back to `usePathname()` when
   *  omitted. Pages that already know their pathname server-side can pass it
   *  to skip the client-side hook in `AgentModeController`. */
  currentPath?: string;
  backHref?: string;
}

/**
 * Server Component shell for the agent detail header.
 *
 * Desktop: text-based selector + labelled mode buttons + save/options.
 * Mobile: tap-target icons only — Webhook (agent picker) | 5-icon group | menu.
 * Breakpoint split via CSS hidden classes — no client hook needed.
 */
export function AgentHeader({
  agentId,
  agentName,
  backHref = "/agents/all",
  basePath = "/agents",
  currentPath,
}: AgentHeaderProps) {
  return (
    <>
      {/* ── Mobile layout (< lg) ─────────────────────────────────────────── */}
      {/* <div className="lg:hidden w-full">
        <AgentHeaderMobile
          agentId={agentId}
          agentName={agentName}
          basePath={basePath}
        />
      </div> */}

      {/* ── Desktop layout (>= lg) ───────────────────────────────────────── */}
      <div className="hidden lg:flex items-center justify-between w-full gap-0 px-0">
        <div className="flex items-center">
          <ChevronLeftTapButton href={backHref} aria-label="Back to Agents" />
          <AgentSelectorIsland
            agentId={agentId}
            initialName={agentName}
            basePath={basePath}
            showVersion={false}
          />
        </div>
        <AgentModeController
          agentId={agentId}
          basePath={basePath}
          currentPath={currentPath}
        />
        <div className="flex items-center gap-1.5 shrink-0">
          <AgentSaveStatus agentId={agentId} />
          <AgentReferenceCopyButton agentId={agentId} agentName={agentName} />
          <div className="w-px h-4 bg-border/50" />
          <AgentOptionsMenu agentId={agentId} basePath={basePath} />
        </div>
      </div>
    </>
  );
}
