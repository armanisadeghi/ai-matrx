/** Admin system-agents route family — duplicates preserve builtin status here. */
export const ADMIN_SYSTEM_AGENTS_BASE_PATH =
  "/administration/agents/system-agents/agents";

export function isAdminSystemAgentsContext(basePath: string): boolean {
  return basePath === ADMIN_SYSTEM_AGENTS_BASE_PATH;
}
