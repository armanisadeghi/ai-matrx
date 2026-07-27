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
import nextDynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import { CopyForAiIcon } from "@/components/agent-copy/CopyForAiIcon";
import type { AgentCopyGroomerConfig } from "@/components/agent-copy/groomer-types";

const AgentCopyGroomerWindow = nextDynamic(
  () =>
    import("@/components/agent-copy/AgentCopyGroomerWindow").then(
      (m) => m.AgentCopyGroomerWindow,
    ),
  { ssr: false },
);

export interface AgentCopyGroomerLauncherProps {
  config: () => AgentCopyGroomerConfig;
  /** Button label. Default "Copy for AI". */
  buttonLabel?: string;
  className?: string;
}

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
        size="sm"
        className={className}
        title="Groom and copy this whole page for an AI agent"
        onClick={() => {
          setResolved(config());
          setOpen(true);
        }}
      >
        <CopyForAiIcon className="h-4 w-4" />
        <span className="ml-1">{buttonLabel}</span>
      </Button>
      {open && resolved ? (
        <AgentCopyGroomerWindow
          config={resolved}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}
