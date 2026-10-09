"use client";

// "Start from a template" for the empty board's Start panel: the preset's starter first (if it names one),
// then the other built-ins, and a link to the whole gallery. Using one makes a NEW board from the template
// and opens it (Use = duplicateBoard / the built-in's document), the same door as the gallery.

import { LayoutTemplate, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { useAppSelector } from "@/lib/redux/hooks";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { toast } from "@/lib/toast";
import { boardHref, isBoardError } from "../persistence/boardsService";
import { BoardTemplateGallery } from "./BoardTemplateGallery";
import { makeBoardFromTemplate } from "./board-templates";
import { BUILTIN_BOARD_TEMPLATES } from "./builtin";

/** Built-ins with the starter (when it names one) first. Exported for the test. */
export function orderedStarters(starterKey: string | undefined) {
  return [...BUILTIN_BOARD_TEMPLATES].sort((a, b) => Number(b.key === starterKey) - Number(a.key === starterKey));
}

export function StartTemplates({ starterKey }: { starterKey?: string }) {
  const router = useRouter();
  const organizationId = useAppSelector(selectOrganizationId);
  const [busy, setBusy] = useState<string | null>(null);
  const [galleryOpen, setGalleryOpen] = useState(false);

  const use = async (key: string, title: string) => {
    setBusy(key);
    try {
      const board = await makeBoardFromTemplate(key, organizationId, title);
      router.push(boardHref(board));
    } catch (e) {
      toast.error(isBoardError(e) ? e.message : e instanceof Error ? e.message : "The template could not be used. Try again.");
      setBusy(null);
    }
  };

  return (
    <>
      <h3 className="mt-5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Start from a template</h3>
      <div className="mt-2 flex flex-wrap gap-2">
        {orderedStarters(starterKey).map((t) => (
          <button
            key={t.key}
            type="button"
            disabled={busy !== null}
            title={t.summary}
            onClick={() => void use(t.key, t.title)}
            className="flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5 text-sm text-foreground transition-colors hover:border-primary/60 hover:bg-primary/5 disabled:opacity-60"
          >
            <Sparkles className="h-4 w-4 text-primary" />
            {busy === t.key ? "Making your board…" : t.title}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setGalleryOpen(true)}
          className="flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-primary/60 hover:bg-primary/5"
        >
          <LayoutTemplate className="h-4 w-4" />
          All templates
        </button>
      </div>
      <BoardTemplateGallery open={galleryOpen} onOpenChange={setGalleryOpen} initialKey={starterKey} />
    </>
  );
}
