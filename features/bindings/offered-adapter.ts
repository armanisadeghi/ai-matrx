// features/bindings/offered-adapter.ts
//
// THE OFFERED-VALUE ADAPTER — one translation, in one place, so the ONE binding
// row component (`features/surfaces/admin/columns/SurfaceVariableBinding.tsx`)
// can render a MANDATE's offered inventory without knowing a mandate exists.
//
// The row component's picker speaks `SurfaceValue` (name, human label,
// description, logical type, always-available, size hint). A mandate's
// provision speaks `OfferedValue` (name, kind slug, guaranteed, lazy,
// description). They describe the same thing — a named value a call site can
// supply — so the fix is a translation, never a second picker.
//
// PURE on purpose: jest holds it (`__tests__/offered-adapter.test.ts`).

import type { SurfaceValue, SurfaceValueType } from "@/features/surfaces/types";
import {
  GENERIC_VALUE_KINDS,
  MEDIA_VALUE_KINDS,
  SCALAR_VALUE_KINDS,
  type OfferedValue,
} from "@/features/mandates/provision-shapes";
import { formatVariableDisplayName } from "@/features/agents/utils/variable-utils";

/**
 * Kind slug → the row picker's logical type. Anything that is not a known
 * generic scalar/media slug is a REGISTERED CONTENT KIND, which is structured
 * by definition — `object` is the honest answer, and it is what drives the
 * "structured shapes ride context" refusal downstream.
 */
export function offeredKindToValueType(kind: string): SurfaceValueType {
  switch (kind) {
    case "text":
    case "string":
    case "markdown":
      return "string";
    case "number":
    case "integer":
      return "number";
    case "boolean":
      return "boolean";
    case "string_list":
    case "file_list":
      return "array";
    case "file":
      return "document";
    default:
      // `json` and every registered content_ir kind.
      return "object";
  }
}

/** True when a value of this kind can be substituted into a prompt variable. */
export function offeredKindIsScalar(kind: string): boolean {
  return SCALAR_VALUE_KINDS.has(kind);
}

/** True when this kind rides the media channel (a turn block, never text). */
export function offeredKindIsMedia(kind: string): boolean {
  return MEDIA_VALUE_KINDS.has(kind);
}

/** True when the kind slug is a registered content_ir kind rather than one of
 * the fixed generic schemas — the ones whose chip links to `/shapes/[kind]`. */
export function offeredKindIsRegistered(kind: string): boolean {
  return !GENERIC_VALUE_KINDS.has(kind);
}

/**
 * One offered value, in the shape the shared row picker reads.
 *
 * `typicalCharCount` is 0 because a provision does not declare a size today —
 * and 0 means "no size hint", which every consumer already renders as absent.
 * Inventing a number here would be a stand-in that lies; when the provision
 * gains a size the adapter is the one line that changes.
 */
export function offeredValueToSurfaceValue(value: OfferedValue): SurfaceValue {
  return {
    name: value.name,
    label: formatVariableDisplayName(value.name),
    description: value.description,
    valueType: offeredKindToValueType(value.kind),
    alwaysAvailable: value.guaranteed,
    typicalCharCount: 0,
  };
}

export function offeredValuesToSurfaceValues(
  values: readonly OfferedValue[],
): SurfaceValue[] {
  return values.map(offeredValueToSurfaceValue);
}
