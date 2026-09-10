// app/(admin)/administration/reporting/tool-refetch/page.tsx
//
// TOOL RE-FETCH REPORT — how often an agent re-asks a tool for something it was
// already given, and how much of that returned byte-identical data.
//
// Reads `chat.vw_tool_refetch_summary` / `chat.vw_tool_refetch` DIRECTLY from
// Supabase with the browser client (both views are security_invoker with SELECT
// granted to authenticated) — a data read never routes through the server.
//
// Super-admin gating is inherited from the (admin) route layout; never re-gate
// here.

import type { Metadata } from "next";

import { ToolRefetchConsole } from "@/features/admin/tool-refetch/ToolRefetchConsole";

export const metadata: Metadata = {
  title: "Tool re-fetch | Reporting | Administration",
  description:
    "Repeated tool calls per tool — how many returned identical data (bought nothing), how many were legitimate refreshes, and how many happened only after the first result was trimmed out of context.",
};

export default function ToolRefetchPage() {
  return <ToolRefetchConsole />;
}
