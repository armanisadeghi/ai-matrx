import { McpServersAdminPage } from "@/features/tool-registry/mcp-admin/components/McpServersAdminPage";

export const metadata = {
  title: "MCP Servers | Tool Registry | Administration",
  description:
    "Admin view of MCP servers (tl_mcp_server) — sync status, configs, connected users, per-server tool catalog, connection testing, and one-click provisioning.",
};

export default function Page() {
  return <McpServersAdminPage />;
}
