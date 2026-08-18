"use client";

/**
 * AgentCopyGroomerLauncher — the "Copy for AI" button a page puts in its
 * header for the WHOLE-PAGE payload. Opens the AgentCopyGroomerWindow
 * (variations, per-section detail dials, live size, preview) via a dynamic
 * ssr:false boundary so the WindowPanel stack never enters the route chunk.
 *
 * Pass `config` as a FUNCTION — it is resolved when the window opens, so the
 * sections capture the data on screen at that moment.
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CopyForAiIcon } from "@/components/agent-copy/CopyForAiIcon";
import { AgentCopyGroomerHost } from "@/components/agent-copy/AgentCopyGroomerHost";
import type { AgentCopyGroomerConfig } from "@/components/agent-copy/groomer-types";

export interface AgentCopyGroomerLauncherProps {
  config: () => AgentCopyGroomerConfig;
  /** Button label. Default "Copy for AI". */
  buttonLabel?: string;
  className?: string;
}

/** @deprecated Pass `groomer={config}` to `CopyButtons` instead. */
export function AgentCopyGroomerLauncher({
  config,
  buttonLabel = "Copy for AI",
  className,
}: AgentCopyGroomerLauncherProps) {
  const [open, setOpen] = useState(false);
  const [resolved, setResolved] = useState<AgentCopyGroomerConfig | null>(null);

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={className}
        aria-label={buttonLabel}
        title={`${buttonLabel} — groom and copy this whole page for an AI agent`}
        onClick={() => {
          setResolved(config());
          setOpen(true);
        }}
      >
        <CopyForAiIcon className="h-4 w-4" />
      </Button>
      <AgentCopyGroomerHost
        open={open}
        config={resolved}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
