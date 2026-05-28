"use client";

import { cn } from "@/lib/utils";

const SAMPLE_LOGS = [
  { level: "INFO" as const, msg: "Server started on port 3000", t: "10:01:02" },
  { level: "INFO" as const, msg: "Connected to database", t: "10:01:03" },
  { level: "WARN" as const, msg: "Memory usage above 75%", t: "10:01:45" },
  { level: "INFO" as const, msg: "GET /api/users 200 14ms", t: "10:02:11" },
  {
    level: "ERROR" as const,
    msg: "Failed to reach upstream service",
    t: "10:02:33",
  },
  { level: "INFO" as const, msg: "Retrying connection...", t: "10:02:34" },
  { level: "INFO" as const, msg: "Connection restored", t: "10:02:36" },
];

export function LogViewerWindowBody() {
  return (
    <div className="p-3 font-mono text-xs bg-zinc-900 h-full overflow-auto space-y-1">
      {SAMPLE_LOGS.map((log, i) => (
        <div key={i} className="flex gap-2">
          <span className="text-zinc-600 shrink-0">{log.t}</span>
          <span
            className={cn(
              "shrink-0 font-bold w-11",
              log.level === "ERROR"
                ? "text-red-400"
                : log.level === "WARN"
                  ? "text-yellow-400"
                  : "text-green-400",
            )}
          >
            {log.level}
          </span>
          <span className="text-zinc-300">{log.msg}</span>
        </div>
      ))}
    </div>
  );
}
