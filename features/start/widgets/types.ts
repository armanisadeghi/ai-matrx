// features/start/widgets/types.ts — THE START PAGE IS A DOCUMENT OF WIDGETS (lane START-PAGE, plan:
// common-docs/systems/board/start/PLAN.md). The document is the only thing saved; every widget reads
// live data at render through its feature's own hook or service.
import type { ComponentType } from "react";
import type { LucideIcon } from "lucide-react";
import type { BoardSection } from "@/features/board/items/types";

export type StartWidgetSize = "s" | "m" | "l";
export const START_WIDGET_SIZES: readonly StartWidgetSize[] = ["s", "m", "l"];
export const START_WIDGET_SIZE_LABEL: Record<StartWidgetSize, string> = { s: "Small", m: "Medium", l: "Wide" };

export type StartWidgetConfig = Record<string, string>;

export interface StartWidget {
  id: string;
  /** A registry key. An unknown key survives parse and renders a named "unavailable" slot. */
  type: string;
  size: StartWidgetSize;
  config: StartWidgetConfig;
  /** Config entries that are not text (a newer widget's lists or objects): kept as stored, written back untouched. */
  keep?: Record<string, unknown>;
}

export interface StartDoc {
  schema: 1;
  widgets: StartWidget[];
}

/** One basic config field Edit mode shows. `options` = a choice; absent = free text. */
export interface StartWidgetField {
  key: string;
  label: string;
  options?: readonly { value: string; label: string }[];
  /** A picker over live data instead of fixed options (`dataPage`: the person's data pages). */
  picker?: "dataPage" | "dataTable" | "metricKeys";
}

/** What a widget is, without its body — the catalog an agent and the history list read. */
export interface StartWidgetSpec {
  key: string;
  label: string;
  icon: LucideIcon;
  section: BoardSection;
  sizes: readonly StartWidgetSize[];
  defaultConfig: StartWidgetConfig;
  fields: readonly StartWidgetField[];
  /** One line naming this widget with this config ("Tasks count", "Recent notes"). */
  describe: (config: StartWidgetConfig) => string;
}

export interface StartWidgetBodyProps {
  config: StartWidgetConfig;
  size: StartWidgetSize;
}

export interface StartWidgetType extends StartWidgetSpec {
  Body: ComponentType<StartWidgetBodyProps>;
}
