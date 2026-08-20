"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  FindingActions,
  FindingCard,
} from "@/features/hindsight/components/FindingCard";
import { DiscussPanel } from "@/features/hindsight/components/DiscussPanel";
import { DoorAudienceProvider } from "@/features/hindsight/components/door-audience";
import { LEVER_LABEL } from "@/features/hindsight/components/tokens";
import { getEnrollment } from "@/features/hindsight/api";
import type { DoorAudience } from "@/features/hindsight/subject-doors";
import type { Finding } from "@/features/hindsight/types";
import { WindowPanel } from "@/features/window-panels/WindowPanel";

interface HindsightFindingWindowProps {
  instanceId: string;
  finding: Finding;
  findings: Finding[];
  agentId?: string | null;
  audience: DoorAudience;
  onClose: () => void;
}

export default function HindsightFindingWindow({
  instanceId,
  finding,
  findings,
  agentId,
  audience,
  onClose,
}: HindsightFindingWindowProps) {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState(finding.id);
  const [discussing, setDiscussing] = useState(false);
  const detail = useQuery({
    queryKey: ["hindsight", "enrollment", finding.enrollment_id],
    queryFn: () => getEnrollment(finding.enrollment_id),
  });

  const availableFindings = detail.data?.findings ?? findings;
  const activeFinding =
    availableFindings.find((item) => item.id === selectedId) ??
    availableFindings[0] ??
    finding;
  const collectData = () => ({
    finding: activeFinding,
    findings: availableFindings,
    agentId: agentId ?? null,
    audience,
  });
  const invalidateHindsight = () => {
    void queryClient.invalidateQueries({ queryKey: ["hindsight"] });
  };

  const sidebar = (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-border px-2 py-1.5 text-xs font-medium">
        Review items ({availableFindings.length})
      </div>
      <div className="min-h-0 flex-1 space-y-1 p-1.5">
        {availableFindings.map((item) => (
          <button
            key={item.id}
            type="button"
            className={cn(
              "w-full rounded-md px-2 py-2 text-left transition-colors",
              item.id === activeFinding.id
                ? "bg-accent text-accent-foreground"
                : "hover:bg-muted",
            )}
            onClick={() => {
              setSelectedId(item.id);
              setDiscussing(false);
            }}
          >
            <span className="line-clamp-2 text-xs font-medium leading-4">
              {item.title}
            </span>
            <span className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
              <Badge variant="outline" className="px-1 py-0 text-[10px]">
                {LEVER_LABEL[item.lever]}
              </Badge>
              <span>{item.status}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );

  const footer = (
    <div className="flex w-full items-center justify-between gap-3 bg-muted/40 px-3 py-2">
      <span className="shrink-0 text-xs text-muted-foreground">
        {availableFindings.findIndex((item) => item.id === activeFinding.id) +
          1}
        {" of "}
        {availableFindings.length}
      </span>
      <FindingActions
        finding={activeFinding}
        agentId={agentId ?? undefined}
        onChanged={invalidateHindsight}
        onGuide={() => setDiscussing((value) => !value)}
      />
    </div>
  );

  return (
    <DoorAudienceProvider audience={audience}>
      <WindowPanel
        id={instanceId}
        title="Hindsight review items"
        width={1120}
        height={780}
        minWidth={720}
        minHeight={500}
        position="center"
        onClose={onClose}
        overlayId="hindsightFindingWindow"
        overlayInstanceId={instanceId}
        onCollectData={collectData}
        sidebar={sidebar}
        sidebarDefaultSize={260}
        sidebarMinSize={190}
        defaultSidebarOpen
        bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
        footer={footer}
        footerVariant="rich"
      >
        <div className="min-h-0 flex-1 overflow-y-auto">
          <FindingCard
            key={activeFinding.id}
            finding={activeFinding}
            agentId={agentId ?? undefined}
            onChanged={invalidateHindsight}
            initialExpanded
            showWindowDoor={false}
            showActions={false}
            variant="bare"
          />
          {discussing && (
            <div className="px-4 pb-4">
              <DiscussPanel
                reviewId={activeFinding.review_id}
                findingId={activeFinding.id}
                findingTitle={activeFinding.title}
                onResolved={invalidateHindsight}
              />
            </div>
          )}
        </div>
      </WindowPanel>
    </DoorAudienceProvider>
  );
}
