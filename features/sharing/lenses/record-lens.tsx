"use client";

/**
 * The table-row lens — what an Anyone link to one row of a table shows (access ladder T-40).
 * The row's fields arrive as the link's `children` (`{ kind: "record_fields", record }`),
 * projected by the database at viewer: never a Confidential, Restricted, protected or relation
 * field. The same view as the public page `/p/e/record/<id>`.
 */

import { RecordFieldsView } from "./record-fields-view";
import { readSharedRecordChildren } from "./record-fields";
import type { ShareLensProps } from "./registry";

export function RecordShareLens({ result }: ShareLensProps) {
  const record = readSharedRecordChildren(result.children);
  if (!record) {
    return (
      <p className="mx-auto w-full max-w-3xl rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
        This link opens a record that has nothing to show here.
      </p>
    );
  }
  return <RecordFieldsView record={record} heading />;
}
