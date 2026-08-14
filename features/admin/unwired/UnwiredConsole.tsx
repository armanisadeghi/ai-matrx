"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { AlertTriangle, Check, Copy, ExternalLink, PlugZap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";
import { repositorySourceHref } from "@/features/admin/reporting/source-links";
import { toast } from "@/lib/toast";
import {
  DETECTOR_TITLES,
  type UnwiredFinding,
  type UnwiredHistoryPoint,
  type UnwiredReport,
} from "@/scripts/unwired/types";
import { finishWiringPrompt } from "./fix-prompt";

const STALE_AFTER_DAYS = 7;
const subscribeToNothing = () => () => {};

function ageInDays(iso: string): number {
  const elapsed = Date.now() - new Date(iso).getTime();
  return Number.isFinite(elapsed) ? Math.max(0, Math.floor(elapsed / 86_400_000)) : 0;
}

interface UnwiredConsoleProps {
  report: UnwiredReport;
  history: UnwiredHistoryPoint[];
  problems: string[];
}

export function UnwiredConsole({ report, history, problems }: UnwiredConsoleProps) {
  const [copied, setCopied] = useState<string | null>(null);
  const scanAge = useSyncExternalStore(subscribeToNothing, () => ageInDays(report.generatedAt), () => null);
  const prior = history.length > 1 ? history.at(-2) : null;
  const copyBrief = async (finding: UnwiredFinding): Promise<void> => {
    const key = `${finding.repository}:${finding.file}:${finding.line}:${finding.symbol}`;
    try {
      await navigator.clipboard.writeText(finishWiringPrompt(finding));
      setCopied(key);
      window.setTimeout(() => setCopied((value) => (value === key ? null : value)), 1500);
      toast.success("Finish-the-wiring brief copied");
    } catch {
      toast.error("Clipboard unavailable — open the source and copy the row details manually.");
    }
  };

  const columns: MatrxColumnDef<UnwiredFinding>[] = [
    {
      id: "lines",
      accessorKey: "lines",
      header: "Size",
      width: 100,
      cell: (finding) => <span className="font-mono font-semibold text-red-600 dark:text-red-400">{finding.lines.toLocaleString()} lines</span>,
    },
    {
      id: "repository",
      accessorKey: "repository",
      header: "Repo",
      filter: "select",
      width: 130,
      cell: (finding) => <Badge variant="outline">{finding.repository}</Badge>,
    },
    {
      id: "detector",
      accessorKey: "detector",
      header: "Unfinished wiring",
      filter: "select",
      width: 300,
      cell: (finding) => (
        <span className="block truncate" title={DETECTOR_TITLES[finding.detector]}>
          {DETECTOR_TITLES[finding.detector]}
        </span>
      ),
    },
    {
      id: "source",
      accessorFn: (finding) => `${finding.file}:${finding.line}`,
      header: "Source",
      width: 440,
      cell: (finding) => (
        <Link
          href={repositorySourceHref(finding.repository, finding.file, finding.line)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(event) => event.stopPropagation()}
          title={`Open ${finding.file}:${finding.line} on ${finding.repository} main`}
          className="flex min-w-0 items-center gap-1 font-mono text-xs text-foreground underline-offset-2 hover:text-primary hover:underline"
        >
          <span className="truncate">{finding.file}:{finding.line}</span>
          <ExternalLink className="size-3 shrink-0" />
        </Link>
      ),
    },
    {
      id: "symbol",
      accessorKey: "symbol",
      header: "Artifact",
      width: 220,
      cell: (finding) => <code className="block truncate text-xs">{finding.symbol}</code>,
    },
    {
      id: "remains",
      accessorKey: "remains",
      header: "What remains",
      width: 520,
      cell: (finding) => <span className="block line-clamp-2 text-xs text-muted-foreground" title={finding.remains}>{finding.remains}</span>,
    },
    {
      id: "brief",
      header: "Finish brief",
      width: 130,
      cell: (finding) => {
        const key = `${finding.repository}:${finding.file}:${finding.line}:${finding.symbol}`;
        return (
          <Button
            size="sm"
            variant="outline"
            onClick={(event) => {
              event.stopPropagation();
              void copyBrief(finding);
            }}
            aria-label={`Copy finish-the-wiring brief for ${finding.symbol}`}
          >
            {copied === key ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
            {copied === key ? "Copied" : "Copy brief"}
          </Button>
        );
      },
    },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-3">
      <header className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-border bg-card p-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <PlugZap className="size-5 text-red-600 dark:text-red-400" />
            <h1 className="text-lg font-semibold">Unwired work</h1>
          </div>
          <p className="mt-1 max-w-4xl text-sm text-muted-foreground">
            Purpose-built code that appears unfinished because no runtime path reaches it. The response is to hunt its intent and finish the wiring—never to treat this as a disposal list.
          </p>
        </div>
        <code className="rounded bg-muted px-2 py-1 text-xs">pnpm check:unwired:write</code>
      </header>

      {(problems.length > 0 || report.partial.length > 0 || (scanAge !== null && scanAge > STALE_AFTER_DAYS)) && (
        <div className="rounded-lg border border-red-500/50 bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300">
          <div className="flex items-center gap-2 font-semibold"><AlertTriangle className="size-4" />This snapshot cannot be read as proof of complete coverage.</div>
          {problems.map((problem) => <p key={problem} className="mt-1">{problem}</p>)}
          {report.partial.map((note) => <p key={note} className="mt-1">Partial scan: {note}</p>)}
          {scanAge !== null && scanAge > STALE_AFTER_DAYS && <p className="mt-1">Snapshot is {scanAge} days old. Refresh it with <code>pnpm check:unwired:write</code>.</p>}
        </div>
      )}

      <section className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Findings" value={report.totals.findings.toLocaleString()} />
        <Stat label="Implicated lines" value={report.totals.lines.toLocaleString()} />
        <Stat label="Files" value={report.totals.filesWithFindings.toLocaleString()} />
        <Stat label="Frontend" value={report.totals.byRepository["matrx-frontend"].toLocaleString()} />
        <Stat label="AI Dream" value={report.totals.byRepository.aidream.toLocaleString()} />
        <Stat
          label="Since prior scan"
          value={prior ? `${report.totals.lines - prior.lines >= 0 ? "+" : ""}${(report.totals.lines - prior.lines).toLocaleString()} lines` : "First snapshot"}
        />
      </section>

      <div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-border bg-card">
        <MatrxDataTable
          data={report.findings}
          columns={columns}
          getRowId={(finding) => `${finding.repository}:${finding.file}:${finding.line}:${finding.symbol}`}
          urlState={{ id: "unwired" }}
          pageSize={50}
          toolbar={{ search: true, searchPlaceholder: "Search repository, source, artifact, or remaining work…" }}
          emptyState={{
            icon: <PlugZap className="size-8 text-muted-foreground" />,
            title: "No unfinished wiring found by the completed rules",
            description: "Read scripts/unwired/FEATURE.md → Known limits before treating a clean static report as proof.",
          }}
        />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}
