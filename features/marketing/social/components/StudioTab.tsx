"use client";

/**
 * Studio (UI-SPEC §9): the Board with the `marketing-social` preset, for this brand. One board per brand
 * is made on the first open (from the Viral breakdown template); the picker switches to any other board
 * linked to the brand, "New board" adds one. The tab adds only that one row over the board's own chrome.
 */

import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";

import { Button, Select } from "@ai-matrx/design-system/controls";
import { PresetBoard } from "@/features/board/components/PresetBoard";
import { RegionSkeleton } from "@ai-matrx/design-system/controls";
import { toast } from "@/lib/toast";

import { createStudioBoard, listStudioBoards } from "../studio/studio-boards";
import { useSocials } from "./SocialsContext";

const LAYOUT = { propertiesOpen: false, widths: { properties: 250 } } as const;

export function StudioTab() {
  const { brandId, organizationId, brandSeg } = useSocials();
  const client = useQueryClient();
  const key = ["marketing", "social", "studio-boards", organizationId, brandId] as const;
  const boards = useQuery({ queryKey: key, queryFn: () => listStudioBoards({ organizationId, brandId }), staleTime: 15_000 });
  const [picked, setPicked] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const started = useRef(false);

  async function add(title: string) {
    setBusy(true);
    setError(null);
    try {
      const board = await createStudioBoard({ organizationId, brandId, title });
      await client.invalidateQueries({ queryKey: key });
      setPicked(board.id);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not make the Studio board.";
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  // First open: a brand with no Studio board gets one.
  useEffect(() => {
    if (boards.data && boards.data.length === 0 && !started.current) {
      started.current = true;
      void add(`${brandSeg} Studio`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boards.data]);

  const list = boards.data ?? [];
  const current = list.find((b) => b.id === picked) ?? list[0] ?? null;

  if (boards.isError || error) {
    return (
      <div className="flex flex-col items-start gap-2 p-4 text-sm text-foreground">
        <p>{error ?? (boards.error instanceof Error ? boards.error.message : "Could not read the Studio boards.")}</p>
        <Button
          variant="outline"
          onClick={() => {
            started.current = false;
            setError(null);
            void boards.refetch();
          }}
        >
          Try again
        </Button>
      </div>
    );
  }
  if (!current) return <RegionSkeleton />;

  return (
    <div className="flex h-[calc(100dvh-var(--shell-header-h)-2.5rem)] min-h-[520px] flex-col gap-2">
      <div className="flex shrink-0 items-center gap-2">
        <Select
          aria-label="Studio board"
          value={current.id}
          options={list.map((b) => ({ value: b.id, label: b.title }))}
          onValueChange={setPicked}
        />
        <Button variant="quiet" icon={<Plus />} disabled={busy} onClick={() => void add(`${brandSeg} Studio ${list.length + 1}`)}>
          New board
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-border">
        <PresetBoard key={current.id} preset="marketing-social" boardId={current.id} initialLayout={LAYOUT} />
      </div>
    </div>
  );
}
