import type { VariableCustomComponent } from "@ai-matrx/chat/agents/types/agent-definition.types";
import { readStructuredList } from "@ai-matrx/chat/agents/utils/variable-customcomponent";
import type { ContextFieldKind } from "@ai-matrx/records/scopes";

/**
 * A field's `kind` derived from the chosen custom component. The component drives authoring +
 * value entry; the kind says how the package writes and reads the cell.
 *
 * Structured values (MediaRefs) → "object". Numeric components → "number". Picklist bindings emit
 * a ```matrx reference fence STRING (single or multi) → "string". Everything else is a plain string.
 */
export function componentToValueType(
  cc: VariableCustomComponent | undefined,
): ContextFieldKind {
  if (!cc) return "string";

  // Picklist binding emits a ```matrx reference fence string (single or multi) → a string field.
  if (readStructuredList(cc)?.listId) return "string";

  switch (cc.type) {
    case "number":
    case "slider":
      return "number";
    // Typed scalars — each maps 1:1 to a field kind; the package's value write routes the cell by kind.
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
    // Media components emit a MediaRef object → an object field.
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
