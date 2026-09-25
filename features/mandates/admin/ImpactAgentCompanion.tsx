"use client";

/**
 * THE SINGLE-AGENT COMPANION (Agent Change Impact, I6) — what the batch panel
 * carries in addition when it is about ONE agent a person just edited:
 *
 *   • VERSION HISTORY — the pinned version a job runs against, side by side
 *     with the newest saved version, so "what did I just change?" is answered
 *     on the spot. When the reached jobs pin different versions, each pinned
 *     version is a tab.
 *   • QUICK TEST — the mandate test bench for one reached job, armed with the
 *     pinned-vs-latest comparison ("it's pretty easy for me to test it as
 *     well", MANDATE.md).
 *
 * 🚨 A PANEL WRAPS THE CANONICAL COMPONENT. The diff is `AgentDiffViewer`,
 * the bench is `MandateTestBench` — the same components the mandate window's
 * admin view renders. This file loads their inputs and lays them out; it
 * renders no diff and no run of its own.
 */

import { useEffect, useState } from "react";
import { AlertTriangle, ExternalLink, FlaskConical, History, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AgentDiffViewer } from "@/features/agents/components/diff/AgentDiffViewer";
import type { AgentDefinition } from "@/features/agents/types/agent-definition.types";
import { agentHref } from "./mandate-health";
import { MandateTestBench } from "./MandateTestBench";
import {
  fetchMandateConsoleData,
  fetchVersionSnapshotDefinition,
  type MandateDefinitionRow,
} from "./service";
import { versionLabel, type ImpactVerdict } from "./impact";

export type CompanionSection = "history" | "test";

/** One pinned→newest pair a job actually runs against. */
export interface VersionPair {
  pinned: number;
  latest: number;
  /** Mandate keys pinned at this version — the tab's tooltip. */
  mandateKeys: string[];
}

/**
 * The distinct pinned→newest pairs among the focus agent's own rungs, lowest
 * pin first. Descendants are excluded: their history is a different agent's.
 * A rung with no pin (tracks latest) or no newest version has nothing to diff.
 */
export function versionPairsOf(
  verdicts: readonly ImpactVerdict[],
  focusAgentId: string,
): VersionPair[] {
  const byPin = new Map<number, VersionPair>();
  for (const verdict of verdicts) {
    if (verdict.agent_id !== focusAgentId) continue;
    const pinned = verdict.pinned_version_number;
    const latest = verdict.latest_version_number;
    if (pinned == null || latest == null || pinned === latest) continue;
    const entry = byPin.get(pinned) ?? { pinned, latest, mandateKeys: [] };
    if (!entry.mandateKeys.includes(verdict.mandate_key)) {
      entry.mandateKeys.push(verdict.mandate_key);
    }
    byPin.set(pinned, entry);
  }
  return Array.from(byPin.values()).sort((a, b) => a.pinned - b.pinned);
}

/** The mandate keys a person can test here — every reached job, once, in order. */
export function testableMandateKeys(verdicts: readonly ImpactVerdict[]): string[] {
  const keys: string[] = [];
  for (const verdict of verdicts) {
    if (!keys.includes(verdict.mandate_key)) keys.push(verdict.mandate_key);
  }
  return keys;
}

