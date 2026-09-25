// features/mandates/overrides-simple/format-setting-value.ts
//
// One plain, read-only rendering of a model setting's value — what a row shows
// when it is NOT overridden. The editor (`SettingControlInput`) only appears
// once the person chooses to override that row.

import { humanizeSettingKey } from "@/lib/redux/slices/agent-settings/settings-catalogue";
import type { ControlDefinition } from "@/lib/redux/slices/agent-settings/types";

/** `{ type: "json_object" }` → `"json_object"` (the response_format shape). */
function flattenTypeObject(value: unknown): unknown {
  if (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    "type" in value &&
    Object.keys(value).length === 1
  ) {
    return (value as { type: unknown }).type;
  }
  return value;
}

export function formatSettingValue(
  value: unknown,
  control: ControlDefinition | null,
): string {
  const flat = flattenTypeObject(value);
  if (flat === undefined || flat === null || flat === "") return "Not set";
  if (typeof flat === "boolean") return flat ? "On" : "Off";
  if (control?.type === "enum" && typeof flat === "string") {
    return humanizeSettingKey(flat);
  }
  if (typeof flat === "number") return flat.toLocaleString();
  if (typeof flat === "string") return flat;
  if (Array.isArray(flat)) {
    if (flat.length === 0) return "None";
    if (flat.every((item) => typeof item === "string")) return flat.join(", ");
  }
  const json = JSON.stringify(flat);
  return json.length > 80 ? `${json.slice(0, 77)}…` : json;
}
