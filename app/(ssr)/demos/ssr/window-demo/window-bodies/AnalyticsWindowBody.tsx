"use client";

const STATS = [
  { label: "Requests", value: "12.4k", delta: "+8%" },
  { label: "Errors", value: "0.3%", delta: "-2%" },
  { label: "Latency", value: "42ms", delta: "-5ms" },
];

const BAR_HEIGHTS = [40, 65, 45, 80, 55, 90, 70, 85, 60, 95, 75, 100];

export function AnalyticsWindowBody() {
  return (
    <div className="p-4 h-full flex flex-col gap-3">
      <div className="grid grid-cols-3 gap-3">
        {STATS.map((stat) => (
          <div
            key={stat.label}
            className="rounded-lg bg-muted/50 border border-border p-3"
          >
            <div className="text-xs text-muted-foreground">{stat.label}</div>
            <div className="text-lg font-bold mt-0.5">{stat.value}</div>
            <div className="text-xs text-emerald-500 mt-0.5">{stat.delta}</div>
          </div>
        ))}
      </div>
      <div className="flex-1 rounded-lg bg-muted/30 border border-border flex items-end gap-1.5 px-4 pb-4 pt-2 min-h-0">
        {BAR_HEIGHTS.map((h, i) => (
          <div
            key={i}
            className="flex-1 rounded-sm bg-violet-500/70 hover:bg-violet-400 transition-colors"
            style={{ height: `${h}%` }}
          />
        ))}
      </div>
    </div>
  );
}
