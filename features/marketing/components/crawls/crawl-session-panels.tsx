import { Badge } from "@/components/ui/badge";
import {
  CondensedFieldGrid,
  jsonNumber,
  jsonNumberPath,
  jsonString,
} from "@/features/marketing/components/shared/MarketingUi";
import { isJsonRecord } from "@/features/marketing/types";
import type { Json } from "@/types/database.types";

const RENDER_MODE_LABELS: Record<string, string> = {
  http_first: "HTTP, browser fallback",
  http_only: "HTTP only",
  browser_always: "Browser every page",
  browser_with_screenshot: "Browser + screenshots",
};

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDurationMs(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "—";
  const seconds = Math.round(value / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${seconds % 60}s`;
}

function boolLabel(value: unknown): string {
  return value === true ? "Yes" : value === false ? "No" : "—";
}

function stringList(value: Json): string {
  if (!Array.isArray(value) || value.length === 0) return "None";
  const items = value.filter((item): item is string => typeof item === "string");
  if (items.length === 0) return "None";
  return items.join(", ");
}

function requestRecord(scope: Json): Record<string, Json> | null {
  if (!isJsonRecord(scope)) return null;
  const request = scope.request;
  return isJsonRecord(request) ? request : null;
}

function renderModeLabel(value: Json): string {
  const mode = typeof value === "string" ? value : null;
  return mode ? (RENDER_MODE_LABELS[mode] ?? mode.replaceAll("_", " ")) : "—";
}

export function CrawlScopePanel({ scope }: { scope: Json }) {
  const request = requestRecord(scope);
  if (!request) {
    return (
      <p className="p-3 text-xs text-muted-foreground">
        No crawl scope recorded.
      </p>
    );
  }

  return (
    <CondensedFieldGrid
      fields={[
        {
          label: "Mode",
          value: jsonString(scope, "mode") ?? "full",
        },
        {
          label: "Max pages",
          value: jsonNumber(request, ["max_pages"]).toLocaleString(),
        },
        {
          label: "Concurrency",
          value: jsonNumber(request, ["concurrency"]).toLocaleString(),
        },
        {
          label: "Rendering",
          value: renderModeLabel(request.render_mode),
          span: 2,
        },
        {
          label: "Respect robots",
          value: boolLabel(request.respect_robots),
        },
        {
          label: "List mode",
          value: boolLabel(request.list_mode),
        },
        {
          label: "Host rate limit",
          value: `${jsonNumber(request, ["host_rps"])} rps · burst ${jsonNumber(request, ["host_burst"])}`,
          span: 2,
        },
        {
          label: "Max depth",
          value:
            request.max_depth === null || request.max_depth === undefined
              ? "Unlimited"
              : String(jsonNumber(request, ["max_depth"])),
        },
        {
          label: "Seed URLs",
          value: stringList(request.seed_urls ?? []),
          span: 2,
        },
        {
          label: "Include patterns",
          value: stringList(request.include_patterns ?? []),
          span: 2,
        },
        {
          label: "Exclude patterns",
          value: stringList(request.exclude_patterns ?? []),
          span: 2,
        },
      ]}
    />
  );
}

export function CrawlRunStatsPanel({ stats }: { stats: Json }) {
  if (!isJsonRecord(stats) || Object.keys(stats).length === 0) {
    return (
      <p className="p-3 text-xs text-muted-foreground">No run stats recorded.</p>
    );
  }

  const reconciliation = isJsonRecord(stats.reconciliation)
    ? stats.reconciliation
    : null;

  return (
    <div className="space-y-3 p-3">
      <CondensedFieldGrid
        fields={[
          {
            label: "Termination",
            value: (
              <Badge variant="outline" className="h-5 capitalize">
                {jsonString(stats, "termination") ?? "unknown"}
              </Badge>
            ),
          },
          {
            label: "Duration",
            value: formatDurationMs(jsonNumber(stats, ["duration_ms"])),
          },
          {
            label: "Pages discovered",
            value: jsonNumber(stats, ["pages_discovered"]).toLocaleString(),
          },
          {
            label: "Pages fetched",
            value: jsonNumber(stats, ["pages_fetched"]).toLocaleString(),
          },
          {
            label: "Pages failed",
            value: jsonNumber(stats, ["pages_failed"]).toLocaleString(),
            tone: jsonNumber(stats, ["pages_failed"]) ? "bad" : "good",
          },
          {
            label: "Bytes downloaded",
            value: formatBytes(jsonNumber(stats, ["bytes_downloaded"])),
          },
          {
            label: "Limit reached",
            value: boolLabel(stats.limit_reached),
          },
          {
            label: "Coverage qualified",
            value: boolLabel(stats.coverage_qualified),
            tone: stats.coverage_qualified === true ? "good" : "default",
          },
        ]}
      />
      {reconciliation ? (
        <div className="rounded-md border border-border bg-muted/20">
          <p className="border-b border-border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Reconciliation
          </p>
          <CondensedFieldGrid
            fields={[
              {
                label: "New",
                value: jsonNumberPath(stats, ["reconciliation", "new"]).toLocaleString(),
                tone: jsonNumberPath(stats, ["reconciliation", "new"])
                  ? "good"
                  : "default",
              },
              {
                label: "Seen",
                value: jsonNumberPath(stats, ["reconciliation", "seen"]).toLocaleString(),
              },
              {
                label: "Missing",
                value: jsonNumberPath(stats, [
                  "reconciliation",
                  "missing",
                ]).toLocaleString(),
                tone: jsonNumberPath(stats, ["reconciliation", "missing"])
                  ? "warning"
                  : "default",
              },
              {
                label: "Gone",
                value: jsonNumberPath(stats, ["reconciliation", "gone"]).toLocaleString(),
                tone: jsonNumberPath(stats, ["reconciliation", "gone"])
                  ? "warning"
                  : "default",
              },
            ]}
          />
        </div>
      ) : null}
    </div>
  );
}

function formatMetadataValue(value: Json): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return boolLabel(value);
  if (typeof value === "number") return value.toLocaleString();
  if (typeof value === "string") return value || "—";
  if (Array.isArray(value)) return stringList(value);
  return JSON.stringify(value);
}

export function CrawlMetadataPanel({ metadata }: { metadata: Json }) {
  if (
    metadata === null ||
    (Array.isArray(metadata) && metadata.length === 0) ||
    (isJsonRecord(metadata) && Object.keys(metadata).length === 0)
  ) {
    return (
      <p className="p-3 text-xs text-muted-foreground">No data recorded.</p>
    );
  }

  if (!isJsonRecord(metadata)) {
    return (
      <p className="break-words p-3 text-xs text-foreground">
        {formatMetadataValue(metadata)}
      </p>
    );
  }

  const fields = Object.entries(metadata)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => ({
      label: key.replaceAll("_", " "),
      value: formatMetadataValue(value),
      span:
        typeof value === "string" && value.length > 48
          ? (2 as const)
          : (1 as const),
    }));

  return <CondensedFieldGrid fields={fields} />;
}
