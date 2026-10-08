import { RecordRouteSkeleton } from "@/features/unified-data/page-seed/TableRouteSkeleton";

/**
 * A RECORD PAGE'S FIRST FRAME IS A RECORD (lane STABLE-TABLES): without this file the table
 * route's grid skeleton stood in for a record, and the page jumped from a grid to a record. The
 * record page draws the same component while it waits for its first reads (`PrimedRecordPage`).
 */
export default function Loading() {
  return <RecordRouteSkeleton />;
}
