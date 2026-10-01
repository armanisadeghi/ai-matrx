// app/(admin)/administration/chat/cx-dashboard/usage/page.tsx — RETIRED (lane DRILL-PRESETS-RETIRE,
// THE FLIP).
//
// The CX usage tab's cuts are the built-in Saved views of AI model calls (`ai_calls`), on the usage
// explorer (`/administration/usage?def=ai_calls`); `chat.cx_usage_analytics` stays their parity
// oracle. The tab's window and person carry over: timeframe day / week / month / quarter → 24h / 7d /
// 30d / 90d (all → all time), a custom start/end → that range, user_id → the person.

import { redirect } from "next/navigation";

import { usageDefinitionHref } from "@/features/admin/usage-drill/usageLinks";

const TIMEFRAME: Record<string, string> = { day: "24h", week: "7d", month: "30d", quarter: "90d" };

export default async function CxUsagePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const p = await searchParams;
  const one = (k: string) => (typeof p[k] === "string" ? (p[k] as string) : null);
  const params = new URLSearchParams();
  const start = one("start_date");
  const end = one("end_date");
  const timeframe = one("timeframe") ?? "month";
  if (timeframe === "custom" && start && end) params.set("w", `${start}..${end}`);
  else if (TIMEFRAME[timeframe]) params.set("w", TIMEFRAME[timeframe]!);
  const person = one("user_id");
  if (person) params.set("f.person", person);
  redirect(usageDefinitionHref("ai_calls", { view: "cx_by_model", params }));
}
