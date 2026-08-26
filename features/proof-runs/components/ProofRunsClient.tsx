"use client";

/**
 * Proof Runs admin surface.
 *
 * The platform's expensive checks — the ones that call real providers so their
 * result means something — with the receipts that prove each run really
 * happened. Server side: aidream `aidream/services/proof_runs/FEATURE.md`.
 *
 * What this page owns: the check list, the run controls, the live console and
 * the run history. What it does NOT own: how a `proof_check_status` tile or a
 * `proof_attestation` readout LOOKS — those are registered kinds and render
 * through their kind components (THE CANONICAL COMPONENT LAW), so they look the
 * same here, in a chat, and in a live-run window.
 */

import { useCallback, useEffect, useState } from "react";
import {
  Coins,
  FlaskConical,
  History,
  Pencil,
  Plus,
  PlayCircle,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { toast } from "@/lib/toast";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { extractErrorMessage } from "@/utils/errors";
import KindInstanceRender from "@/features/content-ir/studio/components/KindInstanceRender";
import {
  deleteScenario,
  fetchMandateCatalog,
  fetchProofChecks,
  fetchProofRun,
  fetchProofRuns,
  fetchScenarios,
  runProofCheck,
} from "@/features/proof-runs/api";
import {
  attestationFromRun,
  emptyScenario,
  PROOF_ATTESTATION_KIND,
  PROOF_CHECK_STATUS_KIND,
  type ExpectationRuleHelp,
  type MandateOption,
  type ProofCheckStatus,
  type ProofRunDetail,
  type ProofRunMode,
  type ProofRunSummary,
  type ProofScenario,
} from "@/features/proof-runs/types";
import {
  EMPTY_CONSOLE,
  ProofRunConsole,
  type ProofRunConsoleState,
} from "@/features/proof-runs/components/ProofRunConsole";
import { ScenarioEditor } from "@/features/proof-runs/components/ScenarioEditor";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const MODES: { value: ProofRunMode; label: string; hint: string }[] = [
  {
    value: "auto",
    label: "Auto",
    hint: "The gate decides: live when the cadence is due and there is budget, otherwise a replay of the recorded payloads.",
  },
  {
    value: "live",
    label: "Live",
    hint: "Force real providers now. Bypasses the cadence, never the monthly ceiling.",
  },
  {
    value: "replay",
    label: "Replay",
    hint: "Re-run against the recording. Cheap, not free — the step under test still runs for real.",
  },
];

function verdictClass(verdict: string | null): string {
  if (verdict === "pass")
    return "text-emerald-700 dark:text-emerald-300 border-emerald-500/30 bg-emerald-500/10";
  if (verdict === "fail")
    return "text-red-700 dark:text-red-300 border-red-500/30 bg-red-500/10";
  return "text-amber-700 dark:text-amber-300 border-amber-500/30 bg-amber-500/10";
}

export default function ProofRunsClient() {
  const [checks, setChecks] = useState<ProofCheckStatus[]>([]);
  const [spend, setSpend] = useState({ mtd: 0, ceiling: 0 });
  const [runs, setRuns] = useState<ProofRunSummary[]>([]);
  const [openRun, setOpenRun] = useState<ProofRunDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mode, setMode] = useState<ProofRunMode>("auto");
  const [console_, setConsole] = useState<ProofRunConsoleState>(EMPTY_CONSOLE);
  const [runningSlug, setRunningSlug] = useState<string | null>(null);
  const [scenarios, setScenarios] = useState<ProofScenario[]>([]);
  const [mandates, setMandates] = useState<MandateOption[]>([]);
  const [ruleHelp, setRuleHelp] = useState<ExpectationRuleHelp[]>([]);
  const [editing, setEditing] = useState<ProofScenario | null>(null);
  const [selected, setSelected] = useState<string>("");

  const refresh = useCallback(async () => {
    setLoadError(null);
    try {
      const [checksResponse, runsResponse, scenarioResponse, catalog] =
        await Promise.all([
          fetchProofChecks(),
          fetchProofRuns({ limit: 25 }),
          fetchScenarios(),
          fetchMandateCatalog(),
        ]);
      setChecks(checksResponse.checks ?? []);
      setScenarios(scenarioResponse.scenarios ?? []);
      setMandates(catalog.mandates ?? []);
      setRuleHelp(catalog.rules ?? []);
      setSelected((current) => {
        const available = (checksResponse.checks ?? [])
          .map((c) => c.slug ?? "")
          .filter(Boolean);
        return current && available.includes(current)
          ? current
          : (available[0] ?? "");
      });
      setSpend({
        mtd: checksResponse.month_to_date_usd ?? 0,
        ceiling: checksResponse.monthly_ceiling_usd ?? 0,
      });
      setRuns(runsResponse.runs ?? []);
    } catch (err) {
      setLoadError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const run = useCallback(
    async (slug: string) => {
      setRunningSlug(slug);
      setOpenRun(null);
      setConsole({ ...EMPTY_CONSOLE, isRunning: true });
      try {
        for await (const event of runProofCheck(slug, {
          mode,
          reason: "admin console",
        })) {
          switch (event.kind) {
            case "started":
              setConsole((s) => ({ ...s, started: event.data }));
              break;
            case "step":
              setConsole((s) => ({
                ...s,
                steps: [...s.steps, event.data.message],
              }));
              break;
            case "proof":
              setConsole((s) => ({ ...s, proofs: [...s.proofs, event.data] }));
              break;
            case "completed":
              setConsole((s) => ({
                ...s,
                completed: event.data,
                isRunning: false,
              }));
              break;
            case "skipped":
              setConsole((s) => ({
                ...s,
                skippedReason: event.data.reason,
                isRunning: false,
              }));
              break;
            case "error":
              setConsole((s) => ({
                ...s,
                error: event.message,
                isRunning: false,
              }));
              break;
          }
        }
      } catch (err) {
        const message = extractErrorMessage(err);
        setConsole((s) => ({ ...s, error: message, isRunning: false }));
        toast.error("The proof run could not be started", {
          description: message,
        });
      } finally {
        setConsole((s) => ({ ...s, isRunning: false }));
        setRunningSlug(null);
        void refresh();
      }
    },
    [mode, refresh],
  );

  const openRunDetail = useCallback(async (runId: string) => {
    try {
      setOpenRun(await fetchProofRun(runId));
    } catch (err) {
      toast.error("Could not load that run", {
        description: extractErrorMessage(err),
      });
    }
  }, []);

  const removeScenario = useCallback(
    async (slug: string) => {
      try {
        await deleteScenario(slug);
        toast.success(`Deleted ${slug}`);
        void refresh();
      } catch (err) {
        toast.error("Could not delete that scenario", {
          description: extractErrorMessage(err),
        });
      }
    },
    [refresh],
  );

  const budgetPct =
    spend.ceiling > 0
      ? Math.min(100, Math.round((spend.mtd / spend.ceiling) * 100))
      : 0;

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-xl font-semibold text-foreground">
            <ShieldCheck className="h-5 w-5" />
            Proof Runs
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Checks that call real providers so their result means something —
            and then prove it from the cost ledger rather than taking the
            code&apos;s word for it. Every run is measured; a skipped proof is
            never a pass.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="rounded-md border border-border px-3 py-2 text-right">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Coins className="h-3.5 w-3.5" />
              This month
            </div>
            <div className="text-sm font-medium text-foreground">
              ${spend.mtd.toFixed(4)}{" "}
              <span className="text-xs font-normal text-muted-foreground">
                of ${spend.ceiling.toFixed(2)}
              </span>
            </div>
            <div className="mt-1 h-1 w-32 overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  "h-full",
                  budgetPct > 90 ? "bg-red-500" : "bg-emerald-500",
                )}
                style={{ width: `${budgetPct}%` }}
              />
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => void refresh()}>
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            Refresh
          </Button>
        </div>
      </div>

      {/* THE TRIGGER. One bar, always visible, that answers "how do I run
          something?" without reading anything else on the page. */}
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="space-y-2 p-3">
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[260px] flex-1 space-y-1">
              <span className="text-xs font-medium text-muted-foreground">
                Check to run
              </span>
              <Select value={selected} onValueChange={setSelected}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Pick a check" />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {checks.map((check) => (
                    <SelectItem key={check.slug} value={check.slug ?? ""}>
                      {check.label || check.slug}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground">
                Mode
              </span>
              <div className="flex items-center gap-1">
                {MODES.map((option) => (
                  <Button
                    key={option.value}
                    size="sm"
                    variant={mode === option.value ? "default" : "outline"}
                    onClick={() => setMode(option.value)}
                    title={option.hint}
                    className="h-9 px-3 text-xs"
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
            </div>
            <Button
              size="lg"
              onClick={() => void run(selected)}
              disabled={runningSlug !== null || !selected}
              className="h-9"
            >
              {runningSlug ? (
                <>
                  <Zap className="mr-2 h-4 w-4 animate-pulse" />
                  Running…
                </>
              ) : (
                <>
                  <PlayCircle className="mr-2 h-4 w-4" />
                  Run this check
                </>
              )}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {MODES.find((m) => m.value === mode)?.hint}
          </p>
        </CardContent>
      </Card>

      {loadError ? (
        <div className="space-y-1 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-800 dark:text-red-200">
          <p className="font-medium">The proof-run API did not answer.</p>
          <p className="text-xs">{loadError}</p>
          <p className="text-xs opacity-80">
            If this says 404, the server has the page but not yet the endpoints —
            they ship with the next aidream deploy. Nothing here is broken;
            there is just nothing to talk to yet.
          </p>
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <div className="space-y-3">
          {loading ? (
            <Card>
              <CardContent className="p-6 text-sm text-muted-foreground">
                Reading the check registry…
              </CardContent>
            </Card>
          ) : null}

          {checks.map((check) => (
            <Card key={check.slug}>
              <CardContent className="space-y-3 p-3">
                <KindInstanceRender
                  kind={PROOF_CHECK_STATUS_KIND}
                  value={check}
                  variant="bare"
                  showRoutingNote={false}
                />
                <div className="flex flex-wrap items-center gap-2 border-t border-border pt-2">
                  <Button
                    size="sm"
                    onClick={() => void run(check.slug ?? "")}
                    disabled={runningSlug !== null || !check.slug}
                  >
                    {runningSlug === check.slug ? (
                      <>
                        <Zap className="mr-1.5 h-3.5 w-3.5 animate-pulse" />
                        Running…
                      </>
                    ) : (
                      <>
                        <PlayCircle className="mr-1.5 h-3.5 w-3.5" />
                        Run {mode === "auto" ? "" : mode}
                      </>
                    )}
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    {mode === "live"
                      ? "Spends real provider money now."
                      : mode === "replay"
                        ? "Replays the recorded payloads."
                        : "The gate decides whether this one spends money."}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}

          {!loading && checks.length === 0 && !loadError ? (
            <Card>
              <CardContent className="p-6 text-sm text-muted-foreground">
                No checks are registered yet. A check is declared in code under
                <code className="mx-1">
                  aidream/services/proof_runs/checks/
                </code>
                and seeds its own registry row on first use.
              </CardContent>
            </Card>
          ) : null}
        </div>

        <Card className="xl:sticky xl:top-4 xl:self-start">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Live run</CardTitle>
            <CardDescription>
              Each proof as the server decides it, then the attestation.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ProofRunConsole state={console_} />
          </CardContent>
        </Card>
      </div>

      {/* SCENARIOS — verification authored here, no deploy. Each one becomes a
          check with the same receipts as a code check. */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pb-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <FlaskConical className="h-4 w-4" />
              Scenarios
            </CardTitle>
            <CardDescription>
              Traps you author: a fictional world with planted markers, where the
              right answer is knowable in advance and unreachable by guessing.
            </CardDescription>
          </div>
          {!editing ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setEditing(emptyScenario())}
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              New scenario
            </Button>
          ) : null}
        </CardHeader>
        <CardContent>
          {editing ? (
            <ScenarioEditor
              scenario={editing}
              mandates={mandates}
              rules={ruleHelp}
              onSaved={(saved) => {
                setEditing(null);
                setSelected(saved.check_slug);
                void refresh();
              }}
              onCancel={() => setEditing(null)}
            />
          ) : scenarios.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">
              No saved scenarios yet. A scenario names a mandate, hands it facts
              you wrote, and lists what a correct answer must look like — then
              runs with the same receipts as any other check.
            </p>
          ) : (
            <ul className="space-y-2">
              {scenarios.map((scenario) => (
                <li
                  key={scenario.slug}
                  className="flex flex-wrap items-start justify-between gap-2 rounded-md border border-border p-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-foreground">
                        {scenario.label}
                      </span>
                      <code className="rounded bg-muted px-1 py-px font-mono text-[10px] text-muted-foreground">
                        {scenario.mandate_key}
                      </code>
                      {!scenario.is_active ? (
                        <span className="rounded-full border border-border bg-muted px-1.5 py-px text-[10px] text-muted-foreground">
                          inactive
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {scenario.description}
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {scenario.expectations.length} rule(s) ·{" "}
                      {scenario.allowed_routes.length} route(s) in the universe ·
                      live every {Math.round(scenario.live_every_seconds / 3600)}h
                      · ${scenario.max_cost_usd.toFixed(2)}/run
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      size="sm"
                      onClick={() => void run(scenario.check_slug)}
                      disabled={runningSlug !== null}
                      className="h-7 px-2 text-xs"
                    >
                      <PlayCircle className="mr-1 h-3.5 w-3.5" />
                      Run
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setEditing(scenario)}
                      className="h-7 px-2 text-xs"
                    >
                      <Pencil className="mr-1 h-3.5 w-3.5" />
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void removeScenario(scenario.slug)}
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-red-600"
                      aria-label={`Delete ${scenario.slug}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <History className="h-4 w-4" />
            Recent runs
          </CardTitle>
          <CardDescription>
            Live and replay runs, newest first. Open one to see every proof it
            rests on.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-xs">
              <thead className="text-left text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="py-1.5 pr-3 font-medium">Started</th>
                  <th className="py-1.5 pr-3 font-medium">Check</th>
                  <th className="py-1.5 pr-3 font-medium">Mode</th>
                  <th className="py-1.5 pr-3 font-medium">Verdict</th>
                  <th className="py-1.5 pr-3 font-medium">Cost</th>
                  <th className="py-1.5 pr-3 font-medium">Took</th>
                  <th className="py-1.5 pr-3 font-medium">Trigger</th>
                  <th className="py-1.5 font-medium">Summary</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((row) => (
                  <tr
                    key={row.id}
                    onClick={() => void openRunDetail(row.id)}
                    className={cn(
                      "cursor-pointer border-b border-border/60 hover:bg-muted/50",
                      openRun?.id === row.id && "bg-muted",
                    )}
                  >
                    <td className="py-1.5 pr-3 whitespace-nowrap text-muted-foreground">
                      {row.started_at
                        ? new Date(row.started_at).toLocaleString()
                        : "—"}
                    </td>
                    <td className="py-1.5 pr-3 whitespace-nowrap">
                      {row.check_slug}
                    </td>
                    <td className="py-1.5 pr-3 whitespace-nowrap uppercase text-muted-foreground">
                      {row.mode}
                    </td>
                    <td className="py-1.5 pr-3 whitespace-nowrap">
                      <span
                        className={cn(
                          "rounded-full border px-1.5 py-px text-[10px] font-medium",
                          verdictClass(row.verdict ?? null),
                        )}
                      >
                        {row.verdict ?? row.status}
                      </span>
                    </td>
                    <td className="py-1.5 pr-3 whitespace-nowrap font-mono">
                      ${(row.cost_usd ?? 0).toFixed(4)}
                    </td>
                    <td className="py-1.5 pr-3 whitespace-nowrap text-muted-foreground">
                      {((row.duration_ms ?? 0) / 1000).toFixed(1)}s
                    </td>
                    <td className="py-1.5 pr-3 whitespace-nowrap text-muted-foreground">
                      {row.trigger_source}
                    </td>
                    <td className="py-1.5 text-muted-foreground">
                      {row.summary}
                    </td>
                  </tr>
                ))}
                {runs.length === 0 && !loading ? (
                  <tr>
                    <td
                      colSpan={8}
                      className="py-4 text-center text-muted-foreground"
                    >
                      No runs yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          {openRun ? (
            <div className="space-y-2 rounded-md border border-border p-3">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                <span className="font-mono">{openRun.id}</span>
                <span>trigger {openRun.trigger_source}</span>
                {openRun.git_sha ? <span>git {openRun.git_sha}</span> : null}
                {openRun.environment ? (
                  <span>{openRun.environment}</span>
                ) : null}
                {openRun.replayed_from_run_id ? (
                  <span>
                    replayed from{" "}
                    <span className="font-mono">
                      {openRun.replayed_from_run_id}
                    </span>
                  </span>
                ) : null}
                {openRun.conversation_id ? (
                  <span className="flex items-center gap-1">
                    receipts anchor
                    {/* The door onto the evidence itself: this conversation
                        holds the model calls the proofs were computed from. */}
                    <EntityRef
                      token="conversation"
                      id={openRun.conversation_id}
                      name={`${openRun.check_slug} run`}
                    />
                  </span>
                ) : null}
              </div>
              {openRun.failure_reason ? (
                <div className="rounded-md border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-800 dark:text-red-200">
                  {openRun.failure_reason}
                </div>
              ) : null}
              <KindInstanceRender
                kind={PROOF_ATTESTATION_KIND}
                value={attestationFromRun(openRun)}
                variant="bare"
                showRoutingNote={false}
              />
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
