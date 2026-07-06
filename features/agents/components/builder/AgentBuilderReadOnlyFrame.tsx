"use client";

import { Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppSelector } from "@/lib/redux/hooks";
import {
  selectAgentAccessResolved,
  selectAgentIsReadOnly,
} from "@/features/agents/redux/agent-definition/selectors";
import { useAgentDuplicateFlow } from "@/features/agents/hooks/useAgentDuplicateFlow";
import { cn } from "@/lib/utils";

interface AgentBuilderReadOnlyFrameProps {
  agentId: string;
  children: React.ReactNode;
  className?: string;
  basePath?: string;
}

/**
 * Non-layout-shifting read-only chrome for the builder left column.
 * Adds an inset amber ring + a floating "Create my copy" chip once access
 * metadata confirms the user is view-only.
 */
export function AgentBuilderReadOnlyFrame({
  agentId,
  children,
  className,
  basePath,
}: AgentBuilderReadOnlyFrameProps) {
  const accessResolved = useAppSelector((state) =>
    selectAgentAccessResolved(state, agentId),
  );
  const isReadOnly = useAppSelector((state) =>
    selectAgentIsReadOnly(state, agentId),
  );
  const { startDuplicate, dialog, isDuplicating } = useAgentDuplicateFlow(
    agentId,
    { basePath },
  );

  const showReadOnlyChrome = accessResolved && isReadOnly;

  return (
    <div
      className={cn(
        "relative h-full min-h-0",
        showReadOnlyChrome &&
          "rounded-lg ring-2 ring-inset ring-amber-500/60 dark:ring-amber-400/50",
        className,
      )}
    >
      {children}

      {showReadOnlyChrome && (
        <div
          className="pointer-events-none absolute inset-x-0 top-2 z-20 flex justify-center px-2"
          aria-live="polite"
        >
          <div className="pointer-events-auto inline-flex max-w-full items-center gap-2 rounded-full border border-amber-500/35 bg-amber-500/10 px-2.5 py-1 text-xs text-amber-900 shadow-sm backdrop-blur-sm dark:text-amber-100">
            <Eye className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="truncate font-medium">View only</span>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="h-6 shrink-0 px-2 text-xs"
              disabled={isDuplicating}
              onClick={() => void startDuplicate()}
            >
              Create my copy
            </Button>
          </div>
        </div>
      )}

      {dialog}
    </div>
  );
}
