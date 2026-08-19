"use client";

// UnsplashPickDialog — the free STOCK lane's picker for a card face.
//
// Search (through the shared `lib/media/unsplash` primitive → `/api/unsplash`
// proxy) → pick a photo → confirm its alt text → attach. Three contracts it
// exists to keep:
//
//   1. ALT TEXT IS REQUIRED. Education without alt text is broken for the
//      learners who need it most, so the confirm button stays disabled until
//      the field has real text (pre-filled from Unsplash's own description,
//      falling back to the face text).
//   2. ATTRIBUTION TRAVELS WITH THE PHOTO. The chosen pick's credit goes into
//      `fc_detail.metadata.credit` and renders under the image
//      (Unsplash API guidelines).
//   3. WHAT WE STORE IS DURABLE. Unsplash's own CDN URL is permanent and
//      anonymous-readable — safe for shared/public sets (media-durability).
//
// The ToS download event fires on USE (attach), not on render of results.

import { useCallback, useEffect, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { searchUnsplashPhotos, type UnsplashPick } from "@/lib/media/unsplash";

export interface UnsplashPickDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Seed query — the card's face text. */
  defaultQuery: string;
  /** Attach the chosen photo. Resolve to close; the dialog shows the spinner. */
  onAttach: (pick: UnsplashPick, alt: string) => Promise<void>;
}

export function UnsplashPickDialog({
  open,
  onOpenChange,
  defaultQuery,
  onAttach,
}: UnsplashPickDialogProps) {
  const isMobile = useIsMobile();
  const [query, setQuery] = useState(defaultQuery);
  const [results, setResults] = useState<UnsplashPick[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [selected, setSelected] = useState<UnsplashPick | null>(null);
  const [alt, setAlt] = useState("");
  const [busy, setBusy] = useState(false);

  const runSearch = useCallback(async (q: string) => {
    const term = q.trim();
    if (!term) return;
    setSearching(true);
    try {
      const found = await searchUnsplashPhotos(term, { perPage: 12 });
      setResults(found);
      setSearched(true);
    } finally {
      setSearching(false);
    }
  }, []);

  // Opening runs the seed search immediately — the learner should see photos,
  // not an empty box they have to figure out.
  useEffect(() => {
    if (!open) return;
    setQuery(defaultQuery);
    setResults([]);
    setSearched(false);
    setSelected(null);
    setAlt("");
    setBusy(false);
    void runSearch(defaultQuery);
  }, [open, defaultQuery, runSearch]);

  const pick = (photo: UnsplashPick) => {
    setSelected(photo);
    setAlt(photo.alt?.trim() || defaultQuery.trim());
  };

  const attach = async () => {
    if (!selected || !alt.trim() || busy) return;
    setBusy(true);
    try {
      await onAttach(selected, alt.trim());
    } finally {
      setBusy(false);
    }
  };

  const body = (
    <div className="space-y-3">
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void runSearch(query);
        }}
      >
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="What should the picture show?"
          className="text-base"
          disabled={busy}
        />
        <Button type="submit" size="sm" disabled={busy || searching || !query.trim()}>
          {searching ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Search className="h-4 w-4" />
          )}
          <span className="ml-1">Search</span>
        </Button>
      </form>

      <div className="max-h-[45vh] overflow-y-auto">
        {searching && results.length === 0 ? (
          <div className="grid grid-cols-3 gap-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="aspect-video animate-pulse rounded-sm bg-muted" />
            ))}
          </div>
        ) : results.length > 0 ? (
          <div className="grid grid-cols-3 gap-2">
            {results.map((photo) => (
              <button
                key={photo.id}
                type="button"
                disabled={busy}
                onClick={() => pick(photo)}
                className={cn(
                  "group relative aspect-video overflow-hidden rounded-sm border-2 transition",
                  selected?.id === photo.id
                    ? "border-primary"
                    : "border-transparent hover:border-border",
                )}
                title={photo.alt || `Photo by ${photo.credit.name}`}
              >
                {/* Third-party stock thumbnail — not our media, so no InlineMediaRef. */}
                <img
                  src={photo.thumbUrl}
                  alt={photo.alt || `Photo by ${photo.credit.name}`}
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
                <span className="absolute inset-x-0 bottom-0 truncate bg-background/80 px-1 text-[10px] text-muted-foreground">
                  {photo.credit.name}
                </span>
              </button>
            ))}
          </div>
        ) : searched ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No photos matched that search. Try different words.
          </p>
        ) : null}
      </div>

      <div className="space-y-1">
        <label
          htmlFor="unsplash-alt"
          className="text-xs font-medium text-muted-foreground"
        >
          Describe the picture (alt text, required)
        </label>
        <Input
          id="unsplash-alt"
          value={alt}
          onChange={(e) => setAlt(e.target.value)}
          placeholder="A labeled diagram of a plant cell"
          className="text-base"
          disabled={busy || !selected}
        />
        {selected ? (
          <p className="text-[10px] text-muted-foreground">
            Photo by {selected.credit.name} on Unsplash — credited on the card.
          </p>
        ) : (
          <p className="text-[10px] text-muted-foreground">
            Pick a photo above to continue.
          </p>
        )}
      </div>
    </div>
  );

  const buttons = (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={() => onOpenChange(false)}
        disabled={busy}
      >
        Cancel
      </Button>
      <Button
        type="button"
        onClick={() => void attach()}
        disabled={busy || !selected || !alt.trim()}
      >
        {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
        Use this photo
      </Button>
    </>
  );

  const title = "Pick a photo";
  const description = "Free stock photos from Unsplash. The photographer is credited on the card.";

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>{title}</DrawerTitle>
            <DrawerDescription>{description}</DrawerDescription>
          </DrawerHeader>
          <div className="px-4 pb-2">{body}</div>
          <DrawerFooter className="flex-row justify-end gap-2">{buttons}</DrawerFooter>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {body}
        <DialogFooter>{buttons}</DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default UnsplashPickDialog;
