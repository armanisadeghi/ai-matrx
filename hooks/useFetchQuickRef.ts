"use client";

import { useEffect, useState } from "react";
import type { QuickReferenceRecord } from "@/types/records";
import { listAppletSourceAgents } from "@/features/applet/services/appletAgentSource";

export interface QuickReferenceKeyDisplayPair {
  recordKey: string;
  displayValue: string;
}

/**
 * Legacy quick-reference hook — entity system removed.
 * `recipe` and `ai-agent` keys resolve to the agents catalog (same UUIDs as recipes).
 */
export function useFetchQuickRef(entityKey: string) {
  const [quickReferenceRecords, setQuickReferenceRecords] = useState<
    QuickReferenceRecord[]
  >([]);
  const [loadingState, setLoadingState] = useState<
    "idle" | "loading" | "loaded" | "error"
  >("idle");

  useEffect(() => {
    if (entityKey !== "recipe" && entityKey !== "ai-agent") {
      setQuickReferenceRecords([]);
      setLoadingState("loaded");
      return;
    }

    let cancelled = false;
    setLoadingState("loading");

    listAppletSourceAgents()
      .then((agents) => {
        if (cancelled) return;
        setQuickReferenceRecords(
          agents.map((agent) => ({
            recordKey: agent.id,
            primaryKeyValues: { id: agent.id },
            displayValue: agent.name,
            metadata: { status: agent.status },
          })),
        );
        setLoadingState("loaded");
      })
      .catch(() => {
        if (cancelled) return;
        setQuickReferenceRecords([]);
        setLoadingState("error");
      });

    return () => {
      cancelled = true;
    };
  }, [entityKey]);

  const quickReferenceKeyDisplayPairs = quickReferenceRecords.map((record) => ({
    recordKey: record.recordKey,
    displayValue: record.displayValue,
  }));

  return {
    quickReferenceRecords,
    quickReferenceKeyDisplayPairs,
    loadingState,
    getRecordIdByRecord: (record: QuickReferenceRecord) => record.recordKey,
  };
}

export default useFetchQuickRef;
