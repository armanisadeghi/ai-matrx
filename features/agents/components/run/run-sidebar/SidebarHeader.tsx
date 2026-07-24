import Link from "next/link";
import { AgentSelectorIsland } from "../../shared/AgentSelectorIsland";
import {
  PanelLeftTapButton,
  ChevronLeftTapButton,
} from "@/components/icons/tap-buttons";
import { PowerTapButton } from "@/components/icons/ai-tap-buttons";
import {
  SearchGroup,
  SearchGroupTrigger,
} from "@/components/icons/SearchToolbar";
import { AgentNewRunButton } from "../../shared/AgentNewRunButton";

interface SidebarHeaderProps {
  agentId: string;
  conversationId: string;
  surfaceKey: string;
  conversationIdFromUrl?: string;
  onToggleSidebar: () => void;
  /** Base path for back-link and agent-switch routing. Defaults to `/agents`.
   *  Admin surfaces pass `/administration/agents/system-agents/agents`. */
  basePath?: string;
  /** Optional explicit back-link href. Falls back to `basePath`. */
  backHref?: string;
}

/**
 * Server Component shell for the agent detail header.
 *
 * Desktop: text-based selector + labelled mode buttons + save/options.
 * Mobile: tap-target icons only — Webhook (agent picker) | 5-icon group | menu.
 * Breakpoint split via CSS hidden classes — no client hook needed.
 */
export function SidebarHeader({
  agentId,
  conversationId,
  surfaceKey,
  conversationIdFromUrl,
  onToggleSidebar,
  basePath = "/agents",
  backHref,
}: SidebarHeaderProps) {
  return (
    <div className="flex items-center shrink-0 w-full h-10 px-1 gap-1">
      <Link href={backHref ?? basePath} aria-label="Back to Agents">
        <ChevronLeftTapButton />
      </Link>

      <SearchGroup
        id="agent-run-header-search-group"
        expand={false}
        placeholder="Search..."
        fill
        className="flex-1"
      >
        <AgentSelectorIsland
          agentId={agentId}
          initialName={"Run Agent"}
          triggerSlot={<PowerTapButton variant="group" />}
          basePath={basePath}
        />
        <SearchGroupTrigger id="agent-run-header-search-group" />
        <PanelLeftTapButton variant="group" onClick={() => onToggleSidebar()} />
      </SearchGroup>
      <AgentNewRunButton surfaceKey={surfaceKey} />
    </div>
  );
}
