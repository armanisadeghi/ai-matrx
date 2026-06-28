import type { QuickReferenceRecord } from "@/types/records";

export interface QuickReferenceKeyDisplayPair {
  recordKey: string;
  displayValue: string;
}

/**
 * Stub — the entity-system quick-reference hook was removed with the entities
 * decommission. Returns empty data so legacy applet/chat surfaces compile.
 */
export function useFetchQuickRef(_entityKey: string) {
  return {
    quickReferenceRecords: [] as QuickReferenceRecord[],
    quickReferenceKeyDisplayPairs: [] as QuickReferenceKeyDisplayPair[],
    loadingState: "idle" as const,
    getRecordIdByRecord: (_record: QuickReferenceRecord) =>
      null as string | null,
  };
}

export default useFetchQuickRef;
