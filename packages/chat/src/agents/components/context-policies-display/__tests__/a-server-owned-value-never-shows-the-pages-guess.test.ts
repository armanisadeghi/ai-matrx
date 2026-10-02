/**
 * RULES.md §5a (owner ruling 2026-10-01): identity is the server's truth. The
 * server drops the page's copy of user / client / organization / active_scopes
 * and states its own, so before any receipt the full view says the server
 * fills them — it never shows the page's guess as what will be sent.
 */

import { isServerOwnedContextKey } from "../ContextRulesPanel";

it("the server-owned keys are exactly the identity values", () => {
  for (const key of ["user", "client", "organization", "active_scopes"]) {
    expect(isServerOwnedContextKey(key)).toBe(true);
  }
  for (const key of ["route_brief", "conversation", "project", "task", "selected_work_order"]) {
    expect(isServerOwnedContextKey(key)).toBe(false);
  }
});
