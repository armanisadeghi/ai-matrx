"use client";

// features/mandates/runs/MandateRunsTab.tsx
//
// THE RUNS TAB on the mandate page. Top: the 5 newest runs (THE ONE runs table,
// `mandate.run_history`) and "All runs" in a window. A selected run (in the URL,
// `?tab=runs&run=<conversationId>`) opens a split: LEFT the run as it happened
// (values, placement, output, Replay exactly); RIGHT the same values against a
// holder picked here — never saved — with its placement and a streamed Run.
// Contract: "Mandate Runs" (owner session c00067c6, 2026-10-07).

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { List } from "lucide-react";
import { Button } from "@ai-matrx/design-system/controls";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { toast } from "@/lib/toast";
import { RunsTable } from "@/features/mandates/run-history/RunsTable";
import type { MandateRun, RunHistoryView } from "@/features/mandates/run-history/service";
import { RunAsItHappened } from "./RunAsItHappened";
import { RunTryPanel } from "./RunTryPanel";
import { useStoredRun } from "./useStoredRun";

export interface MandateRunsTabProps {
  mandateKey: string;
  outputKind: string | null;
  view: RunHistoryView;
  audience: "admin" | "product";
}

export function MandateRunsTab({ mandateKey, outputKind, view, audience }: MandateRunsTabProps) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const selected = params.get("run");
  const [allOpen, setAllOpen] = useState(false);

  function select(run: MandateRun) {
    if (!run.conversationId) {
      toast.info("This run kept no conversation to open.");
      return;
    }
    const next = new URLSearchParams(params.toString());
    next.set("tab", "runs");
    next.set("run", run.conversationId);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }

  return (
    <div className="space-y-4">
      <RunsTable
        scope={{ mandateKey }}
        view={view}
        audience={audience}
        urlId="mandate-runs-latest"
        pageSize={5}
        hidePagination
        title="Latest runs"
        actions={
          <Button icon={<List />} variant="outline" onClick={() => setAllOpen(true)}>
            All runs
          </Button>
        }
        onSelectRun={select}
        selectedConversationId={selected}
      />
      {allOpen ? (
        <WindowPanel
          id="mandate-runs-all"
          title="All runs"
          onClose={() => setAllOpen(false)}
          width={980}
          height={620}
          minWidth={560}
          minHeight={360}
          bodyClassName="flex min-h-0 flex-1 flex-col overflow-auto p-2"
        >
          <RunsTable
            scope={{ mandateKey }}
            view={view}
            audience={audience}
            urlId="mandate-runs-all"
            onSelectRun={(run) => {
              select(run);
              setAllOpen(false);
            }}
            selectedConversationId={selected}
          />
        </WindowPanel>
      ) : null}
      {selected ? (
        <SelectedRun key={selected} conversationId={selected} mandateKey={mandateKey} outputKind={outputKind} audience={audience} />
      ) : null}
    </div>
  );
}

function SelectedRun({
  conversationId,
  mandateKey,
  outputKind,
  audience,
}: {
  conversationId: string;
  mandateKey: string;
  outputKind: string | null;
  audience: "admin" | "product";
}) {
  const stored = useStoredRun(conversationId, mandateKey);
  return (
    <div className="h-[calc(100dvh-14rem)] min-h-[32rem] rounded-lg border border-border bg-card">
      <ResizablePanelGroup orientation="horizontal" className="h-full">
        <ResizablePanel id="mandate-run-left" defaultSize="50%" minSize="25%">
          <div className="h-full overflow-y-auto p-3">
            <RunAsItHappened stored={stored} audience={audience} mandateKey={mandateKey} />
          </div>
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel id="mandate-run-right" defaultSize="50%" minSize="25%">
          <div className="h-full overflow-y-auto p-3">
            <RunTryPanel stored={stored} mandateKey={mandateKey} outputKind={outputKind} audience={audience} />
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
