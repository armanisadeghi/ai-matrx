"use client";

/**
 * CollectionRunView — the client half of the standalone
 * `/marketing/ai-visibility/runs/[runId]` resolver route. The server page owns
 * the RLS read + AccessGate; this component owns parsing the run result
 * (`parsePublicVisibilityResult` is client code) and rendering either the
 * canonical AiVisibilityReport or the plain run record, with the canonical
 * ShareButton in the header.
 */

import { ShareButton } from "@/features/sharing/components/ShareButton";
import {
  AiVisibilityReport,
  parsePublicVisibilityResult,
} from "@/features/marketing/seo/ai-visibility/AiVisibilityReport";

export interface CollectionRunViewRun {
  id: string;
  provider: string;
  capability: string;
  operation: string;
  status: string;
  requested_at: string;
  completed_at: string | null;
  result: unknown;
}

export function CollectionRunView({ run }: { run: CollectionRunViewRun }) {
  const report = parsePublicVisibilityResult(run.result);
  const resourceName = report
    ? `${report.brand_name} AI Visibility Report`
    : `${run.provider} ${run.operation} run`;

  return (
    <main className="h-full overflow-y-auto bg-textured p-4 sm:p-6">
      <div className="mx-auto grid w-full max-w-6xl gap-4">
        <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <header className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {report ? "AI visibility report" : "Collection run"}
              </p>
              <h1 className="truncate text-xl font-semibold">{resourceName}</h1>
              <p className="mt-1 font-mono text-xs text-muted-foreground">
                {run.id}
              </p>
            </div>
            <ShareButton
              resourceType="seo_collection_run"
              resourceId={run.id}
              resourceName={resourceName}
            />
          </header>
        </section>
        {report ? (
          <AiVisibilityReport result={report} />
        ) : (
          <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <dt className="text-xs text-muted-foreground">Provider</dt>
                <dd>{run.provider}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Capability</dt>
                <dd>{run.capability}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Status</dt>
                <dd className="capitalize">{run.status}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Requested</dt>
                <dd>{new Date(run.requested_at).toLocaleString()}</dd>
              </div>
            </dl>
            <p className="mt-4 text-sm text-muted-foreground">
              {run.completed_at
                ? `Completed ${new Date(run.completed_at).toLocaleString()}.`
                : "This run has not completed yet."}{" "}
              This run did not produce a shareable AI visibility report, so
              only the run record is shown here.
            </p>
          </section>
        )}
      </div>
    </main>
  );
}
