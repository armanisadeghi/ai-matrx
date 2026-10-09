"use client";

// The board template picker: the shared gallery frame (spaces/sidebar/TemplateGalleryShell) with board
// entries - built-ins from code, then the person's saved templates - and a layout sketch for the preview.
// "Use template" makes a new board (duplicateBoard / the built-in's document) and opens it.

import { LayoutTemplate, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { TemplateGalleryShell, type TemplateEntry } from "@/features/spaces/sidebar/TemplateGalleryShell";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { toast } from "@/lib/toast";
import { boardHref, isBoardError } from "../persistence/boardsService";
import { BoardSketch } from "./BoardSketch";
import { listBoardTemplates, makeBoardFromTemplate, templateBoardTitle, type BoardTemplateEntry } from "./board-templates";
import { BUILTIN_BOARD_TEMPLATES } from "./builtin";

export function BoardTemplateGallery({
  open,
  onOpenChange,
  initialKey,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The template to show first (a preset's starter). */
  initialKey?: string;
}) {
  const router = useRouter();
  const organizationId = useAppSelector(selectOrganizationId);
  const [saved, setSaved] = useState<BoardTemplateEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<string>(initialKey ?? BUILTIN_BOARD_TEMPLATES[0].key);
  const [using, setUsing] = useState(false);

  useEffect(() => {
    if (!open) return;
    let live = true;
    listBoardTemplates().then(
      (all) => live && (setSaved(all), setError(null)),
      (e: unknown) => live && setError(e instanceof Error ? e.message : "We couldn't list board templates."),
    );
    return () => {
      live = false;
    };
  }, [open]);

  // Until the read lands the built-ins are already usable (they need no read).
  const all = saved ?? BUILTIN_BOARD_TEMPLATES.map((t) => ({ key: t.key, title: t.title, builtin: true, doc: t.build() }));
  const current = all.find((t) => t.key === picked) ?? all[0] ?? null;
  const entries: TemplateEntry[] = all.map((t) => ({
    key: t.key,
    title: t.title,
    icon: t.builtin ? <Sparkles size={16} /> : <LayoutTemplate size={16} />,
  }));

  const use = async () => {
    if (!current) return;
    setUsing(true);
    try {
      const board = await makeBoardFromTemplate(current.key, organizationId, templateBoardTitle(current.title));
      // A stale toast ("Saved as a template") must not sit over the new board; the new one carries Open
      // in case the navigation is slow or blocked.
      toast.dismiss();
      onOpenChange(false);
      const href = boardHref(board);
      toast.success(`Made "${board.title}"`, { action: { label: "Open", onClick: () => router.push(href) } });
      router.push(href);
    } catch (e) {
      toast.error(isBoardError(e) ? e.message : e instanceof Error ? e.message : "The template could not be used. Try again.");
    } finally {
      setUsing(false);
    }
  };

  return (
    <TemplateGalleryShell
      open={open}
      onOpenChange={onOpenChange}
      heading="Board templates"
      entries={entries}
      loading={saved === null && !error}
      error={error}
      picked={current?.key ?? picked}
      onPick={setPicked}
      previewTitle={current?.title ?? null}
      previewLoading={false}
      preview={current ? <BoardSketch doc={current.doc} /> : null}
      usable={!!current}
      using={using}
      onUse={() => void use()}
    />
  );
}
