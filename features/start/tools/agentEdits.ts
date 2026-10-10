// features/start/tools/agentEdits.ts — the agent tools' pure half: validate one call against the catalog
// and apply it with the doc verbs. No React, so the same rules are unit-tested.
import { START_WIDGET_CATALOG, describeStartWidget, getStartWidgetSpec } from "../widgets/catalog";
import { addWidget, configureWidget, moveWidget, removeWidget, resizeWidget } from "../widgets/doc";
import { START_WIDGET_SIZES, type StartDoc, type StartWidgetConfig, type StartWidgetSize } from "../widgets/types";

export type AgentEdit = { ok: true; doc: StartDoc; result: Record<string, unknown> } | { ok: false; error: string };

const rec = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
const isSize = (v: unknown): v is StartWidgetSize => typeof v === "string" && (START_WIDGET_SIZES as readonly string[]).includes(v);

function cleanConfig(type: string, raw: unknown): { ok: true; config: StartWidgetConfig } | { ok: false; error: string } {
  const spec = getStartWidgetSpec(type);
  const config: StartWidgetConfig = {};
  for (const [k, v] of Object.entries(rec(raw))) {
    const field = spec?.fields.find((f) => f.key === k);
    if (!field) return { ok: false, error: `"${type}" has no config field "${k}". Fields: ${spec?.fields.map((f) => f.key).join(", ") || "none"}.` };
    const value = typeof v === "string" ? v : v == null ? "" : String(v);
    if (value && field.options && !field.options.some((o) => o.value === value)) {
      return { ok: false, error: `"${value}" is not a choice for ${k}. Choices: ${field.options.map((o) => o.value).join(", ")}.` };
    }
    config[k] = value;
  }
  return { ok: true, config };
}

export function readForAgent(doc: StartDoc, pending: number) {
  return {
    widgets: doc.widgets.map((w, position) => ({ id: w.id, type: w.type, size: w.size, config: w.config, describe: describeStartWidget(w), position })),
    pending_changes: pending,
  };
}

export function catalogForAgent() {
  return START_WIDGET_CATALOG.map((s) => ({
    type: s.key,
    label: s.label,
    section: s.section,
    sizes: s.sizes,
    default_config: s.defaultConfig,
    fields: s.fields.map((f) => ({ key: f.key, label: f.label, ...(f.options ? { options: f.options } : {}), ...(f.picker ? { picker: f.picker } : {}) })),
    describe: s.describe(s.defaultConfig),
  }));
}

export function applyAgentEdit(doc: StartDoc, tool: string, input: unknown): AgentEdit {
  const i = rec(input);
  const id = str(i.id);
  const widget = id ? doc.widgets.find((w) => w.id === id) : undefined;
  const needWidget = (): AgentEdit | null =>
    widget ? null : { ok: false, error: id ? `No widget "${id}" on the page; start_read_page lists the ids.` : "Pass the widget's `id`." };
  switch (tool) {
    case "start_add_widget": {
      const type = str(i.type);
      const spec = type ? getStartWidgetSpec(type) : undefined;
      if (!spec) return { ok: false, error: `Unknown widget type "${String(i.type)}". start_list_widgets lists them.` };
      const size = i.size === undefined ? (spec.sizes.includes("m") ? "m" : spec.sizes[0]!) : i.size;
      if (!isSize(size) || !spec.sizes.includes(size)) return { ok: false, error: `"${spec.key}" allows sizes ${spec.sizes.join(", ")}.` };
      const cfg = cleanConfig(spec.key, i.config);
      if (!cfg.ok) return cfg;
      const position = typeof i.position === "number" ? i.position : undefined;
      const next = addWidget(doc, { type: spec.key, size, config: { ...spec.defaultConfig, ...cfg.config } }, position);
      const added = next.widgets.find((w) => !doc.widgets.some((d) => d.id === w.id))!;
      return { ok: true, doc: next, result: { ok: true, id: added.id, position: next.widgets.indexOf(added) } };
    }
    case "start_remove_widget": {
      const missing = needWidget();
      if (missing) return missing;
      return { ok: true, doc: removeWidget(doc, id!), result: { ok: true, removed: id } };
    }
    case "start_move_widget": {
      const missing = needWidget();
      if (missing) return missing;
      if (typeof i.position !== "number") return { ok: false, error: "Pass `position` (0-based)." };
      const next = moveWidget(doc, id!, i.position);
      return { ok: true, doc: next, result: { ok: true, id, position: next.widgets.findIndex((w) => w.id === id) } };
    }
    case "start_resize_widget": {
      const missing = needWidget();
      if (missing) return missing;
      const spec = getStartWidgetSpec(widget!.type);
      if (!isSize(i.size) || (spec && !spec.sizes.includes(i.size))) return { ok: false, error: `This widget allows sizes ${spec?.sizes.join(", ") ?? "s, m, l"}.` };
      return { ok: true, doc: resizeWidget(doc, id!, i.size), result: { ok: true, id, size: i.size } };
    }
    case "start_configure_widget": {
      const missing = needWidget();
      if (missing) return missing;
      const cfg = cleanConfig(widget!.type, i.config);
      if (!cfg.ok) return cfg;
      const next = configureWidget(doc, id!, cfg.config);
      return { ok: true, doc: next, result: { ok: true, id, config: next.widgets.find((w) => w.id === id)!.config } };
    }
    default:
      return { ok: false, error: `Unknown tool ${tool}.` };
  }
}
