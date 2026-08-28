"use client";

/**
 * PipelineWorkspace — the desktop-first pipeline manager: stage stepper
 * across the top, the active stage's item list on the left, the selected
 * item's stage workspace on the right. On mobile the two panes stack: list
 * first, workspace with a back control once an item is picked.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectEffectiveOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "@/lib/toast";

import type { PipelineStage } from "../../pipeline-types";
import {
  countItemsByStage,
  countOpenQuestionsByItem,
  listItemsByStage,
  loadPipelineItem,
  type PipelineItem,
} from "../../pipeline-service";
import { listFilesForItems } from "../../service";
import { StageStepper } from "./StageStepper";
import { StageItemList, type StageListEntry } from "./StageItemList";
import { ItemWorkspace } from "./ItemWorkspace";

export function PipelineWorkspace({
  initialItemId,
}: {
  initialItemId: string | null;
}) {
  const organizationId = useAppSelector(selectEffectiveOrganizationId);
  const isMobile = useIsMobile();

  const [stage, setStage] = useState<PipelineStage>("intake");
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [entries, setEntries] = useState<StageListEntry[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Mobile: once an item is picked, the workspace replaces the list.
  const [mobileDetail, setMobileDetail] = useState(false);

  const refreshCounts = useCallback(async () => {
    if (!organizationId) return;
    try {
      setCounts(await countItemsByStage(organizationId));
    } catch (err) {
      console.error("[product-pipeline] counts failed", err);
    }
  }, [organizationId]);

  const refreshList = useCallback(
    async (forStage: PipelineStage) => {
      if (!organizationId) return;
      try {
        const items = await listItemsByStage(organizationId, forStage);
        const [filesByItem, openByItem] = await Promise.all([
          listFilesForItems(items.map((i) => i.id)),
          countOpenQuestionsByItem(organizationId),
        ]);
        setEntries(
          items.map((item) => {
            const files = filesByItem.get(item.id) ?? [];
            const photos = files.filter((f) => f.kind === "photo");
            return {
              item,
              thumbFileId:
                item.featuredFileId ?? photos[0]?.fileId ?? null,
              photoCount: photos.length,
              openQuestions: openByItem.get(item.id) ?? 0,
            };
          }),
        );
      } catch (err) {
        console.error("[product-pipeline] stage list failed", err);
        toast.error("Could not load the stage items.");
        setEntries([]);
      }
    },
    [organizationId],
  );

  const refreshAll = useCallback(() => {
    void refreshCounts();
    void refreshList(stage);
  }, [refreshCounts, refreshList, stage]);

  // Initial + per-stage load (deferred a tick — no sync setState in effect).
  useEffect(() => {
    if (!organizationId) return;
    const timer = setTimeout(() => {
      setEntries(null);
      void refreshCounts();
      void refreshList(stage);
    }, 0);
    return () => clearTimeout(timer);
  }, [organizationId, stage, refreshCounts, refreshList]);

  // ?item= deep link: land on that item's stage with it selected.
  const deepLinkTriedRef = useRef(false);
  useEffect(() => {
    if (!initialItemId || !organizationId || deepLinkTriedRef.current) return;
    deepLinkTriedRef.current = true;
    const timer = setTimeout(() => {
      void loadPipelineItem(initialItemId)
        .then((item) => {
          if (!item) return;
          setStage(item.stage);
          setSelectedId(item.id);
          setMobileDetail(true);
        })
        .catch((err: unknown) => {
          console.error("[product-pipeline] deep link failed", err);
        });
    }, 0);
    return () => clearTimeout(timer);
  }, [initialItemId, organizationId]);

  const selectItem = (item: PipelineItem) => {
    setSelectedId(item.id);
    setMobileDetail(true);
  };

  const list = (
    <div className="flex min-h-0 flex-col">
      <StageItemList
        entries={entries ?? []}
        loading={entries === null}
        selectedId={selectedId}
        onSelect={selectItem}
      />
    </div>
  );

  const detail = selectedId ? (
    <ItemWorkspace
      key={selectedId}
      itemId={selectedId}
      onItemChanged={refreshAll}
    />
  ) : (
    <p className="py-16 text-center text-sm text-muted-foreground">
      Select an item to work on it.
    </p>
  );

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <StageStepper
        active={stage}
        counts={counts}
        onSelect={(s) => {
          setStage(s);
          setSelectedId(null);
          setMobileDetail(false);
        }}
      />
      {isMobile ? (
        <div className="min-h-0 flex-1 overflow-y-auto pb-safe">
          {mobileDetail && selectedId ? (
            <div className="space-y-3">
              <Button
                variant="ghost"
                size="sm"
                className="h-9"
                onClick={() => setMobileDetail(false)}
              >
                <ChevronLeft className="mr-1 h-4 w-4" />
                Back to {stage} list
              </Button>
              {detail}
            </div>
          ) : (
            list
          )}
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-[20rem_minmax(0,1fr)] gap-4">
          <div className="min-h-0 overflow-y-auto pr-1">{list}</div>
          <div className="min-h-0 overflow-y-auto pb-6">{detail}</div>
        </div>
      )}
    </div>
  );
}
