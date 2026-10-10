// features/start/widgets/registry.tsx — THE ONE START WIDGET REGISTRY: each catalog entry with its body.
// A body reads through its feature's own existing hook or service (no new data paths).
import type { ComponentType } from "react";
import { START_WIDGET_CATALOG } from "./catalog";
import type { StartWidgetBodyProps, StartWidgetType } from "./types";
import { MetricWidget } from "./bodies/MetricWidget";
import { RecentWidget } from "./bodies/RecentWidget";
import { TasksWidget } from "./bodies/TasksWidget";
import { AgendaWidget } from "./bodies/AgendaWidget";
import { FavoritesWidget } from "./bodies/FavoritesWidget";
import { AgentsWidget } from "./bodies/AgentsWidget";
import { PageWidget } from "./bodies/PageWidget";

const BODIES: Record<string, ComponentType<StartWidgetBodyProps>> = {
  metric: MetricWidget,
  recent: RecentWidget,
  tasks: TasksWidget,
  agenda: AgendaWidget,
  favorites: FavoritesWidget,
  agents: AgentsWidget,
  page: PageWidget,
};

export const START_WIDGETS: readonly StartWidgetType[] = START_WIDGET_CATALOG.flatMap((spec) => {
  const Body = BODIES[spec.key];
  return Body ? [{ ...spec, Body }] : [];
});

/** Catalog keys with no body (the guard test asserts this is empty). */
export const START_WIDGETS_WITHOUT_BODY = START_WIDGET_CATALOG.filter((s) => !BODIES[s.key]).map((s) => s.key);

export function getStartWidgetType(key: string): StartWidgetType | undefined {
  return START_WIDGETS.find((w) => w.key === key);
}
