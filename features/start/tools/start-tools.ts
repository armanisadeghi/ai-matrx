/**
 * The Start page's AGENT TOOLS — what an agent working beside /start can do to the person's layout.
 * Declared once here and carried by the `matrx-user/start-page` surface manifest; executed in the browser
 * by `useStartAgentTools` through the SAME pure verbs the person's Edit mode uses (widgets/doc.ts).
 * All changes one agent turn makes are coalesced into ONE saved version, marked as the agent's (acting
 * for the person), with a note — undoable from History like any other version.
 */
import type { SurfaceClientTool } from "@ai-matrx/chat/surfaces/types";

const sizeProp = { type: "string" as const, enum: ["s", "m", "l"], description: "s = one column, m = two, l = the full row. Each widget allows only the sizes start_list_widgets lists." };
const idProp = { type: "string" as const, description: "The widget's id, from start_read_page." };
const configProp = {
  type: "object" as const,
  additionalProperties: { type: "string" as const },
  description: "Config values by field key (start_list_widgets lists each widget's fields and allowed values). An empty string clears a key.",
};

export const START_CLIENT_TOOLS: SurfaceClientTool[] = [
  {
    name: "start_read_page",
    label: "Read Start page",
    description:
      "Returns the person's Start page as it is now: {widgets: [{id, type, size, config, describe, position}], pending_changes} — `describe` is the one-line name of each widget, `position` is 0-based reading order, `pending_changes` counts changes this turn has made that are not saved yet (they save together as one version when you stop).",
    inputSchema: { type: "object", properties: {}, required: [] },
    mode: "ui",
  },
  {
    name: "start_list_widgets",
    label: "List widgets",
    description:
      "The widget catalog: [{type, label, section, sizes, default_config, fields: [{key, label, options?: [{value, label}], picker?}], describe}] — every widget that can go on the Start page, with the sizes it allows and its config fields.",
    inputSchema: { type: "object", properties: {}, required: [] },
    mode: "ui",
  },
  {
    name: "start_add_widget",
    label: "Add widget",
    description: "Adds a widget. Returns {ok, id, position}. Omit `position` to add at the end.",
    inputSchema: {
      type: "object",
      properties: {
        type: { type: "string", description: "A widget type from start_list_widgets." },
        size: sizeProp,
        config: configProp,
        position: { type: "number", description: "0-based place in reading order (optional)." },
      },
      required: ["type"],
    },
    mode: "draft",
  },
  {
    name: "start_remove_widget",
    label: "Remove widget",
    description: "Removes one widget. The person can bring it back from History.",
    inputSchema: { type: "object", properties: { id: idProp }, required: ["id"] },
    mode: "draft",
  },
  {
    name: "start_move_widget",
    label: "Move widget",
    description: "Moves one widget to a 0-based position in reading order (clamped to the ends).",
    inputSchema: { type: "object", properties: { id: idProp, position: { type: "number", description: "0-based target position." } }, required: ["id", "position"] },
    mode: "draft",
  },
  {
    name: "start_resize_widget",
    label: "Resize widget",
    description: "Changes one widget's size (only to a size that widget allows).",
    inputSchema: { type: "object", properties: { id: idProp, size: sizeProp }, required: ["id", "size"] },
    mode: "draft",
  },
  {
    name: "start_configure_widget",
    label: "Set up widget",
    description: "Sets config values on one widget (e.g. {kind: \"note\"} on a recent widget, {metric: \"tasks\"} on a count).",
    inputSchema: { type: "object", properties: { id: idProp, config: configProp }, required: ["id", "config"] },
    mode: "draft",
  },
];

export const START_TOOL_NAMES = START_CLIENT_TOOLS.map((t) => t.name);
