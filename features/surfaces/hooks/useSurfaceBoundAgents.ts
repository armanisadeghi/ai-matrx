"use client";

import { useCallback, useState } from "react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import {
  fetchSurfaceMenuAgentsGrouped,
  type SurfaceBoundAgentSection,
} from "@/features/surfaces/services/surface-bound-agents.service";

export interface UseSurfaceBoundAgentsOptions {
  /**
   * Editable surfaces also qualify for the "Basic Editor" default contract
   * (text_before/text_after are meaningful there). Default false.
   */
  isEditable?: boolean;
  /**
   * Merge in the platform default-contract agents (`matrx-default/*`) so they
   * appear on every qualifying surface — including bare/undeclared ones.
   * Default true. Pass false for a strict surface-only listing.
   */
  includeDefaults?: boolean;
}

export interface UseSurfaceBoundAgentsResult {
  sections: SurfaceBoundAgentSection[];
  loading: boolean;
  error: string | null;
  hasAgents: boolean;
  refresh: () => Promise<void>;
}

export function useSurfaceBoundAgents(
  surfaceName: string | null | undefined,
  options?: UseSurfaceBoundAgentsOptions,
): UseSurfaceBoundAgentsResult {
  const currentUserId = useAppSelector(selectUserId);
  const isEditable = options?.isEditable ?? false;
  const includeDefaults = options?.includeDefaults ?? true;
  const [sections, setSections] = useState<SurfaceBoundAgentSection[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    // No early return on a null surface: the default contracts still apply, so
    // a bare/undeclared surface MUST still surface its default agents.
    try {
      setLoading(true);
      setError(null);
      const grouped = await fetchSurfaceMenuAgentsGrouped(
        surfaceName ?? null,
        currentUserId,
        { isEditable, includeDefaults },
      );
      setSections(grouped);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load agents");
      setSections([]);
    } finally {
      setLoading(false);
    }
  }, [surfaceName, currentUserId, isEditable, includeDefaults]);

  const hasAgents = sections.some((s) => s.agents.length > 0);

  return { sections, loading, error, hasAgents, refresh };
}
