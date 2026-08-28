import { ensureOrgId } from "@/lib/organizations/personalOrg";
import { resolveSystemOrgId } from "@/lib/organizations/systemOrg";
import type { AgentScope } from "./constants";

export interface ShortcutWriteScopeFields {
  userId: string | null;
  organizationId: string;
  projectId: string | null;
  taskId: string | null;
}

/**
 * Resolve shortcut/category visibility and organization ownership together.
 *
 * Visibility scope and tenant ownership are separate facts: a personal row is
 * identified by `created_by`, but it still belongs to the organization the
 * user selected. Global rows belong to the system organization. Keeping this
 * at the shared CRUD boundary prevents forms from having to know either rule.
 */
export async function resolveShortcutWriteScope(args: {
  scope: AgentScope;
  scopeId?: string;
  userId: string | null;
}): Promise<ShortcutWriteScopeFields> {
  const { scope, scopeId, userId } = args;

  if (scope === "global") {
    return {
      userId: null,
      organizationId: await resolveSystemOrgId(),
      projectId: null,
      taskId: null,
    };
  }

  if (scope === "user") {
    if (!userId) {
      throw new Error(
        "[agent-shortcuts] cannot create a personal shortcut before authentication is ready",
      );
    }
    return {
      userId,
      organizationId: await ensureOrgId(undefined),
      projectId: null,
      taskId: null,
    };
  }

  if (!scopeId) {
    throw new Error(
      `[agent-shortcuts] ${scope} scope requires an explicit scope id`,
    );
  }

  return {
    userId: null,
    organizationId:
      scope === "organization"
        ? await ensureOrgId(scopeId)
        : await ensureOrgId(undefined),
    projectId: scope === "project" ? scopeId : null,
    taskId: scope === "task" ? scopeId : null,
  };
}
