"use client";

/**
 * WorkflowPeek — the workflow quick look, built to the agents peek's bar
 * (Arman, 2026-09-26: workflows are equal to agents everywhere). Same chrome
 * as `AgentSneakPeekModal`: title row with the new-tab door, a scrollable body
 * of labelled sections (description, inputs, output, steps), and a footer with
 * Close / Runs / Open.
 */

import React from "react";
import Link from "next/link";
import { ArrowRight, Braces, History, Workflow } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/utils/supabase/client";
import { NewTabLink } from "@/components/official/entity-ref/NewTabLink";
import { displayLabelForKey } from "@/features/agents/utils/variable-utils";
import { kindPhrase } from "@/features/mandates/provision-shapes";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { peekHref } from "../peekHref";
import { usePeekHrefOverride } from "../peekHrefOverride";
import type { PeekProps } from "../types";

interface WorkflowRow {
  name: string;
  description: string | null;
  variables: unknown;
  nodes: unknown;
  input_kind: string | null;
  output_kind: string | null;
  version: number;
}

/** Variable names as a person reads them, whatever shape `variables` holds. */
function inputLabels(variables: unknown): string[] {
  const entries: unknown[] = Array.isArray(variables)
    ? variables
    : variables && typeof variables === "object"
      ? Object.entries(variables as Record<string, unknown>).map(([name, value]) =>
          value && typeof value === "object" ? { name, ...(value as object) } : { name },
        )
      : [];
  const labels: string[] = [];
  for (const entry of entries) {
    if (typeof entry === "string") labels.push(displayLabelForKey(entry));
    else if (entry && typeof entry === "object") {
      const record = entry as { name?: unknown; label?: unknown; key?: unknown };
      const name = typeof record.name === "string" ? record.name : typeof record.key === "string" ? record.key : null;
      if (!name) continue;
      labels.push(typeof record.label === "string" && record.label.trim() ? record.label : displayLabelForKey(name));
    }
  }
  return labels;
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="space-y-1.5">
      <h4 className="text-[0.625rem] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </h4>
      {children}
    </section>
  );
}

function shapeWords(kind: string | null): string {
  if (!kind) return "Text";
  const phrase = kindPhrase(kind).replace(/^an? /, "");
  return phrase.charAt(0).toUpperCase() + phrase.slice(1);
}

export default function WorkflowPeek({ id, open, onClose }: PeekProps) {
  const [row, setRow] = React.useState<WorkflowRow | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const override = usePeekHrefOverride();
  const href = override !== undefined ? override : peekHref("workflow", id);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      const { data, error: readError } = await supabase
        .schema("workflow")
        .from("definition")
        .select("name, description, variables, nodes, input_kind, output_kind, version")
        .is("deleted_at", null)
        .eq("id", id)
        .maybeSingle();
      if (cancelled) return;
      if (readError) setError(readError.message);
      setRow((data as WorkflowRow | null) ?? null);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const inputs = row ? inputLabels(row.variables) : [];
  const steps = row && Array.isArray(row.nodes) ? row.nodes.length : null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="max-w-xl gap-3 border border-border bg-card p-5"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex min-w-0 items-center gap-2 pr-8">
          <Workflow className="h-4 w-4 shrink-0 text-primary" aria-hidden />
          <DialogTitle className="min-w-0 truncate text-base font-semibold text-foreground">
            {row?.name ?? "Workflow"}
          </DialogTitle>
          {row ? <NewTabLink href={href} label={row.name} /> : null}
          {row ? (
            <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground">
              v{row.version}
            </span>
          ) : null}
        </div>

        <div className="-mr-2 max-h-[65dvh] space-y-4 overflow-y-auto pr-2">
          {loading ? (
            <div className="space-y-2">
              <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
              <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
            </div>
          ) : error ? (
            <p className="text-sm text-destructive">
              {error} <ErrorAlchemyMenu error={error} />
            </p>
          ) : !row ? (
            <p className="text-sm text-muted-foreground">This workflow does not exist or is not shared with you.</p>
          ) : (
            <>
              {row.description ? (
                <p className="whitespace-pre-wrap break-words text-sm text-foreground">{row.description}</p>
              ) : null}
              <Section label="Inputs">
                {inputs.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {row.input_kind ? shapeWords(row.input_kind) : "None"}
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {inputs.map((label) => (
                      <span key={label} className="inline-flex items-center rounded-md border border-border bg-muted/40 px-2 py-0.5 text-xs text-foreground">
                        {label}
                      </span>
                    ))}
                  </div>
                )}
              </Section>
              <Section label="Output">
                <p className="flex items-center gap-1.5 text-sm text-foreground">
                  <Braces className="h-3.5 w-3.5 text-primary" aria-hidden />
                  {shapeWords(row.output_kind)}
                </p>
              </Section>
              {steps !== null ? (
                <Section label="Steps">
                  <p className="text-sm tabular-nums text-foreground">{steps}</p>
                </Section>
              ) : null}
            </>
          )}
        </div>

        {row && href ? (
          <div className="flex items-center gap-2 border-t border-border pt-3">
            <Button variant="ghost" size="sm" onClick={onClose} className="ml-auto">
              Close
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href={`/workflows/${id}/runs`} onClick={onClose}>
                <History />
                Runs
              </Link>
            </Button>
            <Button asChild size="sm">
              <Link href={href} onClick={onClose}>
                Open
                <ArrowRight />
              </Link>
            </Button>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
