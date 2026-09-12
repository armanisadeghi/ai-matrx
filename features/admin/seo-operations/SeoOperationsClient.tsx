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
import AppLink from "@/components/navigation/AppLink";
import { ArrowUpRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import MarkdownStream from "@/components/MarkdownStream";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MatrxDataTable } from "@ai-matrx/design-system/data-table";
import type { MatrxColumnDef } from "@ai-matrx/design-system/data-table/types";
import { toast } from "@/lib/toast";
import { runSystemTaskNow } from "@/features/scheduling/service/schedulerClient";
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
import { ProTextarea } from "@/components/official/ProTextarea";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";
import { CONTEXT_MENU_ENTITY_KEY } from "@/features/context-menu-v3/types";
import type { ContextMenuExtraItem } from "@/features/context-menu-v3/types";
import { useScheduledTaskMenuSection } from "@/features/scheduling/components/shared/scheduling-menu-sections";

// ── Automations panel ───────────────────────────────────────────────────────

export function AutomationsPanel() {
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
      const response = await runSystemTaskNow(task.id);
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
              <AppLink href={`/schedules/${row.id}`}>Open</AppLink>
            </Button>
          </div>
        ),
      },
    ],
    [runningId, trigger],
  );

  // `sch_task` already has a shared menu section (SECTIONS.md — Scheduled
  // task); this IS that identity (`fetchSeoTasks` reads `scheduler.sch_task`
  // directly), so it adopts the builder rather than re-implementing "open
  // schedule" / "disable" here. Growth: this surface's own "Run now" queue
  // action is now an opt-in `onRunNow` on the shared builder, so every other
  // task-row consumer inherits it too.
  const taskMenu = useScheduledTaskMenuSection<SeoTaskRow>({
    rows: () => rows,
    content: (row) => `${row.title} — ${row.enabled ? "ON" : "OFF"}`,
    onRunNow: (row) => trigger(row),
    onDisabled: (row) =>
      setRows((prev) =>
        prev.map((r) => (r.id === row.id ? { ...r, enabled: false } : r)),
      ),
  });

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Every recurring SEO/web task, including the ones switched off in the
        2026-08-20 governance pass. <strong>Run now</strong> queues one manual
        execution without enabling the schedule — watch it under{" "}
        <AppLink
          className="underline underline-offset-2"
          href="/administration/automation/scheduling/runs"
        >
          Scheduling › Runs
        </AppLink>
        .
      </p>
      <NonEditableContextMenu
        sourceFeature="admin"
        contentSource={{ type: "raw" }}
        contextData={{ content: "" }}
        resolveContextOnOpen={taskMenu.resolveContextOnOpen}
        getApplicationScope={taskMenu.getApplicationScope}
        extraSections={taskMenu.sections}
      >
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
      </NonEditableContextMenu>
    </div>
  );
}

// ── Mandates panel ──────────────────────────────────────────────────────────

function MandatesPanel() {
  const [mandates, setMandates] = useState<SeoMandateRow[]>([]);
  const [provisions, setProvisions] = useState<SeoProvisionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [clickedMandate, setClickedMandate] = useState<SeoMandateRow | null>(
    null,
  );

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
            <AppLink
              href={`/administration/mandates?mandate=${encodeURIComponent(row.mandate_key)}`}
            >
              Open
            </AppLink>
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
        <AppLink
          className="underline underline-offset-2"
          href="/administration/mandates"
        >
          full mandates console
        </AppLink>
        .
      </p>
      {/* `mandate` also renders on `features/mandates/admin/MandatesConsole.tsx`
         with its own richer menu — extracting a shared builder is future
         work (flagged separately); this pane only needs its existing "Open"
         door on the menu, not a competing set of mandate actions. */}
      <NonEditableContextMenu
        sourceFeature="admin"
        contentSource={{ type: "raw" }}
        contextData={{ content: "" }}
        resolveContextOnOpen={(element) => {
          const id = element
            ?.closest("[data-row-id]")
            ?.getAttribute("data-row-id");
          const row = id ? (mandates.find((m) => m.id === id) ?? null) : null;
          setClickedMandate(row);
          if (!row) return null;
          return {
            [CONTEXT_MENU_ENTITY_KEY]: {
              type: "mandate",
              id: row.id,
              title: row.label || row.mandate_key,
            },
            content: `${row.label || row.mandate_key}\n${row.description ?? ""}`,
          };
        }}
        extraSections={[
          {
            id: "seo-mandate-actions",
            label: clickedMandate?.label || clickedMandate?.mandate_key || "This mandate",
            anchor: "after-compare",
            items: [
              {
                kind: "link",
                id: "seo-mandate-open",
                label: "Open in mandates console",
                icon: ArrowUpRight,
                href: clickedMandate
                  ? `/administration/mandates?mandate=${encodeURIComponent(clickedMandate.mandate_key)}`
                  : "#",
                disabled: !clickedMandate,
              },
            ] satisfies ContextMenuExtraItem[],
          },
        ]}
      >
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
      </NonEditableContextMenu>
    </div>
  );
}

// ── Workbench panel ─────────────────────────────────────────────────────────

const EVIDENCE_WORKBENCH_PATH = "/seo/evidence-workbench";

