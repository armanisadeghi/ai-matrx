// features/unified-data/actions/tableMenuExtensions.ts
//
// THE TABLE PAGE'S OWN ENTRIES, as entries of the ONE action list (lane TABLE-ACTIONS).
//
// Before the registry the table page appended three entries to the header ⋯ through records-ui's
// append-only `menuExtras` (`table-page/UnifiedTable.tsx`): the test-copy line, "Copy this table
// again" and "When a row changes, run an agent…". They belong to features of this app (the
// cutover mover, the row-change agent), not to the package, so they arrive through
// `host.extend` — and they are always in the list, disabled with a reason where they do not apply,
// so no seat and no table ever meets a menu of a different shape.

import type { ObjectAction } from "@ai-matrx/records-ui/object-actions";
import { ROW_CHANGE_AGENT_LABEL } from "../row-change-agent/RowChangeAgentLink";

export interface TableMenuExtras {
  /** This table is a test copy: what the copy says about itself, and the check it runs. */
  testCopy?: { label: string; run: () => void };
  /** The mover's rerun for this one table (only on a test copy). */
  copyAgain?: () => void;
  /** The row-change agent offer: opens the schedule, or says why it is not available. */
  rowChangeAgent?: () => void;
}

export const NOT_A_COPY_REASON = "Only on a copied table";

const NOOP = () => {};

/** The three entries, in their one order — pass as `host.extend`'s result. */
export function tableMenuExtensions(extras: TableMenuExtras): ObjectAction[] {
  const { testCopy, copyAgain, rowChangeAgent } = extras;
  return [
    testCopy
      ? { id: "test-copy", label: testCopy.label, icon: "copy", group: "manage", run: testCopy.run }
      : { id: "test-copy", label: "Copy status", icon: "copy", group: "manage", disabledReason: NOT_A_COPY_REASON, run: NOOP },
    copyAgain
      ? { id: "copy-again", label: "Copy this table again", icon: "copy", group: "manage", run: copyAgain }
      : {
          id: "copy-again",
          label: "Copy this table again",
          icon: "copy",
          group: "manage",
          disabledReason: NOT_A_COPY_REASON,
          run: NOOP,
        },
    rowChangeAgent
      ? { id: "row-change-agent", label: ROW_CHANGE_AGENT_LABEL, icon: "bell", group: "built-on", run: rowChangeAgent }
      : {
          id: "row-change-agent",
          label: ROW_CHANGE_AGENT_LABEL,
          icon: "bell",
          group: "built-on",
          disabledReason: "Not available here",
          run: NOOP,
        },
  ];
}

/** A host's extra entries as the page used to take them (`{key, label, onSelect}`). */
export interface TableMenuExtra {
  key: string;
  label: string;
  onSelect: () => void;
}

const EXTRA_LOOK: Record<string, Pick<ObjectAction, "icon" | "group">> = {
  workflows: { icon: "blocks", group: "built-on" },
  "row-change-agent": { icon: "bell", group: "built-on" },
  "test-copy": { icon: "copy", group: "manage" },
  "copy-again": { icon: "copy", group: "manage" },
};

/**
 * THE PAGE'S EXTRAS INTO THE ONE ACTION LIST. records-ui's `TablePage` no longer takes
 * `menuExtras`; its menu is `tableActions()` and a host adds through `actionHost.extend`. Every
 * extra the host offers rides that door, so nothing the page offered is silently dropped.
 */
export function extrasAsActionHost(extras: readonly TableMenuExtra[] | undefined): {
  extend: () => ObjectAction[];
} {
  return {
    extend: () =>
      (extras ?? []).map((e) => ({
        id: e.key,
        label: e.label,
        ...(EXTRA_LOOK[e.key] ?? { icon: "blocks" as const, group: "built-on" as const }),
        run: e.onSelect,
      })),
  };
}
