"use client";

/**
 * Shared kind_example loading — extracted from the admin KindDetailClient so
 * the user-facing studio and the admin detail page consume ONE fetch + state
 * shape instead of two forks. Reads are RLS-scoped through the browser client:
 * an admin sees everything their JWT allows, a user naturally sees platform
 * kinds + their org's rows.
 */

import { useEffect, useState } from "react";
import { supabase } from "@/utils/supabase/client";
import type { KindExampleListItem } from "@/features/content-ir/admin/kind-detail-types";

export type ExamplesState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; rows: KindExampleListItem[] };

/**
 * Load a kind's `content_ir.kind_example` rows (canonical first, newest
 * next). One fetch per kind_definition id; errors surface loudly in state.
 */
export function useKindExamples(
  kindDefinitionId: string,
  refreshKey = 0,
): ExamplesState {
  // Keyed by definition id so a kind switch derives "loading" instead of a
  // synchronous reset-in-effect (react-hooks/set-state-in-effect).
  const [loaded, setLoaded] = useState<{
    id: string;
    value: ExamplesState;
  } | null>(null);
  const setExamples = (value: ExamplesState) =>
    setLoaded({ id: kindDefinitionId, value });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .schema("content_ir")
        .from("kind_example")
        .select(
          "id,label,description,is_canonical,source,validation_status,kind_version,data,updated_at",
        )
        .eq("kind_definition_id", kindDefinitionId)
        .is("deleted_at", null)
        .order("is_canonical", { ascending: false })
        .order("updated_at", { ascending: false });
      if (cancelled) return;
      if (error) {
        setExamples({
          status: "error",
          message: `Failed to load kind_example rows: ${error.message}`,
        });
        return;
      }
      setExamples({
        status: "ready",
        rows: (data ?? []).map((r): KindExampleListItem => ({
          id: r.id,
          label: r.label,
          description: r.description,
          isCanonical: r.is_canonical,
          source: r.source,
          validationStatus: r.validation_status,
          kindVersion: r.kind_version,
          data: r.data,
          updatedAt: r.updated_at,
        })),
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [kindDefinitionId, refreshKey]);

  return loaded && loaded.id === kindDefinitionId
    ? loaded.value
    : { status: "loading" };
}
