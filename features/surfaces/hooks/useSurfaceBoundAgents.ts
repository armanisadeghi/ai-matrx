"use client";

import { useCallback, useState } from "react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import {
  fetchSurfaceBoundAgentsGrouped,
  type SurfaceBoundAgentSection,
} from "@/features/surfaces/services/surface-bound-agents.service";

export interface UseSurfaceBoundAgentsResult {
  sections: SurfaceBoundAgentSection[];
  loading: boolean;
  error: string | null;
  hasAgents: boolean;
  refresh: () => Promise<void>;
}

export function useSurfaceBoundAgents(
  surfaceName: string | null | undefined,
): UseSurfaceBoundAgentsResult {
  const currentUserId = useAppSelector(selectUserId);
  const [sections, setSections] = useState<SurfaceBoundAgentSection[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!surfaceName) {
      setSections([]);
      setError(null);
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const grouped = await fetchSurfaceBoundAgentsGrouped(
        surfaceName,
        currentUserId,
      );
      setSections(grouped);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load agents");
      setSections([]);
    } finally {
      setLoading(false);
    }
  }, [surfaceName, currentUserId]);

  const hasAgents = sections.some((s) => s.agents.length > 0);

  return { sections, loading, error, hasAgents, refresh };
}
