// lib/organization/chat-org-port.ts
//
// This app's organization funnel, as @ai-matrx/chat's org port `require` (PACKAGE-INDEPENDENCE.md
// P7). The package asks through `org.require(reason, options)`; this maps the ask onto the ONE
// funnel the rest of the app uses: `ensureOrgId(null)` — the active organization after the load
// ladder has answered. It never prompts and never picks.

import type { ChatOrgRequireOptions } from "@ai-matrx/chat/host";
import { ensureOrgId } from "@/lib/organizations/ensureOrgId";

export function requireOrganizationForChat(
  _reason: string,
  _options?: ChatOrgRequireOptions,
): Promise<string> {
  return ensureOrgId(null);
}
