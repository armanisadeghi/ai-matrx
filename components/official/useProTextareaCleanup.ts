"use client";

/**
 * useProTextareaCleanup — cleanup-flavoured wrapper around
 * `useProTextareaAgentAction` that also resolves the surface "clean" role
 * default from `matrx-user/transcripts-cleanup`.
 *
 * Prefer `useProTextareaAgentAction` directly when building new menu actions.
 */

import { CLEANUP_SURFACE_NAME } from "@/features/transcription-cleanup/hooks/useAiPostProcess";
import { useSurfaceAgentRoles } from "@/features/surfaces/hooks/useSurfaceConfig";
import {
  useProTextareaAgentAction,
  type UseProTextareaAgentActionResult,
} from "./useProTextareaAgentAction";

export interface UseProTextareaCleanupOptions {
  /**
   * Explicit cleanup agent id. When omitted, the agent is resolved from the
   * `clean` role on the shared cleanup surface (same default as the cleanup
   * page).
   */
  agentId?: string | null;
}

export interface UseProTextareaCleanupResult extends UseProTextareaAgentActionResult {
  /** Default cleanup agent id (override or surface "clean" role). */
  defaultAgentId: string | null;
}

export function useProTextareaCleanup(
  options: UseProTextareaCleanupOptions = {},
): UseProTextareaCleanupResult {
  const { agentId: agentIdOverride } = options;

  const surfaceRoles = useSurfaceAgentRoles(CLEANUP_SURFACE_NAME);
  const roleAgentId = surfaceRoles.roles.clean?.effectiveAgentId ?? null;
  const defaultAgentId = agentIdOverride || roleAgentId;

  const action = useProTextareaAgentAction();

  return {
    ...action,
    defaultAgentId,
  };
}
