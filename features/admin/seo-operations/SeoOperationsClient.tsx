"use client";

/**
 * SEO Operations — the one admin console for every SEO automation, mandate,
 * and agent (Arman's ruling, 2026-08-26): nothing recurring gets switched on
 * until it can be triggered HERE, watched live, and its results judged in
 * depth — one at a time or as a batch.
 *
 * Three panels:
 * - Automations  — every recurring SEO/web task (ON and OFF), run-now per row.
 * - Mandates     — every seo.* mandate with its judge-grade goal, provision,
 *                  and output kind; doors into the full mandates console.
 * - Workbench    — the Evidence Workbench: pick a site, pick evidence values
 *                  from the shared seo.site_evidence pool, type a question,
 *                  watch the run stream, judge the answer against the exact
 *                  evidence it was shown.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";
import { toast } from "@/lib/toast";
import { runNow } from "@/features/scheduling/service/schedulerClient";
import { useSeoCommandRun } from "@/features/marketing/seo/durable-run/useSeoCommandRun";
import {
  fetchEvidenceValues,
  fetchSeoMandates,
  fetchSeoProvisions,
  fetchSeoSites,
  fetchSeoTasks,
  type EvidenceValueSpec,
  type SeoMandateRow,
  type SeoProvisionRow,
  type SeoSiteOption,
  type SeoTaskRow,
} from "./service";

// ── Automations panel ───────────────────────────────────────────────────────

function AutomationsPanel() {
  const [rows, setRows] = useState<SeoTaskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [runningId, setRunningId] = useState<string | null>(null);

  useEffect(() => {
    fetchSeoTasks()
      .then(setRows)
      .catch((error) => toast.error(`Tasks failed to load: ${String(error)}`))
      .finally(() => setLoading(false));
  }, []);

  const trigger = useCallback(async (task: SeoTaskRow) => {
    setRunningId(task.id);
    try {
      const response = await runNow(task.id);
      toast.success(
        `"${task.title}" queued — run ${response.run_id.slice(0, 8)}. Watch it under Scheduling › Runs.`,
      );
    } catch (error) {
      toast.error(`Run-now failed: ${String(error)}`);
    } finally {
      setRunningId(null);
    }
  }, []);

  const columns = useMemo<MatrxColumnDef<SeoTaskRow>[]>(
    () => [
      {
        accessorKey: "title",
        header: "Automation",
        cell: (row) => (
          <span className="font-medium text-foreground">{row.title}</span>
        ),
      },
      {
        accessorKey: "enabled",
        header: "State",
        cell: (row) =>
          row.enabled ? (
            <Badge className="bg-emerald-600/15 text-emerald-700 dark:text-emerald-400 border-transparent">
              ON
            </Badge>
          ) : (
            <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-400 border-transparent">
              OFF
            </Badge>
          ),
      },
      {
        accessorKey: "last_run_at",
        header: "Last run",
        cell: (row) =>
          row.last_run_at ? new Date(row.last_run_at).toLocaleString() : "never",
      },
      {
        accessorKey: "next_due_at",
        header: "Next due",
        cell: (row) =>
          row.next_due_at
            ? new Date(row.next_due_at).toLocaleString()
            : row.enabled
              ? "—"
              : "disabled",
      },
      {
        id: "actions",
        header: "",
        sortable: false,
        filter: false,
        cell: (row) => (
          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={runningId === row.id}
              onClick={() => void trigger(row)}
            >
              {runningId === row.id ? "Queuing…" : "Run now"}
            </Button>
            <Button size="sm" variant="ghost" asChild>
              <Link href={`/schedules/${row.id}`}>Open</Link>
            </Button>
          </div>
        ),
      },
    ],
    [runningId, trigger],
  );

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Every recurring SEO/web task, including the ones switched off in the
        2026-08-20 governance pass. <strong>Run now</strong> queues one manual
        execution without enabling the schedule — watch it under{" "}
        <Link
          className="underline underline-offset-2"
          href="/administration/automation/scheduling/runs"
        >
          Scheduling › Runs
        </Link>
        .
      </p>
      <MatrxDataTable
        urlState={{ id: "seo-ops-automations" }}
        data={rows}
        columns={columns}
        getRowId={(row) => row.id}
        isLoading={loading}
        pageSize={30}
        emptyState={{ title: "No SEO automations found" }}
        toolbar={{ search: true }}
      />
    </div>
  );
}

// ── Mandates panel ──────────────────────────────────────────────────────────

function MandatesPanel() {
  const [mandates, setMandates] = useState<SeoMandateRow[]>([]);
  const [provisions, setProvisions] = useState<SeoProvisionRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([fetchSeoMandates(), fetchSeoProvisions()])
      .then(([mandateRows, provisionRows]) => {
        setMandates(mandateRows);
        setProvisions(provisionRows);
      })
      .catch((error) => toast.error(`Mandates failed to load: ${String(error)}`))
      .finally(() => setLoading(false));
  }, []);

  const provisionByKey = useMemo(() => {
    const map = new Map<string, SeoProvisionRow>();
    for (const provision of provisions) map.set(provision.key, provision);
    return map;
  }, [provisions]);

  const columns = useMemo<MatrxColumnDef<SeoMandateRow>[]>(
    () => [
      {
        accessorKey: "mandate_key",
        header: "Mandate",
        cell: (row) => (
          <div className="min-w-56">
            <div className="font-medium text-foreground">
              {row.label || row.mandate_key}
            </div>
            <div className="font-mono text-xs text-muted-foreground">
              {row.mandate_key}
            </div>
          </div>
        ),
      },
      {
        accessorKey: "description",
        header: "Goal (the judge rubric)",
        sortable: false,
        cell: (row) => (
          <p className="max-w-2xl whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
            {row.description || "— no goal recorded —"}
          </p>
        ),
      },
      {
        accessorKey: "provision_key",
        header: "Provision",
        cell: (row) => {
          if (!row.provision_key)
            return <span className="text-xs text-muted-foreground">none</span>;
          const provision = provisionByKey.get(row.provision_key);
          return (
            <div className="text-xs">
              <span className="font-mono">{row.provision_key}</span>
              {provision ? (
                <span className="ml-1 text-muted-foreground">
                  ({provision.values.length} values)
                </span>
              ) : null}
            </div>
          );
        },
      },
      {
        accessorKey: "output_kind",
        header: "Output",
        cell: (row) =>
          row.output_kind ? (
            <Badge variant="outline" className="font-mono text-[11px]">
              {row.output_kind}
            </Badge>
          ) : (
            <Badge className="border-transparent bg-amber-500/15 text-[11px] text-amber-700 dark:text-amber-400">
              free JSON
            </Badge>
          ),
      },
      {
        id: "actions",
        header: "",
        sortable: false,
        filter: false,
        cell: (row) => (
          <Button size="sm" variant="ghost" asChild>
            <Link
              href={`/administration/agents/mandates?mandate=${encodeURIComponent(row.mandate_key)}`}
            >
              Open
            </Link>
          </Button>
        ),
      },
    ],
    [provisionByKey],
  );

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Every <span className="font-mono">seo.*</span> mandate with its
        judge-grade goal, its provision (the declared input menu), and its
        output contract. Rebinding, test runs, and version pins live in the{" "}
        <Link
          className="underline underline-offset-2"
          href="/administration/agents/mandates"
        >
          full mandates console
        </Link>
        .
      </p>
      <MatrxDataTable
        urlState={{ id: "seo-ops-mandates" }}
        data={mandates}
        columns={columns}
        getRowId={(row) => row.id}
        isLoading={loading}
        pageSize={30}
        emptyState={{ title: "No SEO mandates found" }}
        toolbar={{ search: true }}
      />
    </div>
  );
}

// ── Workbench panel ─────────────────────────────────────────────────────────

/** Mirrors aidream `site_evidence.EvidenceWorkbenchResult`. */
interface WorkbenchResult {
  question: string;
  values_used: string[];
  evidence_sizes: Record<string, number>;
  evidence: Record<string, string>;
  answer: string;
  model_id: string | null;
  agent_id: string;
}

