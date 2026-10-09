"use client";

/**
 * Studio (UI-SPEC §9): the Board with the `marketing-social` preset, for this brand. One Studio board per brand
 * (database-unique) is made on the first open (from the Viral breakdown template); the picker switches to any other board
 * linked to the brand, "New board" adds one. Full-bleed, exactly as /board/<id>: the board's own title dropdown lists the brand's boards (no strip over it).
 */

import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { Check, Plus, Users } from "lucide-react";

import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { marketingRoutes } from "@/features/marketing/lib/routes";

import { Button } from "@ai-matrx/design-system/controls";
import { PresetBoard } from "@/features/board/components/PresetBoard";
import { RegionSkeleton } from "@ai-matrx/design-system/controls";
import { useMarketingBrand } from "@/features/marketing/lib/brand-context";
import { toast } from "@/lib/toast";

import { createLinkedBoard, getOrCreateStudioBoard, listStudioBoards } from "../studio/studio-boards";
import { useSocials } from "./SocialsContext";

const LAYOUT = { propertiesOpen: false, widths: { properties: 250 } } as const;

export function StudioTab() {
  const { brandId, brandSeg, organizationId } = useSocials();
  const brandName = useMarketingBrand().name;
  const client = useQueryClient();
  const key = ["marketing", "social", "studio-boards", organizationId, brandId] as const;
  const boards = useQuery({ queryKey: key, queryFn: () => listStudioBoards({ organizationId, brandId }), staleTime: 15_000 });
  const [picked, setPicked] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const started = useRef(false);

  async function add(title: string, studio: boolean) {
    setBusy(true);
    setError(null);
    try {
      const board = studio
        ? await getOrCreateStudioBoard({ organizationId, brandId, title })
        : await createLinkedBoard({ organizationId, brandId, title });
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

  // First open: a brand with no Studio board gets one (the database holds it to one).
  useEffect(() => {
    if (boards.data && !boards.data.some((b) => b.canonical) && !started.current) {
      started.current = true;
      void add(`${brandName} Studio`, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boards.data]);

  const list = boards.data ?? [];
  // Opens on the brand's Studio board (listed first), whatever else was opened last.
  const current = list.find((b) => b.id === picked) ?? list.find((b) => b.canonical) ?? null;

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

  const menu = (
    <>
      {list.map((b) => (
        <DropdownMenuItem key={b.id} onSelect={() => setPicked(b.id)}>
          <Check className={`mr-2 h-4 w-4 ${b.id === current.id ? "opacity-100" : "opacity-0"}`} />
          {b.title}
        </DropdownMenuItem>
      ))}
      <DropdownMenuItem disabled={busy} onSelect={() => void add(`${brandName} board ${list.length + 1}`, false)}>
        <Plus className="mr-2 h-4 w-4" />
        New {brandName} board
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem asChild>
        <Link href={marketingRoutes.brandSocials(brandSeg)}>
          <Users className="mr-2 h-4 w-4" />
          Socials
        </Link>
      </DropdownMenuItem>
      <DropdownMenuSeparator />
    </>
  );

  return <PresetBoard key={current.id} preset="marketing-social" boardId={current.id} initialLayout={LAYOUT} titleMenuExtra={menu} />;
}
