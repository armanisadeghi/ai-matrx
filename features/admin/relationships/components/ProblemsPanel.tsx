"use client";

// features/admin/relationships/components/ProblemsPanel.tsx
//
// The single unified drift report — every problem the admin must resolve,
// from admin_relationship_problems(). Rendered on the hub Overview tab.
// Presentational: the parent owns the mutations ("Register as known" runs
// inline; "Register as shareable" / "Open rule" navigate to the Sharing /
// Rules tabs with a consume-once query param).

import { ArrowRight, ShieldAlert, ShieldCheck } from "lucide-react";

import { EntityTypeChip } from "@/components/entity-types/EntityTypeChip";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { PROBLEM_TITLES, problemHuman, RELATIONSHIPS_LOCATION } from "../utils";
import type { RelationshipProblem } from "../types";

interface Props {
  problems: RelationshipProblem[];
  errorCount: number;
  warningCount: number;
  busy: boolean;
  onRegister: (source: string, target: string, label: string | null) => void;
  onRegisterShareable: (token: string) => void;
  onEdit: (source: string, target: string, label: string | null) => void;
}

export function ProblemsPanel({
  problems,
  errorCount,
  warningCount,
  busy,
  onRegister,
  onRegisterShareable,
  onEdit,
}: Props) {
  if (problems.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400">
        <ShieldCheck className="h-4 w-4" />
        No drift detected — every association shape is registered, directions
        are clean, and every conveying container is shareable.
      </div>
    );
  }

  return (
    <section className="flex flex-col gap-2 rounded-md border border-border bg-card p-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <ShieldAlert className="h-4 w-4 text-destructive" />
          Drift &amp; problems
          {errorCount > 0 ? (
            <Badge variant="destructive">
              {errorCount} error{errorCount === 1 ? "" : "s"}
            </Badge>
          ) : null}
          {warningCount > 0 ? (
            <Badge
              variant="outline"
              className="border-amber-500/50 text-amber-600 dark:text-amber-500"
            >
              {warningCount} warning{warningCount === 1 ? "" : "s"}
            </Badge>
          ) : null}
        </h2>
        <div className="ml-auto">
          <CopyButtons
            size="icon"
            label="Drift & problems"
            human={() => problems.map(problemHuman).join("\n\n---\n\n")}
            agent={() => ({
              kind: "relationship-problems",
              location: RELATIONSHIPS_LOCATION,
              description:
                "Unified drift report from admin_relationship_problems().",
              data: problems,
              summary: problems.map(problemHuman).join("\n---\n"),
              attributes: {
                count: problems.length,
                errors: errorCount,
                warnings: warningCount,
              },
            })}
          />
        </div>
      </div>
      <div className="overflow-x-auto rounded-md border border-border">
        <Table>
          <TableBody>
            {problems.map((p, i) => (
              <TableRow
                key={`${p.kind}:${p.source_type}:${p.target_type}:${p.label ?? ""}:${i}`}
              >
                <TableCell className="w-1">
                  <span
                    className={`block h-2 w-2 rounded-full ${p.severity === "error" ? "bg-destructive" : "bg-amber-500"}`}
                    aria-label={p.severity}
                  />
                </TableCell>
                <TableCell className="whitespace-nowrap text-xs font-medium">
                  {PROBLEM_TITLES[p.kind] ?? p.kind}
                </TableCell>
                <TableCell>
                  <span className="flex items-center gap-1.5">
                    <EntityTypeChip token={p.source_type} />
                    <ArrowRight className="h-3 w-3 text-muted-foreground" />
                    <EntityTypeChip token={p.target_type} />
                    {p.label ? (
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {p.label}
                      </span>
                    ) : null}
                  </span>
                </TableCell>
                <TableCell className="max-w-md text-xs text-muted-foreground">
                  {p.detail}
                </TableCell>
                <TableCell className="text-right text-xs tabular-nums text-muted-foreground">
                  {p.edge_count > 0 ? `${p.edge_count} edges` : ""}
                </TableCell>
                <TableCell className="w-48 text-right">
                  <div className="inline-flex items-center justify-end gap-0.5">
                    <CopyButtons
                      size="icon"
                      label={PROBLEM_TITLES[p.kind] ?? p.kind}
                      human={() => problemHuman(p)}
                      agent={() => ({
                        kind: "relationship-problem",
                        location: RELATIONSHIPS_LOCATION,
                        description:
                          "One drift/problem row from the Relationship Manager.",
                        data: p,
                        summary: problemHuman(p),
                        attributes: {
                          kind: p.kind,
                          severity: p.severity,
                          source: p.source_type,
                          target: p.target_type,
                          label: p.label,
                        },
                      })}
                    />
                    {p.kind === "unregistered_pair" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() =>
                          onRegister(p.source_type, p.target_type, p.label)
                        }
                      >
                        Register as known
                      </Button>
                    ) : p.kind === "conveying_container_not_shareable" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          onRegisterShareable(
                            p.container_side === "target"
                              ? p.target_type
                              : p.source_type,
                          )
                        }
                      >
                        Register as shareable
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          onEdit(p.source_type, p.target_type, p.label)
                        }
                      >
                        Open rule
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
