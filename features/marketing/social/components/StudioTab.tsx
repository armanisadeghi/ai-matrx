"use client";

/**
 * Studio (UI-SPEC §9): the Board with the `marketing-social` preset, for this brand. One Studio board per brand
 * (database-unique) is made on the first open (from the Viral breakdown template); the picker switches to any other board
 * linked to the brand, "New board" adds one. The open board is `?board=<id>` in the address. Full-bleed, exactly as /board/<id>: the board's own title dropdown lists the brand's boards (no strip over it).
 */

import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Check, Plus, Users } from "lucide-react";
import { getBoard } from "@/features/board/persistence/boardsService";

import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { marketingRoutes } from "@/features/marketing/lib/routes";

import { Button } from "@ai-matrx/design-system/controls";
import { PresetBoard } from "@/features/board/components/PresetBoard";
import { RegionSkeleton } from "@ai-matrx/design-system/controls";
import { useMarketingBrand } from "@/features/marketing/lib/brand-context";
import { toast } from "@/lib/toast";

import { createLinkedBoard, getOrCreateStudioBoard, listStudioBoards, shortBoardTitle } from "../studio/studio-boards";
import { addAccountsToStudioBoard, hasProfileTiles } from "../studio/studio-repair";
import { starterAccountSeeds } from "../board-accounts";
import { useAccountRows } from "../hooks";
import { useSocials } from "./SocialsContext";

const LAYOUT = { propertiesOpen: false, widths: { properties: 250 } } as const;

export function StudioTab() {
  const { brandId, brandSeg, organizationId } = useSocials();
  const brandName = useMarketingBrand().name;
  const client = useQueryClient();
  const key = ["marketing", "social", "studio-boards", organizationId, brandId] as const;
  const boards = useQuery({ queryKey: key, queryFn: () => listStudioBoards({ organizationId, brandId }), staleTime: 15_000 });
  // The open board is part of the address (?board=<id>): a refresh or a shared link opens the same board.
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const picked = searchParams.get("board");
  function setPicked(id: string) {
    const next = new URLSearchParams(searchParams.toString());
    next.set("board", id);
    router.replace(`${pathname}?${next}`, { scroll: false });
  }
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const started = useRef(false);
  // Bumped when the board was changed behind the open canvas (a mend, accounts added): the canvas opens again on the saved board.
  const [rev, setRev] = useState(0);
  const [addingAccounts, setAddingAccounts] = useState(false);

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
  const currentId = current?.id ?? null;

  // Nothing here rewrites a board on its own: a board is changed only by the person's click.
  // One click to put the brand's own accounts on a board that has none.
  const accounts = useAccountRows(organizationId, brandId);
  const ownSeeds = starterAccountSeeds(accounts.data ?? []);
  const shape = useQuery({
    queryKey: ["marketing", "social", "studio-board-shape", currentId, rev],
    queryFn: async () => {
      const b = await getBoard(currentId as string);
      return b ? !hasProfileTiles(b.doc) : false;
    },
    enabled: Boolean(currentId),
    staleTime: 0,
    // While the offer shows, look again: an account tile added from the Add menu must take the offer away.
    refetchInterval: (q) => (q.state.data === true ? 4_000 : false),
  });
  const offerAccounts = shape.data === true && ownSeeds.length > 0;

  async function addAccounts() {
    if (!currentId) return;
    setAddingAccounts(true);
    try {
      await addAccountsToStudioBoard(currentId, ownSeeds);
      setRev((n) => n + 1);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not add the accounts.");
    } finally {
      setAddingAccounts(false);
    }
  }

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
          {shortBoardTitle(b.title, brandName)}
        </DropdownMenuItem>
      ))}
      <DropdownMenuItem disabled={busy} onSelect={() => void add(`${brandName} board ${list.length + 1}`, false)}>
        <Plus className="mr-2 h-4 w-4" />
        New board
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

  return (
    <div className="relative h-full min-h-0 w-full">
      <PresetBoard key={`${current.id}:${rev}`} preset="marketing-social" boardId={current.id} initialLayout={LAYOUT} titleMenuExtra={menu} hideNewBoard />
      {offerAccounts ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-16 z-20 flex justify-center">
          <Button variant="primary" className="pointer-events-auto shadow-lg" icon={<Users />} disabled={addingAccounts} onClick={() => void addAccounts()}>
            Add your accounts
          </Button>
        </div>
      ) : null}
    </div>
  );
}
