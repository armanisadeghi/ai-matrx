"use client";

/**
 * SandboxEnvTab — env-var inspection only (agent env + passthrough).
 *
 * Mounts the existing SandboxDiagnosticsPanel in `view="env"` mode. Two
 * inner sub-tabs render:
 *   - Agent env:    what the FastAPI process actually sees
 *   - Passthrough:  which orchestrator vars made it into the container
 *
 * Both are read-only and crucial for "why is the agent failing?" debugging
 * without exposing a shell.
 */

import React from "react";
import { SandboxDiagnosticsPanel } from "../views/sandboxes/SandboxDiagnosticsPanel";

interface SandboxEnvTabProps {
  sandboxId: string;
  className?: string;
}

export const SandboxEnvTab: React.FC<SandboxEnvTabProps> = ({
  sandboxId,
  className,
}) => (
  <div className={className ?? "h-full overflow-auto p-3"}>
    <SandboxDiagnosticsPanel
      sandboxId={sandboxId}
      view="env"
      showLogs={false}
      showResetButton={false}
    />
  </div>
);

export default SandboxEnvTab;
