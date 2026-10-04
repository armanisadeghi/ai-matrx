/** Display-only validation of an additive server field; provider settlement is independent. */
export interface CalendarLocalRefreshView {
  state: "absent" | "malformed" | "valid";
  message: string | null;
  needsAttention: boolean;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const absent: CalendarLocalRefreshView = { state: "absent", message: null, needsAttention: false };
const malformed: CalendarLocalRefreshView = {
  state: "malformed", message: "Saved copy refresh pending", needsAttention: true,
};

export function readCalendarLocalRefresh(value: unknown): CalendarLocalRefreshView {
  if (value === undefined || value === null) return absent;
  if (!record(value)) return malformed;
  const allowed = new Set(["status", "reason", "cache_refresh_pending"]);
  if (Object.keys(value).some((key) => !allowed.has(key))) return malformed;
  const status = value.status;
  const reason = value.reason ?? null;
  const cachePending = value.cache_refresh_pending ?? false;
  if (
    typeof status !== "string" ||
    !["updated", "scrubbed", "not_saved", "detached", "pending"].includes(status) ||
    !(reason === null || reason === "refresh_pending" || reason === "series_refresh_required") ||
    typeof cachePending !== "boolean" ||
    ((status === "pending") !== (reason !== null)) ||
    (cachePending && status !== "updated" && status !== "scrubbed")
  ) return malformed;
  let message: string;
  switch (status) {
    case "updated": message = cachePending ? "Saved copy updated · refresh pending" : "Saved copy updated"; break;
    case "scrubbed": message = cachePending ? "Saved copy cleared · refresh pending" : "Saved copy cleared"; break;
    case "not_saved": message = "This event is not saved"; break;
    case "detached": message = "Saved copy kept separate"; break;
    default: message = reason === "series_refresh_required" ? "Saved series refresh pending" : "Saved copy refresh pending";
  }
  return { state: "valid", message, needsAttention: status === "pending" || cachePending };
}

export function createResultLocalRefresh(value: unknown): CalendarLocalRefreshView {
  return record(value) && record(value.result) ? readCalendarLocalRefresh(value.result.local_refresh) : malformed;
}

export function changeResultLocalRefresh(value: unknown): CalendarLocalRefreshView {
  return record(value) ? readCalendarLocalRefresh(value.local_refresh) : malformed;
}