function VersionHistory({
  agentId,
  pairs,
}: {
  agentId: string;
  pairs: VersionPair[];
}) {
  const [activePin, setActivePin] = useState<number | null>(pairs[0]?.pinned ?? null);
  const pair = pairs.find((entry) => entry.pinned === activePin) ?? pairs[0] ?? null;
  const [diff, setDiff] = useState<{
    key: string;
    old: AgentDefinition;
    next: AgentDefinition;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const pinned = pair?.pinned ?? null;
  const latest = pair?.latest ?? null;
  const pairKey = pinned != null && latest != null ? `${agentId}:${pinned}:${latest}` : "";

  useEffect(() => {
    if (pinned == null || latest == null) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      fetchVersionSnapshotDefinition(agentId, pinned),
      fetchVersionSnapshotDefinition(agentId, latest),
    ])
      .then(([oldSnap, nextSnap]) => {
        if (cancelled) return;
        if (!oldSnap || !nextSnap) {
          setDiff(null);
          setError(
            `${!oldSnap ? versionLabel(pinned) : versionLabel(latest)} has no saved snapshot to compare — the full version history still opens from the link above.`,
          );
          return;
        }
        setDiff({ key: `${agentId}:${pinned}:${latest}`, old: oldSnap, next: nextSnap });
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setDiff(null);
        setError(cause instanceof Error ? cause.message : String(cause));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [agentId, pinned, latest]);

  const historyHref = agentHref(agentId, null, "/latest");

  if (pairs.length === 0) {
    return (
      <div className="space-y-2 p-3 text-xs text-muted-foreground">
        <p>
          Every job this change reaches already runs the newest saved version, or tracks
          latest — there is no pinned version to compare against.
        </p>
        <a
          href={historyHref}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-primary hover:underline"
        >
          <History className="h-3 w-3" /> Open the full version history
        </a>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-1 border-b border-border px-2 py-1.5 text-xs">
        {pairs.map((entry) => (
          <Button
            key={entry.pinned}
            size="sm"
            variant={entry.pinned === pair?.pinned ? "secondary" : "ghost"}
            className="h-6 gap-1 px-2 text-[11px] tabular-nums"
            title={`Pinned by ${entry.mandateKeys.join(", ")}`}
            onClick={() => setActivePin(entry.pinned)}
          >
            {versionLabel(entry.pinned)} → {versionLabel(entry.latest)}
          </Button>
        ))}
        <a
          href={historyHref}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
          title="Every saved version of this agent, on its own page"
        >
          <ExternalLink className="h-3 w-3" /> Full history
        </a>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-2">
        {error ? (
          <p className="flex items-start gap-1.5 text-xs text-rose-700 dark:text-rose-400">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>Couldn&apos;t load both versions: {error}</span>
          </p>
        ) : loading || !diff || diff.key !== pairKey ? (
          <p className="inline-flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading both versions…
          </p>
        ) : pair ? (
          <AgentDiffViewer
            oldAgent={diff.old}
            newAgent={diff.next}
            oldLabel={`${versionLabel(pair.pinned)} (running)`}
            newLabel={`${versionLabel(pair.latest)} (newest)`}
          />
        ) : null}
      </div>
    </div>
  );
}

function QuickTest({ mandateKeys }: { mandateKeys: string[] }) {
  const [activeKey, setActiveKey] = useState<string>(mandateKeys[0] ?? "");
  const [loaded, setLoaded] = useState<{
    key: string;
    mandate: MandateDefinitionRow;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!activeKey) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchMandateConsoleData({ mandateKeys: [activeKey] })
      .then((data) => {
        if (cancelled) return;
        const mandate = data.mandates.find((row) => row.mandate_key === activeKey);
        if (!mandate) {
          setLoaded(null);
          setError(
            `${activeKey} is not readable here — the job exists, but its definition is not yours to open.`,
          );
          return;
        }
        setLoaded({
          key: activeKey,
          mandate,
        });
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setLoaded(null);
        setError(cause instanceof Error ? cause.message : String(cause));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeKey]);

  if (mandateKeys.length === 0) {
    return (
      <p className="p-3 text-xs text-muted-foreground">No job to test — this change reaches none you can see.</p>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-1 border-b border-border px-2 py-1.5 text-xs">
        <FlaskConical className="h-3.5 w-3.5 text-muted-foreground" />
        {mandateKeys.map((key) => (
          <Button
            key={key}
            size="sm"
            variant={key === activeKey ? "secondary" : "ghost"}
            className="h-6 px-2 font-mono text-[11px]"
            onClick={() => setActiveKey(key)}
          >
            {key}
          </Button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-2">
        {error ? (
          <p className="flex items-start gap-1.5 text-xs text-rose-700 dark:text-rose-400">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{error}</span>
          </p>
        ) : loading || !loaded || loaded.key !== activeKey ? (
          <p className="inline-flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading {activeKey}…
          </p>
        ) : (
          <MandateTestBench
            key={loaded.mandate.id}
            mandate={loaded.mandate}
            baselineLabel="Pinned version"
            presetLatestCandidate
          />
        )}
      </div>
    </div>
  );
}

export function ImpactAgentCompanion({
  focusAgentId,
  verdicts,
  section,
}: {
  focusAgentId: string;
  verdicts: readonly ImpactVerdict[];
  section: CompanionSection;
}) {
  if (section === "history") {
    return (
      <VersionHistory agentId={focusAgentId} pairs={versionPairsOf(verdicts, focusAgentId)} />
    );
  }
  return <QuickTest mandateKeys={testableMandateKeys(verdicts)} />;
}
