"use client";

// features/marketing/seo/site-context/AgentViewDialog.tsx — "What agents see":
// runs `seo_site` action `context` for this site through the screen-run door
// (free; stored data only) and shows the exact text an agent receives, its size
// against the context budget knob, the server's notices (paging, expertise,
// roles outside the list) and each part's "none recorded" note.

import { useEffect, useState } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@ai-matrx/design-system";
import { Badge, Button, RegionSkeleton, Tabs } from "@ai-matrx/design-system/controls";
import { formatCount } from "@ai-matrx/kit/format";
import { budgetedBytes, contextParts, pythonJsonText } from "./agent-view";
import { useAgentContextView } from "./hooks";

import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
const PART_LABEL: Record<string, string> = {
  goals: "Goals",
  page_roles: "Key pages",
  competitors: "Competitors",
  voice: "Voice",
};

type View = "parts" | "exact";

export function AgentViewDialog({
  siteId,
  maxBytes,
  open,
  onOpenChange,
}: {
  siteId: string;
  maxBytes: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const tool = useAgentContextView();
  const { run, last, running } = tool;
  const [view, setView] = useState<View>("parts");
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (open) void run({ action: "context", site_id: siteId });
    // `nonce` re-runs on Refresh; identical runs in flight share one call.
  }, [open, siteId, nonce, run]);

  const envelope = last?.status === "ok" ? last.output : null;
  const text = envelope ? pythonJsonText(envelope) : "";
  const bytes = envelope ? budgetedBytes(text) : 0;
  const parts = contextParts(envelope?.data);
  const notices = envelope?.notices ?? [];
  const failure =
    last?.status === "error"
      ? last.error.message
      : last?.status === "busy"
        ? last.message
        : null;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent size="xl">
          <DialogHeader>
            <DialogTitle>What agents see</DialogTitle>
            <DialogDescription>The exact site context an agent receives.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap items-center gap-2">
            {envelope ? (
              <Badge
                tone={maxBytes !== null && bytes > maxBytes ? "warning" : "neutral"}
                data-testid="agent-view-size"
              >
                {formatCount(bytes)}
                {maxBytes !== null ? ` of ${formatCount(maxBytes)}` : ""} bytes
              </Badge>
            ) : null}
            {envelope ? <Badge>{envelope.cost?.class === "free" ? "Free" : "Paid"}</Badge> : null}
            <span className="flex-1" />
            <Tabs<View>
              variant="capsule"
              aria-label="Show"
              value={view}
              onValueChange={setView}
              data={[
                { value: "parts", label: "Parts" },
                { value: "exact", label: "Exact text" },
              ]}
            />
            <Button
              variant="quiet"
              icon={<RefreshCw />}
              aria-label="Read again"
              disabled={running}
              onClick={() => setNonce((n) => n + 1)}
            />
          </div>
          {running && !envelope ? (
            <RegionSkeleton shape="rows" count={4} aria-label="Reading what agents see" />
          ) : failure ? (
            <p role="alert" className="flex items-center gap-1 text-xs text-destructive">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              <span className="line-clamp-2">{failure}</span>
            <ErrorAlchemyMenu /></p>
          ) : envelope ? (
            <div className="max-h-[60vh] space-y-3 overflow-y-auto">
              {notices.length ? (
                <ul aria-label="Notices" className="space-y-1">
                  {notices.map((n) => (
                    <li key={n} className="rounded-md bg-muted/50 px-2 py-1 text-xs">
                      {n}
                    </li>
                  ))}
                </ul>
              ) : null}
              {view === "exact" ? (
                <pre
                  data-testid="agent-view-exact"
                  /* rich-content-exempt: the exact bytes the agent receives, shown verbatim on purpose */
                  className="whitespace-pre-wrap break-all rounded-md border border-border bg-card p-2 font-mono text-xs"
                >
                  {text}
                </pre>
              ) : (
                <ul aria-label="Parts" className="divide-y divide-border rounded-md border border-border bg-card">
                  {parts.map((p) => (
                    <li key={p.name} data-part={p.name} className="space-y-0.5 px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{PART_LABEL[p.name] ?? p.name}</span>
                        {p.total !== null ? (
                          <Badge>
                            {p.shown} of {p.total}
                          </Badge>
                        ) : null}
                        {p.more ? <Badge tone="warning">{p.more} more</Badge> : null}
                      </div>
                      {p.source ? (
                        <p className="truncate text-xs text-muted-foreground">{p.source}</p>
                      ) : null}
                      {p.note ? <p className="text-xs">{p.note}</p> : null}
                      {p.next ? (
                        <p className="font-mono text-xs text-muted-foreground">Next: {p.next}</p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
      {tool.approvalDialog}
    </>
  );
}
