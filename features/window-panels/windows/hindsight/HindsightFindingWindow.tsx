"use client";

import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { FindingCard } from "@/features/hindsight/components/FindingCard";
import { DoorAudienceProvider } from "@/features/hindsight/components/door-audience";
import type { DoorAudience } from "@/features/hindsight/subject-doors";
import type { Finding } from "@/features/hindsight/types";
import { WindowPanel } from "@/features/window-panels/WindowPanel";

interface HindsightFindingWindowProps {
  instanceId: string;
  finding: Finding;
  agentId?: string | null;
  audience: DoorAudience;
  onClose: () => void;
}

export default function HindsightFindingWindow({
  instanceId,
  finding,
  agentId,
  audience,
  onClose,
}: HindsightFindingWindowProps) {
  const queryClient = useQueryClient();
  const collectData = useCallback(
    () => ({ finding, agentId: agentId ?? null, audience }),
    [agentId, audience, finding],
  );
  const invalidateHindsight = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["hindsight"] });
  }, [queryClient]);

  return (
    <WindowPanel
      id={instanceId}
      title={finding.title}
      width={760}
      height={680}
      minWidth={440}
      minHeight={360}
      position="center"
      onClose={onClose}
      overlayId="hindsightFindingWindow"
      overlayInstanceId={instanceId}
      onCollectData={collectData}
    >
      <DoorAudienceProvider audience={audience}>
        <FindingCard
          finding={finding}
          agentId={agentId ?? undefined}
          onChanged={invalidateHindsight}
          initialExpanded
          showWindowDoor={false}
          variant="bare"
        />
      </DoorAudienceProvider>
    </WindowPanel>
  );
}
