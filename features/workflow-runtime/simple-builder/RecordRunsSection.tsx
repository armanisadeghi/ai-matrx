"use client";

// features/workflow-runtime/simple-builder/RecordRunsSection.tsx
//
// "What ran on this record" — every Workflow run stamped with this record, for whoever may read
// the record (aidream `GET /workflow-builder/records/{id}/runs`). Drawn in the table page's record
// rail through records-ui's `recordSections` host port. Absent while nothing has run.

import { useEffect, useState } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { listRecordRuns, type BuilderRun } from "./builderApi";
import { BuilderRunsList } from "./BuilderRunsList";

export function RecordRunsSection({
  organizationId,
  recordId,
}: {
  organizationId: string;
  recordId: string;
}) {
  const dispatch = useAppDispatch();
  const [runs, setRuns] = useState<BuilderRun[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    setRuns(null);
    listRecordRuns(dispatch, organizationId, recordId)
      .then((r) => live && (setRuns(r.runs), setError(null)))
      .catch(
        (e) => live && setError(e instanceof Error ? e.message : String(e)),
      );
    return () => {
      live = false;
    };
  }, [dispatch, organizationId, recordId]);

  if (!error && (!runs || runs.length === 0)) return null;
  return (
    <section
      data-section="record-workflow-runs"
      className="flex flex-col gap-2"
    >
      <h3 className="text-sm font-semibold">What ran on this record</h3>
      <BuilderRunsList
        runs={runs}
        loading={false}
        error={error}
        showWorkflowLink
      />
    </section>
  );
}
