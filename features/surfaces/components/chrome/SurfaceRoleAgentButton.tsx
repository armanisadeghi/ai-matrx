"use client";

/**
 * features/surfaces/components/chrome/SurfaceRoleAgentButton.tsx
 *
 * The IN-PLACE "do this with AI" button for a surface agent ROLE — the visible
 * half of the surfaces + agent-roles system. The header Agents chrome
 * (SurfaceAgentsHeaderButton) lists every bound agent generically; this button
 * puts ONE role where its work happens (the theme editor gets the Theme
 * designer, the navigation card gets the Site editor), because an affordance
 * the user cannot see does not exist ("it just seems like someone forgot that
 * we do AI for a living" — Arman, 2026-08-13).
 *
 * Launch recipe is IDENTICAL to SurfaceAgentsPanelImpl.handleRun — the live
 * runtime scope from the page's SurfaceRuntimeProvider, flexible-panel chat,
 * source feature derived from the surface. Never a second execution path.
 *
 * Renders nothing while the role has no effective agent (an unbound role is
 * configuration, not UI) — bind one in the manifest/DB or via the role's
 * settings in the header Agents panel.
 */
import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "@/lib/toast";

import { Button } from "@/components/ui/button";
import { useAgentLauncher } from "@/features/agents/hooks/useAgentLauncher";
import { sourceFeatureFromSurfaceName } from "@/features/agents/utils/source-feature-from-surface";
import { useSurfaceAgentRoles } from "@/features/surfaces/hooks/useSurfaceConfig";
import { useSurfaceRuntime } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { cn } from "@/lib/utils";

export function SurfaceRoleAgentButton({
  surfaceName,
  roleName,
  label,
  className,
  size = "sm",
}: {
  /** The surface whose role is launched (e.g. "matrx-user/cms-site"). */
  surfaceName: string;
  /** Role name from the surface manifest's `agentRoles` (e.g. "theme_designer"). */
  roleName: string;
  /** Button text; defaults to the role's manifest label. */
  label?: string;
  className?: string;
  size?: "sm" | "xs";
}) {
  const { roles } = useSurfaceAgentRoles(surfaceName);
  const runtime = useSurfaceRuntime();
  const { launchAgent } = useAgentLauncher();
  const [launching, setLaunching] = useState(false);

  const role = roles[roleName];
  const agentId = role?.effectiveAgentId ?? null;
  if (!agentId) return null;

  const handleClick = async () => {
    setLaunching(true);
    try {
      let applicationScope: Record<string, unknown> = {};
      if (runtime && runtime.surfaceName === surfaceName) {
        applicationScope = (await runtime.getScope()) as Record<
          string,
          unknown
        >;
      } else {
        toast.message("Running without live page context", {
          description:
            "This surface has not registered a live scope here — the agent still runs, with less context.",
        });
      }
      await launchAgent(agentId, {
        surfaceKey: `surface-role:${surfaceName}:${roleName}`,
        sourceFeature:
          sourceFeatureFromSurfaceName(surfaceName) ?? "ai-results",
        config: {
          displayMode: "flexible-panel",
          allowChat: true,
          showVariablePanel: true,
        },
        runtime: {
          surfaceName,
          applicationScope,
        },
      });
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not start the agent",
      );
    } finally {
      setLaunching(false);
    }
  };

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={launching}
      onClick={() => void handleClick()}
      title={role.role.description}
      className={cn(
        "gap-1.5 border-primary/30 text-primary hover:bg-primary/10 hover:text-primary",
        size === "xs" && "h-6 px-2 text-[11px]",
        className,
      )}
    >
      {launching ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
      ) : (
        <Sparkles className="h-3.5 w-3.5" aria-hidden />
      )}
      {label ?? role.role.label}
    </Button>
  );
}
