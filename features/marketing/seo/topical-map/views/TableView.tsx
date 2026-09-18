"use client";

/**
 * TABLE — the map as rows and columns on the platform table (PLAN §6 B).
 *
 * This file is the view's door: it reads the feature's knobs once and hands
 * them to `table/TopicTable`, which draws the table over the same `map_tree`
 * read and the same `selectVisibleMapTopics` every other view consumes. While
 * the knobs load it shows the library loading state; if they fail it shows the
 * failure with the setting's own error — never a guessed default column set.
 */

import type { MapViewProps } from "../components/TopicalMapWorkspaceBody";
import { TopicalMapFailed, TopicalMapLoading } from "../components/TopicalMapStates";
import { useTopicalMapKnobs } from "../knobs";
import { TopicTable } from "./table/TopicTable";

export function TableView(props: MapViewProps) {
  const { knobs, loading, error } = useTopicalMapKnobs();

  if (loading) return <TopicalMapLoading what="the table settings" />;
  if (error || !knobs) {
    return (
      <TopicalMapFailed
        what="the table settings"
        error={error ?? new Error("The topical map settings did not load.")}
      />
    );
  }

  return <TopicTable {...props} knobs={knobs} />;
}
