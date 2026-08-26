// features/hr/people/org-chart/orgChartExport.ts
//
// 🚨 THE CSV IS THE CHART'S ROWS, NOT A DIRECTORY DUMP (SPEC-EMPLOYEES §5.2).
// One row per node, with the manager it is drawn under, the level it sits at,
// and the as-of date on EVERY row — because a chart export without the date it
// was true on is an assertion nobody can check.
//
// The as-of date also travels in the FILENAME and in a header line, so a file
// that leaves this app carries what it is.
//
// It is safe to build client-side precisely because it carries nothing the chart
// does not already draw: display name, title, department, location, manager,
// FTE, worker class. No Confidential-tier column is in `hr_org_chart`'s payload
// at all, so none can leak into this file. The DIRECTORY export is a different
// story and is deliberately not shipped unaudited — see
// `hr.people.directory-export` in the coming-soon registry.

import type { HrOrgChart } from "../../types";

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function orgChartExportName(asOf: string, extension: string): string {
  return `org-chart-as-of-${asOf}.${extension}`;
}

/** Depth of each node, computed the same way the layout does. */
function depths(chart: HrOrgChart): Map<string, number> {
  const managerOf = new Map(
    chart.nodes.map((node) => [node.employment_id, node.manager_employment_id]),
  );
  const out = new Map<string, number>();

  for (const node of chart.nodes) {
    let depth = 0;
    let current = node.manager_employment_id;
    const seen = new Set<string>([node.employment_id]);
    // The same cycle guard the layout uses: a loop stops rather than hanging.
    while (current && !seen.has(current) && managerOf.has(current)) {
      seen.add(current);
      depth += 1;
      current = managerOf.get(current) ?? null;
    }
    out.set(node.employment_id, depth);
  }
  return out;
}

export function buildOrgChartCsv(chart: HrOrgChart): string {
  const level = depths(chart);
  const nameOf = new Map(
    chart.nodes.map((node) => [node.employment_id, node.display_name]),
  );
  const cycles = new Set(chart.cycles);

  const lines: string[] = [];
  // A header line before the columns, so the date survives being opened in a
  // spreadsheet and re-saved.
  lines.push(`# Org chart as of ${chart.as_of}`);
  lines.push(
    [
      "as_of",
      "level",
      "display_name",
      "job_title",
      "department",
      "location",
      "manager",
      "fte",
      "worker_class",
      "placement",
      "employee_id",
      "employment_id",
    ].join(","),
  );

  for (const node of chart.nodes) {
    lines.push(
      [
        chart.as_of,
        level.get(node.employment_id) ?? 0,
        node.display_name,
        node.job_title,
        node.department,
        node.location,
        node.manager_employment_id
          ? (nameOf.get(node.manager_employment_id) ?? "")
          : "",
        node.fte,
        node.worker_class,
        cycles.has(node.employment_id) ? "reporting loop" : "on chart",
        node.employee_id,
        node.employment_id,
      ]
        .map(csvCell)
        .join(","),
    );
  }

  // 🚨 THE TRAY IS IN THE FILE TOO. Somebody who exports the chart to review
  // headcount must not silently lose the people the chart could not place.
  for (const person of chart.unplaced) {
    lines.push(
      [
        chart.as_of,
        "",
        person.display_name,
        "",
        "",
        "",
        "",
        "",
        "",
        `not yet placed — ${person.reason}`,
        person.employee_id,
        person.employment_id,
      ]
        .map(csvCell)
        .join(","),
    );
  }

  return lines.join("\n");
}

export function downloadOrgChartCsv(chart: HrOrgChart): void {
  const blob = new Blob([buildOrgChartCsv(chart)], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = orgChartExportName(chart.as_of, "csv");
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
