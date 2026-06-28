/** @deprecated Legacy broker preview hooks — no-op stubs. */

import type { FieldDefinition } from "@/types/customAppTypes";
import type { ComponentType } from "@/types/customAppTypes";
import type { BrokerIdentifier } from "../types";

export function usePreviewBrokers(fieldId: string, _componentTypes: ComponentType[] | string[]) {
  return {
    getIdentifier: (componentType: ComponentType | string): BrokerIdentifier => ({
      source: "preview",
      mappedItemId: `${fieldId}-${String(componentType)}`,
    }),
  };
}

export function useFieldsWithBrokers(
  fields: Partial<FieldDefinition> | Partial<FieldDefinition>[],
  source: string,
  sourceId: string,
) {
  const normalized = (Array.isArray(fields) ? fields : [fields]).filter(Boolean) as FieldDefinition[];
  return {
    fields: normalized,
    source,
    sourceId,
  };
}

export function useServerBrokerSync(_options: {
  brokers: BrokerIdentifier[];
  syncOnChange?: boolean;
}): void {
  // Legacy server sync removed.
}
