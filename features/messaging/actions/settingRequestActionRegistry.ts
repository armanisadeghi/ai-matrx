/**
 * Inline setting-action registry. A setting request carries only a stable key
 * and JSON payload; this registry binds that key to an existing canonical
 * write path. Unknown keys fail loudly and never mark the request complete.
 */

import { addOrgModuleCustomValue } from "@/features/organizations/orgModuleSettings";
import type { JsonObject } from "@/types/json";

export const ORG_MODULE_CUSTOM_VALUE_ADD_ACTION = "org_module_custom_value.add";

interface SettingRequestAction {
  label: string;
  completedLabel: string;
  execute: (
    payload: JsonObject,
    context: { organizationId: string },
  ) => Promise<void>;
}

function requiredString(payload: JsonObject, key: string): string {
  const value = payload[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("This setting request is missing required context.");
  }
  return value;
}

const ACTIONS: Record<string, SettingRequestAction> = {
  [ORG_MODULE_CUSTOM_VALUE_ADD_ACTION]: {
    label: "Add organization value",
    completedLabel: "Organization value added",
    execute: async (payload, context) => {
      const organizationId = requiredString(payload, "organization_id");
      if (organizationId !== context.organizationId) {
        throw new Error(
          "This setting request does not match its organization.",
        );
      }
      await addOrgModuleCustomValue(
        organizationId,
        requiredString(payload, "module_key"),
        requiredString(payload, "namespace"),
        requiredString(payload, "value"),
      );
    },
  },
};

export function getSettingRequestAction(
  key: string,
): SettingRequestAction | null {
  return ACTIONS[key] ?? null;
}