interface EvidenceWorkbenchResult {
  question: string;
  values_used: string[];
  evidence_sizes: Record<string, number>;
  evidence: Record<string, string>;
  answer: string;
  model_id: string | null;
  agent_id: string;
  usage: Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRecordOf<T>(
  value: unknown,
  matchesValue: (entry: unknown) => entry is T,
): value is Record<string, T> {
  return isRecord(value) && Object.values(value).every(matchesValue);
}

function parseWorkbenchResult(raw: unknown): EvidenceWorkbenchResult | null {
  if (!isRecord(raw)) return null;
  const {
    question,
    values_used,
    evidence_sizes,
    evidence,
    answer,
    model_id,
    agent_id,
    usage,
  } = raw;
  if (
    typeof question !== "string" ||
    !Array.isArray(values_used) ||
    !values_used.every((value) => typeof value === "string") ||
    !isRecordOf(evidence_sizes, (value): value is number => typeof value === "number") ||
    !isRecordOf(evidence, (value): value is string => typeof value === "string") ||
    typeof answer !== "string" ||
    (model_id !== null && typeof model_id !== "string") ||
    typeof agent_id !== "string" ||
    !isRecord(usage)
  ) {
    return null;
  }
  return {
    question,
    values_used,
    evidence_sizes,
    evidence,
    answer,
    model_id,
    agent_id,
    usage,
  };
}

function EvidenceValue({
  value,
  depth = 0,
  preserveWhitespace = false,
}: {
  value: unknown;
  depth?: number;
  preserveWhitespace?: boolean;
}) {
  if (value === null) return <span className="text-muted-foreground">none</span>;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return (
      <span className={preserveWhitespace ? "whitespace-pre-wrap font-mono text-xs" : ""}>
        {String(value)}
      </span>
    );
  }
  if (Array.isArray(value)) {
    return (
      <ul className="grid gap-1 pl-4">
        {value.map((item, index) => (
          <li key={index} className="list-disc">
            <EvidenceValue
              value={item}
              depth={depth + 1}
              preserveWhitespace={preserveWhitespace}
            />
          </li>
        ))}
      </ul>
    );
  }
  if (isRecord(value)) {
    return (
      <dl className="grid gap-1">
        {Object.entries(value).map(([key, nested]) => (
          <div key={key} className={depth ? "pl-3" : ""}>
            <dt className="inline font-medium text-foreground">{key}: </dt>
            <dd className="inline text-foreground/85">
              <EvidenceValue
                value={nested}
                depth={depth + 1}
                preserveWhitespace={preserveWhitespace}
              />
            </dd>
          </div>
        ))}
      </dl>
    );
  }
  return <span className="text-muted-foreground">unavailable</span>;
}

function EvidenceSection({
  title,
  value,
  preserveWhitespace = false,
}: {
  title: string;
  value: unknown;
  preserveWhitespace?: boolean;
}) {
  return (
    <section className="grid gap-1 border-t border-border pt-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      <div className="text-sm leading-relaxed text-foreground/90">
        <EvidenceValue value={value} preserveWhitespace={preserveWhitespace} />
      </div>
    </section>
  );
}

export function WorkbenchPanel() {
  const [sites, setSites] = useState<SeoSiteOption[]>([]);
  const [valueSpecs, setValueSpecs] = useState<EvidenceValueSpec[]>([]);
  const [siteId, setSiteId] = useState<string>("");
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(["gsc_summary", "pages_summary", "findings_open"]),
  );
  const [question, setQuestion] = useState("");

  const command = useSeoCommandRun<EvidenceWorkbenchResult>({
    key: "evidence-workbench",
    path: EVIDENCE_WORKBENCH_PATH,
    finalKind: "seo.workbench_completed",
    stageLabels: {
      "seo.evidence_materializing": "Materializing the selected evidence…",
      "seo.evidence_ready": "Evidence is ready for the workbench agent…",
      "seo.workbench_completed": "Evidence workbench complete",
    },
    parseResult: parseWorkbenchResult,
    live: { label: "SEO Evidence Workbench" },
  });

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
    const site = sites.find((candidate) => candidate.id === siteId);
    if (!site) {
      toast.error("The selected site is no longer available. Pick it again.");
      return;
    }
    void command.launch(
      {
        site_id: siteId,
        question: question.trim(),
        values: [...selected],
      },
      site.domain,
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
          <ProTextarea
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            rows={3}
            placeholder='e.g. "Where does this site&apos;s organic traffic actually come from, and what is our biggest evidence gap?"'
          />
        </div>

        <Button disabled={command.running} onClick={launch}>
          {command.running ? "Running the workbench…" : "Run the workbench"}
        </Button>
        {command.running && (command.waitMessage ?? command.stage) ? (
          <p className="text-xs text-muted-foreground">
            {command.waitMessage ?? command.stage}
          </p>
        ) : null}
        {command.error ? (
          <div className="flex flex-wrap items-center gap-2 text-sm text-destructive">
            <span>{command.error}</span>
            {command.retry ? (
              <Button size="sm" variant="outline" onClick={() => void command.retry?.()}>
                Retry this workbench run
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="min-w-0 space-y-3">
        {command.result ? (
          <div className="grid gap-4 rounded-md border border-border p-4">
            <section className="grid gap-1">
              <h2 className="text-sm font-semibold text-foreground">Answer</h2>
              <MarkdownStream
                content={command.result.answer}
                isStreamActive={false}
                hideCopyButton
              />
            </section>
            <EvidenceSection title="Question" value={command.result.question} />
            <EvidenceSection title="Values used" value={command.result.values_used} />
            <EvidenceSection title="Evidence sizes" value={command.result.evidence_sizes} />
            <EvidenceSection
              title="Evidence"
              value={command.result.evidence}
              preserveWhitespace
            />
            <EvidenceSection
              title="Run details"
              value={{
                model_id: command.result.model_id,
                agent_id: command.result.agent_id,
                usage: command.result.usage,
              }}
            />
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-border p-6 text-sm text-muted-foreground">
            Pick a site, choose which evidence the agent may see, and ask a
            question. The live run opens in a floating window and can be
            rejoined after a reload; the completed answer remains here with
            the exact evidence the agent was shown.
          </div>
        )}
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
