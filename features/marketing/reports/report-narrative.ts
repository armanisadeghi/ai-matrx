import type {
  GscClassSummaryRow,
  GscSummaryRow,
} from "@/features/marketing/search-console/types";

export interface ReportFinding {
  id: string;
  finding: string;
  evidence: string;
  tone: "positive" | "warning" | "neutral";
}

function signedCount(value: number): string {
  return `${value > 0 ? "+" : ""}${Math.round(value).toLocaleString()}`;
}

function percentChange(current: number, previous: number): string {
  if (previous === 0) return current > 0 ? "new in this period" : "unchanged";
  const change = ((current - previous) / previous) * 100;
  return `${change > 0 ? "+" : ""}${Math.round(change)}%`;
}

export function buildReportFindings(
  summary: GscSummaryRow,
  classes: readonly GscClassSummaryRow[],
): ReportFinding[] {
  const visitChange = summary.clicks - summary.cmp_clicks;
  const visitFinding =
    visitChange > 0
      ? "Google search sent more people to the site than in the previous 28 days."
      : visitChange < 0
        ? "Google search sent fewer people to the site than in the previous 28 days."
        : "Google search sent the same number of people to the site as in the previous 28 days.";
  const money = classes.find((row) => row.traffic_class === "money");
  const mismatch = classes.find((row) => row.traffic_class === "mismatch");
  const unclassified = classes.find(
    (row) => row.traffic_class === "unclassified",
  );
  const businessClicks = money?.clicks ?? 0;
  const previousBusinessClicks = money?.cmp_clicks ?? 0;
  const lowValueClicks = (mismatch?.clicks ?? 0) + (unclassified?.clicks ?? 0);
  const qualityFinding =
    businessClicks > previousBusinessClicks
      ? "High-value searches are sending more visits, which is the strongest growth signal in this report."
      : businessClicks < previousBusinessClicks
        ? "High-value search visits fell, so the headline traffic total overstates the site's business momentum."
        : businessClicks > 0
          ? "High-value search visits held steady while the rest of the traffic mix moved around them."
          : "No visits were classified as high-value in this period, so the traffic total should not be treated as business growth.";
  const ctrPerHundred = summary.ctr * 100;
  const visibilityFinding =
    ctrPerHundred >= 5
      ? "The site is turning a healthy share of Google appearances into visits."
      : "The site appears in Google far more often than people choose it, leaving a clear click-through opportunity.";

  return [
    {
      id: "visits",
      finding: visitFinding,
      evidence: `${summary.clicks.toLocaleString()} visits · ${signedCount(visitChange)} · ${percentChange(summary.clicks, summary.cmp_clicks)} versus the previous 28 days`,
      tone:
        visitChange > 0 ? "positive" : visitChange < 0 ? "warning" : "neutral",
    },
    {
      id: "quality",
      finding: qualityFinding,
      evidence: `${businessClicks.toLocaleString()} high-value visits · ${percentChange(businessClicks, previousBusinessClicks)} versus the previous 28 days · ${lowValueClicks.toLocaleString()} mismatch or not-yet-classified visits`,
      tone:
        businessClicks > previousBusinessClicks
          ? "positive"
          : businessClicks < previousBusinessClicks || businessClicks === 0
            ? "warning"
            : "neutral",
    },
    {
      id: "visibility",
      finding: visibilityFinding,
      evidence: `${ctrPerHundred.toFixed(1)} visits per 100 Google appearances · usually around result #${summary.avg_position.toFixed(1)}`,
      tone: ctrPerHundred >= 5 ? "positive" : "warning",
    },
  ];
}
