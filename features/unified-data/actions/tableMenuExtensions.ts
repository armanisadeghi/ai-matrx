// features/unified-data/actions/tableMenuExtensions.ts
//
// THE TABLE PAGE'S OWN ENTRIES, as entries of the ONE action list (lane TABLE-ACTIONS).
//
// The table page's own entries — Workflows and "When a row changes, run an agent…" — belong to
// features of this app, not to the package, so they arrive through `host.extend`, always in the
// list, disabled with a reason where they do not apply, so no seat ever meets a menu of a different
// shape. (The test-copy line and "Copy this table again" left with the switch's Copy again
// machinery after its soak — lane ONE-HOME wave 4.)

import type { ObjectAction } from "@ai-matrx/records-ui/object-actions";
import { ROW_CHANGE_AGENT_LABEL } from "../row-change-agent/RowChangeAgentLink";

export interface TableMenuExtras {
  /** The row-change agent offer: opens the schedule, or says why it is not available. */
  rowChangeAgent?: () => void;
  /** Workflows on this table (lane 11): the simple builder for this table. */
  workflows?: () => void;
  /** Automations on this table ("when a row is added / edited / a date arrives…"): opens the panel. */
  automations?: () => void;
}

const NOOP = () => {};

/** The two entries, in their one order — pass as `host.extend`'s result. */
export function tableMenuExtensions(extras: TableMenuExtras): ObjectAction[] {
  const { rowChangeAgent, workflows, automations } = extras;
  return [
    workflows
      ? { id: "workflows", label: "Workflows", icon: "blocks", group: "built-on", run: workflows }
      : { id: "workflows", label: "Workflows", icon: "blocks", group: "built-on", disabledReason: "Not available here", run: NOOP },
    automations
      ? { id: "automations", label: "Automations", icon: "bell", group: "built-on", run: automations }
      : { id: "automations", label: "Automations", icon: "bell", group: "built-on", disabledReason: "Not available here", run: NOOP },
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
  automations: { icon: "bell", group: "built-on" },
  "row-change-agent": { icon: "bell", group: "built-on" },
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
