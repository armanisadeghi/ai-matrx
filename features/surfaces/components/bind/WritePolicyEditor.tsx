"use client";

/**
 * WritePolicyEditor — the ONE editor for per-write-target apply-policy
 * overrides (`WritePolicyMap`) on a binding layer.
 *
 * Lists the surface's declared `writeTargets` (from the manifest registry)
 * and lets the user pick, per target: Default (no override — the surface's
 * own `applyPolicy` stands), Manual, Ask, or Auto.
 *
 * The floor rule is surfaced, not hidden: a target the SURFACE declared
 * `manual` can never be opened by an override (`resolveApplyPolicy` in
 * `runtime/surface-writeback.ts` enforces it at apply time), so Ask/Auto are
 * disabled with an explanation instead of silently ignored.
 *
 * Controlled component — consumed by the per-agent surfaces shell
 * (Agent access column), the batch binding editor, and the shortcut editor.
 * Never fetches, never saves; the owner round-trips the FULL map.
 */

import { Lock, PenLine } from "lucide-react";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { getManifest } from "@/features/surfaces/manifests/registry";
import type {
  SurfaceWritePolicy,
  SurfaceWriteTarget,
  WritePolicyMap,
} from "@/features/surfaces/types";

const DEFAULT_SEGMENT = "default";

const POLICY_LABELS: Record<SurfaceWritePolicy, string> = {
  manual: "Manual",
  ask: "Ask",
  auto: "Auto",
};

const MODE_LABELS: Record<SurfaceWriteTarget["mode"], string> = {
  draft: "Draft",
  entity: "Saves directly",
  ui: "UI only",
};

function surfaceDefaultFor(target: SurfaceWriteTarget): SurfaceWritePolicy {
  return target.applyPolicy ?? "manual";
}

export function WritePolicyEditor({
  surfaceName,
  value,
  onChange,
  disabled,
  compact = false,
}: {
  surfaceName: string;
  /** The FULL override map for this layer (target name → policy). */
  value: WritePolicyMap;
  /** Receives the FULL next map — the owner saves it wholesale. */
  onChange: (next: WritePolicyMap) => void;
  disabled?: boolean;
  /** Dense rows (batch editor): no descriptions, tighter spacing. */
  compact?: boolean;
}) {
  const targets = getManifest(surfaceName)?.writeTargets ?? [];

  if (targets.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border bg-muted/30 px-3 py-2.5 flex items-start gap-2">
        <PenLine className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
        <p className="text-[11px] text-muted-foreground leading-snug">
          This surface accepts no agent writes yet — its manifest declares no
          write targets, so there is nothing to control here.
        </p>
      </div>
    );
  }

  const setPolicy = (targetName: string, segment: string) => {
    const next: WritePolicyMap = { ...value };
    if (segment === DEFAULT_SEGMENT) {
      delete next[targetName];
    } else {
      next[targetName] = segment as SurfaceWritePolicy;
    }
    onChange(next);
  };

  return (
    <div className={compact ? "space-y-1.5" : "space-y-3"}>
      {targets.map((target) => {
        const surfaceDefault = surfaceDefaultFor(target);
        const floored = surfaceDefault === "manual";
        const override = value[target.name];
        const segment = override ?? DEFAULT_SEGMENT;

        return (
          <div
            key={target.name}
            className={
              compact
                ? "flex items-center gap-2 rounded-md border border-border bg-card px-2 py-1.5"
                : "rounded-md border border-border bg-card px-3 py-2.5 space-y-1.5"
            }
          >
            <div className={compact ? "min-w-0 flex-1" : ""}>
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-xs font-medium text-foreground truncate">
                  {target.label}
                </span>
                <span className="shrink-0 rounded-sm bg-muted px-1 py-0.5 text-[10px] leading-none text-muted-foreground">
                  {MODE_LABELS[target.mode]}
                </span>
                <span className="shrink-0 text-[10px] text-muted-foreground">
                  Surface default: {POLICY_LABELS[surfaceDefault]}
                </span>
              </div>
              {!compact && (
                <p className="mt-0.5 text-[11px] text-muted-foreground leading-snug">
                  {target.description}
                </p>
              )}
            </div>

            <div
              className={
                compact
                  ? "shrink-0 flex items-center gap-1.5"
                  : "flex items-center gap-2 flex-wrap"
              }
            >
              {compact && floored && (
                <Lock
                  className="h-3 w-3 text-muted-foreground"
                  aria-label="Surface floor: manual — overrides cannot open this target to agents"
                />
              )}
              <SegmentedControl
                size="sm"
                value={segment}
                onValueChange={(next) => {
                  if (disabled) return;
                  setPolicy(target.name, next);
                }}
                data={[
                  { value: DEFAULT_SEGMENT, label: "Default", disabled },
                  { value: "manual", label: "Manual", disabled },
                  { value: "ask", label: "Ask", disabled: disabled || floored },
                  { value: "auto", label: "Auto", disabled: disabled || floored },
                ]}
              />
              {!compact && floored && (
                <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                  <Lock className="h-3 w-3" />
                  The surface declared this target manual — overrides cannot
                  open it to agents.
                </span>
              )}
            </div>
          </div>
        );
      })}
      {!compact && (
        <p className="text-[10px] text-muted-foreground leading-snug">
          Default follows the surface&rsquo;s own policy. Manual refuses
          agent-originated writes; Ask confirms each write in place; Auto
          applies immediately. Overrides can tighten any target but can never
          open one the surface declared manual.
        </p>
      )}
    </div>
  );
}
