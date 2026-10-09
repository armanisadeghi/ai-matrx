// features/education/convert/announceLineage.ts
//
// The one way a surface says an aid saved but its lineage / kit links did not
// (law 4: nothing fails silently). A warning toast that stays until handled,
// with Retry re-running the idempotent edge writes.

import { toast } from "@/lib/toast";
import { lineageFailureLine } from "./recordSourceLineage";
import type { LineageOutcome } from "./types";

export function announceLineage(
  outcome: LineageOutcome | undefined,
  retry: () => Promise<LineageOutcome>,
  opts: { inKit?: boolean; id?: string } = {},
): void {
  const line = lineageFailureLine(outcome, opts.inKit ?? false);
  if (!line) return;
  const id = opts.id ?? `lineage:${Math.random().toString(36).slice(2)}`;
  toast.warning(line, {
    id,
    duration: Infinity,
    action: {
      label: "Retry",
      onClick: () =>
        void retry().then(
          (next) => {
            if (next.failed.length === 0) toast.success("Linked.", { id });
            else announceLineage(next, retry, { ...opts, id });
          },
          () => announceLineage(outcome, retry, { ...opts, id }),
        ),
    },
  });
}
