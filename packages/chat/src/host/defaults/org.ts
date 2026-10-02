/**
 * Default org port. A bare host has no organization picker, and the platform
 * rule is hold-and-set — never auto-pick. So: no active org, and `require`
 * refuses with a named, remedied error that is also shown and recorded.
 * A host with a picker (matrx-frontend) overrides this port.
 */

import type {
  ChatDiagnosticsPort,
  ChatNotifyPort,
  ChatOrgPort,
} from "../contract";
import { ChatOrganizationRequiredError } from "../errors";

export function createNoPickerOrg(
  notify: () => ChatNotifyPort,
  diagnostics: () => ChatDiagnosticsPort,
): ChatOrgPort {
  return {
    active: () => null,
    subscribe: () => () => undefined,
    require(reason: string): Promise<string> {
      const error = new ChatOrganizationRequiredError(reason);
      diagnostics().capture(error, {
        area: "org",
        code: error.code,
        detail: { reason },
      });
      notify().warning("Choose an organization first", {
        id: "chat-organization-required",
        remedy: "This app has no organization picker yet.",
      });
      return Promise.reject(error);
    },
  };
}
