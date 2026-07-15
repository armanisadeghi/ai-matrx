import type { VariableCustomComponent } from "@/features/agents/types/agent-definition.types";
import { readStructuredList } from "@/features/agents/utils/variable-customcomponent";
import type { ContextValueType } from "@/features/scope-system/redux/contextItemsSlice";

/**
 * Storage `value_type` (which `value_*` column a context-item cell uses) derived
 * from the chosen custom component. The component drives authoring + value entry;
 * `value_type` stays the storage discriminator so the existing cell columns and
 * the chat-injection resolver keep working unchanged.
 *
 * Structured values (MediaRefs) live in `value_json` → "object". Numeric components →
 * "number" (`value_number`). Picklist bindings now emit a ```matrx reference fence STRING
 * (single or multi) → "string" (`value_text`). Everything else emits a plain string too.
 */
export function componentToValueType(
  cc: VariableCustomComponent | undefined,
): ContextValueType {
  if (!cc) return "string";

  // Picklist binding emits a ```matrx reference fence string (single or multi) → value_text.
  if (readStructuredList(cc)?.listId) return "string";

  switch (cc.type) {
    case "number":
    case "slider":
      return "number";
    // Typed scalars — each maps 1:1 to a storage value_type. datetime→value_timestamp,
    // time→value_time, percent→value_number, currency→value_json, the rest→value_text;
    // buildScopeValuePayload does the column routing.
    case "datetime":
      return "datetime";
    case "time":
      return "time";
    case "email":
      return "email";
    case "url":
      return "url";
    case "phone":
      return "phone";
    case "percent":
      return "percent";
    case "color":
      return "color";
    case "markdown":
      return "markdown";
    case "currency":
      return "currency";
    // Media components emit a MediaRef object → value_json.
    case "image":
    case "audio":
    case "video":
    case "youtube":
    case "document":
      return "object";
    default:
      // textarea / toggles / radio / select / buttons / checkbox all emit a string.
      return "string";
  }
}
