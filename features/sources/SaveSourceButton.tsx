"use client";

/**
 * features/sources/SaveSourceButton.tsx — "Save" for one captured page,
 * anywhere a capture is shown (scraper result cards, the chat web-page
 * picker). Opens the ONE Save panel for the Source the capture landed as.
 *
 * Absent-or-honest: with no Source id (the page did not land) the button is
 * replaced by the door's own sentence, never a dead control. Once saved it
 * says "Saved" and opens the Source.
 */

import { useState } from "react";
import Link from "next/link";
import { Bookmark, CheckCircle2, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/utils/cn";
import { sourceHref, type LandingNotice } from "@/features/sources/api/sourcesApi";
import { SaveSourcePanel } from "@/features/sources/SaveSourcePanel";

export interface SaveSourceButtonProps {
  processedDocumentId: string | null;
  name?: string | null;
  notices?: LandingNotice[];
  className?: string;
  /** Called after a successful save (e.g. the chat picker records it). */
  onSaved?: () => void;
}

export function SaveSourceButton({ processedDocumentId, name, notices = [], className, onSaved }: SaveSourceButtonProps) {
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState(false);

  if (!processedDocumentId) {
    return notices[0]?.message ? (
      <p className={cn("text-xs text-muted-foreground", className)}>{notices[0].message}</p>
    ) : (
      <p className={cn("text-xs text-muted-foreground", className)}>
        This page was not added to your Sources, and the server did not say why.
      </p>
    );
  }

  return (
    <div className={cn("flex items-center gap-2", className)}>
      {saved ? (
        <span className="inline-flex items-center gap-1 text-xs text-success">
          <CheckCircle2 className="h-3.5 w-3.5" /> Saved
        </span>
      ) : (
        <Button type="button" size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => setOpen(true)}>
          <Bookmark className="h-3.5 w-3.5" /> Save
        </Button>
      )}
      <Link
        href={sourceHref(processedDocumentId)}
        target="_blank"
        className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
      >
        Open <ExternalLink className="h-3 w-3" />
      </Link>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Save {name || "this page"}</DialogTitle>
          </DialogHeader>
          {open ? (
            <SaveSourcePanel
              embedded
              sources={[{ processedDocumentId, name }]}
              landingNotices={notices}
              onCancel={() => setOpen(false)}
              onSaved={() => {
                setOpen(false);
                setSaved(true);
                onSaved?.();
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
