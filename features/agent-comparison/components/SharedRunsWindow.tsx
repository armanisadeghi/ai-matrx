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
import { RichDocumentActionProvider } from "@ai-matrx/rich-content/rich-document/RichDocumentActionProvider";
import { RichDocumentActionSurface } from "@ai-matrx/rich-content/rich-document/RichDocumentActionSurface";
import { getAction } from "@ai-matrx/rich-content/rich-document/actions/provider";
import type {
  RichDocumentAction,
  RichDocumentActionsProp,
} from "@ai-matrx/rich-content/rich-document/types";
import { currentCostUnit } from "@/components/cost/costUnit";
import { selectActiveBattleColumns } from "../shared/activeBattleColumns";
import { useCatalogBoundSelector } from "../shared/useCatalogBoundSelector";
import { buildPrintDocument, printHtmlContent } from "@ai-matrx/print/core";
import { toast } from "@/lib/toast";
import { exportFilename } from "@/components/agent-copy/export";
import { downloadFile } from "@ai-matrx/kit/download";
import { RunsComparisonTable } from "./RunsComparisonTable";
import { runsReportHtml, runsReportMarkdown } from "./runsComparisonReport";

interface SharedRunsWindowProps {
  id: string;
  onClose: () => void;
}

/** How often, at most, the report follows the streaming runs. */
const REPORT_REFRESH_MS = 1000;

function buildRunsReport(state: RootState): { title: string; content: string } {
  return runsReportMarkdown(state, currentCostUnit());
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

/**
 * Print and Download HTML carry the comparison AS IT LOOKS — standings, the
 * green/red highlights, every place badge — not a plain-text copy of it
 * (Arman, 2026-10-02: the print was missing "the beautiful comparison data
 * that is the entire point of the ui").
 */
const REPORT_ACTIONS: RichDocumentActionsProp = {
  exclude: ["print", "download-html", "html-preview"],
  extra: [
    {
      id: "runs-print",
      label: "Print or save as PDF",
      icon: Printer,
      category: "export",
      supportedSources: "*",
      renderSlot: "primary",
      order: 0,
      run: (ctx) => {
        const report = runsReportHtml(ctx.getState(), currentCostUnit());
        const outcome = printHtmlContent(report.body, report.title, report.css);
        if (outcome === "downloaded") {
          toast.info("Pop-ups are blocked, so the report was downloaded instead");
        }
      },
    },
    {
      id: "runs-download-html",
      label: "Download as an HTML page",
      icon: FileText,
      category: "export",
      supportedSources: "*",
      renderSlot: "primary",
      order: 1,
      run: (ctx) => {
        const report = runsReportHtml(ctx.getState(), currentCostUnit());
        downloadFile(
          exportFilename(report.title, "html"),
          buildPrintDocument(report.body, report.title, report.css),
          "text/html;charset=utf-8",
        );
        toast.success("HTML page downloaded");
      },
    },
    promoted("html-preview", "Publish as a web page", Globe, 2),
  ],
};

export function SharedRunsWindow({ id, onClose }: SharedRunsWindowProps) {
  const columns = useCatalogBoundSelector(selectActiveBattleColumns);
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
