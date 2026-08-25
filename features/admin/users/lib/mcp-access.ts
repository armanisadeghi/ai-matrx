export const MCP_FULL_ACCESS_PERMISSION = "mcp.full_access";

export function hasMcpFullAccessPermission(
  appMetadata: Record<string, unknown>,
): boolean {
  const permissions = appMetadata.permissions;
  return (
    Array.isArray(permissions) &&
    permissions.includes(MCP_FULL_ACCESS_PERMISSION)
  );
}

export function withMcpFullAccessPermission(
  appMetadata: Record<string, unknown>,
  enabled: boolean,
): Record<string, unknown> {
  const current = Array.isArray(appMetadata.permissions)
    ? appMetadata.permissions.filter(
        (permission): permission is string => typeof permission === "string",
      )
    : [];
  const permissions = new Set(current);
  if (enabled) permissions.add(MCP_FULL_ACCESS_PERMISSION);
  else permissions.delete(MCP_FULL_ACCESS_PERMISSION);
  return { ...appMetadata, permissions: [...permissions].sort() };
}
