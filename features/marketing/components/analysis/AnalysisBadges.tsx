import { Badge } from "@/components/ui/badge";

export const SEVERITY_OPTIONS = [
  { value: "critical", label: "Critical" },
  { value: "high", label: "High" },
  { value: "med", label: "Medium" },
  { value: "low", label: "Low" },
  { value: "info", label: "Info" },
];

export const FINDING_STATUS_OPTIONS = [
  { value: "open", label: "Open" },
  { value: "acknowledged", label: "Acknowledged" },
  { value: "reopened", label: "Reopened" },
  { value: "resolved", label: "Resolved" },
];

export const SUBJECT_TYPE_OPTIONS = [
  { value: "site", label: "Site" },
  { value: "page", label: "Page" },
  { value: "snapshot", label: "Snapshot" },
];

export const RESULT_STATUS_OPTIONS = [
  { value: "pass", label: "Pass" },
  { value: "warn", label: "Warning" },
  { value: "fail", label: "Fail" },
  { value: "error", label: "Error" },
  { value: "n_a", label: "Not applicable" },
];

export function SeverityBadge({ value }: { value: string | null }) {
  const severity = value || "unknown";
  const variant =
    severity === "critical" || severity === "high"
      ? "destructive"
      : severity === "med"
        ? "warning"
        : severity === "low"
          ? "secondary"
          : "outline";
  return (
    <Badge variant={variant} className="whitespace-nowrap capitalize">
      {severity === "med" ? "medium" : severity}
    </Badge>
  );
}

export function FindingStatusBadge({ value }: { value: string }) {
  const variant =
    value === "resolved"
      ? "success"
      : value === "reopened"
        ? "destructive"
        : value === "acknowledged"
          ? "warning"
          : "secondary";
  return (
    <Badge variant={variant} className="whitespace-nowrap capitalize">
      {value.replaceAll("_", " ")}
    </Badge>
  );
}

export function ResultStatusBadge({ value }: { value: string }) {
  const variant =
    value === "pass"
      ? "success"
      : value === "warn"
        ? "warning"
        : value === "fail" || value === "error"
          ? "destructive"
          : "outline";
  return (
    <Badge variant={variant} className="whitespace-nowrap capitalize">
      {value === "n_a" ? "not applicable" : value}
    </Badge>
  );
}
