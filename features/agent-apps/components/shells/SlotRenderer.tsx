"use client";

/**
 * SlotRenderer — Tier-2 dispatch between a shell's default slot
 * implementation and a user-supplied custom override.
 *
 * Shells call this for every customisable slot. When the app row sets
 * `slot_overrides[slot] === 'custom'` AND non-empty `slot_code[slot]`
 * source exists, the custom component is compiled (Babel sandbox, same
 * allowed-imports scope as fully_custom apps) and rendered with
 * `props`. Otherwise the shell's default `fallback` renders.
 *
 * Compilation errors are surfaced inline so the override author can fix
 * them without crashing the surrounding shell. The shell itself never
 * needs to know whether the slot is custom.
 */

import { useMemo } from "react";
import { AlertTriangle } from "lucide-react";
import { compileSlotComponent } from "@/features/agent-apps/utils/compile-slot";
import { AgentAppErrorBoundary } from "@/features/agent-apps/components/AgentAppErrorBoundary";
import type {
  AgentAppSlotName,
  AgentAppSlotOverrides,
  AgentAppSlotCode,
} from "@/features/agent-apps/types";
import type { Json } from "@/types/database.types";

interface SlotRendererProps<P extends Record<string, unknown>> {
  /** Slot identity. */
  slot: AgentAppSlotName;
  /** App row's `slot_overrides` JSONB. */
  overrides: AgentAppSlotOverrides | Json | null | undefined;
  /** App row's `slot_code` JSONB. */
  code: AgentAppSlotCode | Json | null | undefined;
  /** App row's `allowed_imports` (passes through to the compile scope). */
  allowedImports?: string[] | Json | null;
  /** Props passed through to whichever component renders. */
  props: P;
  /** Default slot component used when there is no custom override. */
  fallback: React.ComponentType<P>;
  /** Optional error-display name for the boundary. */
  appName?: string;
}

export function SlotRenderer<P extends Record<string, unknown>>({
  slot,
  overrides,
  code,
  allowedImports,
  props,
  fallback: Fallback,
  appName,
}: SlotRendererProps<P>) {
  const overrideMap = (overrides ?? {}) as Record<string, string | undefined>;
  const codeMap = (code ?? {}) as Record<string, string | undefined>;
  const isCustom = overrideMap[slot] === "custom";
  const source = codeMap[slot] ?? "";

  const { Component, error } = useMemo(() => {
    if (!isCustom || !source.trim()) {
      return { Component: null, error: null };
    }
    return compileSlotComponent({ code: source, allowedImports });
  }, [isCustom, source, allowedImports]);

  if (!isCustom || !Component) {
    if (isCustom && error) {
      return <SlotCompileError slot={slot} error={error} />;
    }
    return <Fallback {...props} />;
  }

  return (
    <AgentAppErrorBoundary appName={appName ?? `slot:${slot}`}>
      <Component {...(props as Record<string, unknown>)} />
    </AgentAppErrorBoundary>
  );
}

function SlotCompileError({
  slot,
  error,
}: {
  slot: string;
  error: string;
}) {
  return (
    <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive flex items-start gap-2">
      <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
      <div className="space-y-1">
        <div className="font-medium">Slot "{slot}" failed to compile</div>
        <pre className="whitespace-pre-wrap font-mono text-[11px] opacity-80">
          {error}
        </pre>
      </div>
    </div>
  );
}
