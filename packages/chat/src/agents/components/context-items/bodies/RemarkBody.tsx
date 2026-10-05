"use client";

/**
 * Drawer body for a staged remark. An `edit` remark with no spoken projection
 * is the person's change to an answer — shown as a word-level diff from the
 * platform engine (@ai-matrx/diff), so the words they added or removed carry
 * the highlight, not the whole paragraph as one -/+ pair. Every other remark
 * reads through GenericBody's text as before.
 */

import { InlineTextDiff } from "@ai-matrx/diff/react";
import type { ContextItemBodyProps } from "../types";
import { GenericBody } from "./GenericBody";
import {
  REMARKS_BLOCK_TYPE,
  remarkSourceOf,
} from "../../../redux/execution-system/instance-resources/remarks";

export function RemarkBody(props: ContextItemBodyProps) {
  const source = remarkSourceOf({ blockType: REMARKS_BLOCK_TYPE, source: props.item.raw as never });
  const remark = source?.remark;
  if (remark?.kind === "edit" && !remark.projection) {
    return (
      <div className="h-full min-h-0 overflow-y-auto p-4">
        <InlineTextDiff view="inline" original={remark.before} modified={remark.after} />
      </div>
    );
  }
  return <GenericBody {...props} />;
}
