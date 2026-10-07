import { RecordsSkeleton } from "@ai-matrx/records-ui";

/**
 * A RECORD PAGE'S FIRST FRAME IS A RECORD (lane STABLE-TABLES): without this file the table
 * route's grid skeleton stood in for a record, and the page jumped from a grid to a record. Same
 * padding as `UnifiedRecordPage`, the package's record skeleton (title, field rows, body).
 */
export default function Loading() {
  return (
    <div className="h-full overflow-y-auto pt-[var(--shell-header-h)]">
      <div className="mx-auto w-full max-w-3xl p-4">
        <RecordsSkeleton layout="record" embedded />
      </div>
    </div>
  );
}