function parseWorkbenchResult(raw: unknown): WorkbenchResult | null {
  if (!raw || typeof raw !== "object") return null;
  const candidate = raw as Record<string, unknown>;
  if (typeof candidate.answer !== "string") return null;
  return candidate as unknown as WorkbenchResult;
}

const WORKBENCH_STAGES: Record<string, string> = {
  "seo.evidence_materializing": "Materializing site evidence…",
  "seo.evidence_ready": "Evidence assembled — running the agent…",
};

function WorkbenchPanel() {
  const [sites, setSites] = useState<SeoSiteOption[]>([]);
  const [valueSpecs, setValueSpecs] = useState<EvidenceValueSpec[]>([]);
  const [siteId, setSiteId] = useState<string>("");
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(["gsc_summary", "pages_summary", "findings_open"]),
  );
  const [question, setQuestion] = useState("");

  useEffect(() => {
    fetchSeoSites()
      .then(setSites)
      .catch((error) => toast.error(`Sites failed to load: ${String(error)}`));
    fetchEvidenceValues()
      .then(setValueSpecs)
      .catch((error) =>
        toast.error(`Evidence pool failed to load: ${String(error)}`),
      );
  }, []);

  const run = useSeoCommandRun<WorkbenchResult>({
    key: "evidence-workbench",
    path: "/seo/evidence-workbench",
    finalKind: "seo.workbench_completed",
    stageLabels: WORKBENCH_STAGES,
    parseResult: parseWorkbenchResult,
    live: { label: "Evidence Workbench" },
  });

  const toggleValue = (name: string) => {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const launch = () => {
    if (!siteId) {
      toast.error("Pick a site first.");
      return;
    }
    if (!question.trim()) {
      toast.error("Type the question to answer.");
      return;
    }
    if (selected.size === 0) {
      toast.error("Select at least one evidence value.");
      return;
    }
    run.reset();
    void run.launch(
      {
        site_id: siteId,
        question: question.trim(),
        values: [...selected],
      },
      sites.find((site) => site.id === siteId)?.domain ?? siteId,
    );
  };

  const alwaysOn = new Set(["site_identity", "evidence_coverage"]);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,380px)_1fr]">
      <div className="space-y-4">
        <div className="space-y-1.5">
          <div className="text-sm font-medium">Site</div>
          <Select value={siteId} onValueChange={setSiteId}>
            <SelectTrigger>
              <SelectValue placeholder="Pick a site" />
            </SelectTrigger>
            <SelectContent>
              {sites.map((site) => (
                <SelectItem key={site.id} value={site.id}>
                  {site.domain}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <div className="text-sm font-medium">
            Evidence to hand the agent{" "}
            <span className="font-normal text-muted-foreground">
              (identity + coverage always included)
            </span>
          </div>
          <div className="max-h-72 space-y-1 overflow-y-auto rounded-md border border-border p-2">
            {valueSpecs
              .filter((spec) => !alwaysOn.has(spec.name))
              .map((spec) => (
                <label
                  key={spec.name}
                  className="flex cursor-pointer items-start gap-2 rounded px-1.5 py-1 text-sm hover:bg-muted/60"
                >
                  <Checkbox
                    checked={selected.has(spec.name)}
                    onCheckedChange={() => toggleValue(spec.name)}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="font-mono text-xs">{spec.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {spec.description}
                    </span>
                  </span>
                </label>
              ))}
            {valueSpecs.length === 0 ? (
              <p className="p-2 text-xs text-muted-foreground">
                Loading the declared pool…
              </p>
            ) : null}
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="text-sm font-medium">The question</div>
          <Textarea
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            rows={3}
            placeholder='e.g. "Where does this site&apos;s organic traffic actually come from, and what is our biggest evidence gap?"'
          />
        </div>

        <Button onClick={launch} disabled={run.running}>
          {run.running ? (run.stage ?? "Running…") : "Run the workbench"}
        </Button>
      </div>

      <div className="min-w-0 space-y-3">
        {run.error ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            {run.error}
          </div>
        ) : null}
        {run.result ? (
          <>
            <div className="rounded-md border border-border bg-card p-4">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="text-sm font-semibold">Answer</div>
                <div className="text-xs text-muted-foreground">
                  values: {run.result.values_used.join(", ")}
                </div>
              </div>
              <p className="whitespace-pre-wrap text-sm leading-relaxed">
                {run.result.answer}
              </p>
            </div>
            <details className="rounded-md border border-border bg-card p-4">
              <summary className="cursor-pointer text-sm font-semibold">
                The exact evidence the agent was shown
              </summary>
              <div className="mt-3 space-y-3">
                {Object.entries(run.result.evidence).map(([name, text]) => (
                  <div key={name}>
                    <div className="font-mono text-xs font-semibold">
                      {name}{" "}
                      <span className="font-normal text-muted-foreground">
                        ({run.result?.evidence_sizes[name] ?? text.length}{" "}
                        chars)
                      </span>
                    </div>
                    <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap rounded bg-muted/50 p-2 text-xs">
                      {text}
                    </pre>
                  </div>
                ))}
              </div>
            </details>
          </>
        ) : !run.running && !run.error ? (
          <div className="rounded-md border border-dashed border-border p-6 text-sm text-muted-foreground">
            Pick a site, choose exactly which evidence the agent may see, ask a
            question, and judge the answer against what it was shown — coverage
            stamps included. This is the test bench for evaluating agents and
            evidence slices before anything runs on a schedule.
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ── Shell ───────────────────────────────────────────────────────────────────

export function SeoOperationsClient() {
  return (
    <div className="space-y-4 p-4 md:p-6">
      <div>
        <h1 className="text-xl font-semibold">SEO Operations</h1>
        <p className="text-sm text-muted-foreground">
          Trigger any SEO automation or agent manually, watch it live, and
          judge the results — before anything is trusted on a schedule.
        </p>
      </div>
      <Tabs defaultValue="automations">
        <TabsList>
          <TabsTrigger value="automations">Automations</TabsTrigger>
          <TabsTrigger value="mandates">Mandates &amp; agents</TabsTrigger>
          <TabsTrigger value="workbench">Evidence Workbench</TabsTrigger>
        </TabsList>
        <TabsContent value="automations" className="mt-4">
          <AutomationsPanel />
        </TabsContent>
        <TabsContent value="mandates" className="mt-4">
          <MandatesPanel />
        </TabsContent>
        <TabsContent value="workbench" className="mt-4">
          <WorkbenchPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
