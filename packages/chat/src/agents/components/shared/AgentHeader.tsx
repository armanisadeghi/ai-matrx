import { Link } from "../../../host/navigation";
import { ChevronLeft } from "lucide-react";
import { AgentSelectorIsland } from "./AgentSelectorIsland";
import { AgentModeController } from "./AgentModeController";
import { AgentSaveStatus } from "./AgentSaveStatus";
import { AgentOptionsMenu } from "./AgentOptionsMenu";
import { AgentReferenceCopyButton } from "./AgentReferenceCopyButton";
import { AgentHeaderMobile } from "./AgentHeaderMobile";
import { ReviewAnswersLink } from "@host/features/agents/decision-review/components/ReviewAnswersLink";
import { ChevronLeftTapButton } from "@ai-matrx/tap-target/buttons";

interface AgentHeaderProps {
  agentId: string;
  agentName: string;
  /** Base path for nested mode routes. Defaults to `/agents` for the user
   *  surface; admin passes `/administration/agents/system-agents/agents`. */
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
 * The split is a CONTAINER query on the shell header's own row
 * (`@container/shell-header`, styles/shell.css), never the viewport: with the
 * canvas open a 1440px window leaves this header ~300–600px, and the `lg:`
 * split drew the desktop row 190–630px wider than its slot (2026-10-03).
 * CSS only — no client hook, nothing shifts on hydrate.
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
      {/* ── Compact layout (header row < 44rem) ─────────────────────────── */}
      <div className="w-full @min-[44rem]/shell-header:hidden">
        <AgentHeaderMobile
          agentId={agentId}
          agentName={agentName}
          basePath={basePath}
        />
      </div>

      {/* ── Full layout (header row >= 44rem) ──────────────────────────── */}
      <div className="@container/agent-header hidden @min-[44rem]/shell-header:flex items-center justify-between w-full gap-0 px-0">
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
        {/* Save and Menu never fold. Below a 40rem header (the surfaces page
            squeezes this header between its column toggles; a 1024px window
            with the org chip showing) the version pill and the copy-reference
            button fold away — both stay one click away, in the Versions mode
            and in Menu. Without this, Menu slid under the page's own toggles
            (shell/components/header/header-crowding.ts names the class). */}
        <div className="flex items-center gap-1.5 shrink-0">
          <AgentSaveStatus
            agentId={agentId}
            versionClassName="hidden @min-[40rem]/agent-header:inline"
          />
          {basePath === "/agents" && <ReviewAnswersLink agentId={agentId} />}
          <span className="hidden @min-[40rem]/agent-header:contents">
            <AgentReferenceCopyButton agentId={agentId} agentName={agentName} />
          </span>
          <div className="w-px h-4 bg-border/50" />
          <AgentOptionsMenu agentId={agentId} basePath={basePath} />
        </div>
      </div>
    </>
  );
}
