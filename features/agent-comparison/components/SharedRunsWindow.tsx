"use client";

/**
 * SharedRunsWindow
 *
 * The single comparison surface for every per-run telemetry source — server
 * session stats, client metrics, model-context measurements. Renders one
 * comparison table per metric section (Summary, Tokens, Server timing,
 * Client timing, Operations, Model context, Payload, Event counts,
 * Records). Each section ships its own min/max highlights.
 *
 * The same comparison is a REPORT: the battle's setup, request and answers
 * followed by every metric table, handed to the platform's document actions
 * (RichDocument) — Print / PDF, Download HTML and Publish (title, description
 * and SEO before it goes on the open web) sit in the title bar, every other
 * export behind them. A published comparison is how people show their work.
 */

import { useEffect, useId, useState } from "react";
import { FileText, Globe, Printer } from "lucide-react";
import { useAppSelector, useAppStore } from "@/lib/redux/hooks";
import type { RootState } from "@/lib/redux/store";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { RichDocumentActionProvider } from "@/features/rich-document/RichDocumentActionProvider";
import { RichDocumentActionSurface } from "@/features/rich-document/RichDocumentActionSurface";
import { getAction } from "@/features/rich-document/actions/provider";
import type {
  RichDocumentAction,
  RichDocumentActionsProp,
} from "@/features/rich-document/types";
import { currentCostUnit } from "@/components/cost/costUnit";
import { selectActiveBattleColumns } from "../shared/activeBattleColumns";
import {
  battleMarkdownForPeople,
  buildBattleSnapshot,
} from "../shared/battleSnapshot";
import {
  RunsComparisonTable,
  runsComparisonMarkdown,
} from "./RunsComparisonTable";

interface SharedRunsWindowProps {
  id: string;
  onClose: () => void;
}

/** How often, at most, the report follows the streaming runs. */
const REPORT_REFRESH_MS = 1000;

function buildRunsReport(state: RootState): { title: string; content: string } {
  const snap = buildBattleSnapshot(state);
  if (!snap) return { title: "Runs comparison", content: "" };
  const metrics = runsComparisonMarkdown(state, currentCostUnit());
  return {
    title: snap.battle?.name ?? snap.mode_label,
    content: [
      battleMarkdownForPeople(snap),
      metrics ? `## Run metrics\n\n${metrics}` : "",
    ]
      .filter(Boolean)
      .join("\n\n"),
  };
}

/** The report, rebuilt from the store at most once per REPORT_REFRESH_MS. */
function useRunsReport(): { title: string; content: string } {
  const store = useAppStore();
  const [report, setReport] = useState(() => buildRunsReport(store.getState()));
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = store.subscribe(() => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        setReport(buildRunsReport(store.getState()));
      }, REPORT_REFRESH_MS);
    });
    return () => {
      unsubscribe();
      if (timer) clearTimeout(timer);
    };
  }, [store]);
  return report;
}

/** A built-in document action shown as its own button here (same handler, by id). */
function promoted(
  builtInId: string,
  label: string,
  icon: RichDocumentAction["icon"],
  order: number,
): RichDocumentAction {
  return {
    id: `runs-${builtInId}`,
    label,
    icon,
    category: "export",
    supportedSources: "*",
    renderSlot: "primary",
    order,
    run: (ctx) => getAction(builtInId)?.run(ctx),
  };
}

const REPORT_ACTIONS: RichDocumentActionsProp = {
  exclude: ["print", "download-html", "html-preview"],
  extra: [
    promoted("print", "Print or save as PDF", Printer, 0),
    promoted("download-html", "Download as an HTML page", FileText, 1),
    promoted("html-preview", "Publish as a web page", Globe, 2),
  ],
};

export function SharedRunsWindow({ id, onClose }: SharedRunsWindowProps) {
  const columns = useAppSelector(selectActiveBattleColumns);
  const surfaceId = `battle-runs-${useId()}`;
  const report = useRunsReport();

  return (
    <WindowPanel
      id={id}
      title="Runs comparison"
      width={920}
      height={680}
      onClose={onClose}
      bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
      actionsRight={
        report.content ? (
          <>
            <RichDocumentActionProvider
              content={report.content}
              source={{ type: "raw", title: report.title }}
              surfaceId={surfaceId}
              actions={REPORT_ACTIONS}
            />
            <RichDocumentActionSurface
              surfaceId={surfaceId}
              variant="mini-bar"
              fallback={null}
            />
          </>
        ) : null
      }
    >
      <div className="h-full flex flex-col">
        {columns.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-xs text-muted-foreground">
            {/* read-gate-exempt: battle columns are this session's local state (a failed saved-battle open is shown by BattleRouteNotice on the page), not a read */}
            No columns yet.
          </div>
        ) : (
          <div className="flex-1 overflow-auto">
            <RunsComparisonTable />
          </div>
        )}
      </div>
    </WindowPanel>
  );
}
