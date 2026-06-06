"use client";

/**
 * PeekDialog — the shared chrome for a resource peek.
 *
 * Most kinds' peeks look the same: a titled dialog with a scrollable body and a
 * footer that opens the full resource. Build a kind's peek by fetching its row
 * and dropping the fields into this shell (see FilePeek / NotePeek for the
 * canonical examples). Kinds with a richer bespoke modal (e.g. agents) can skip
 * this and render their own component instead.
 */

import React from "react";
import { useRouter } from "next/navigation";
import { Loader2, ExternalLink } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export interface PeekDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  icon?: React.ReactNode;
  /** Relative path to the full resource; enables the Open buttons when set. */
  href?: string | null;
  loading?: boolean;
  children?: React.ReactNode;
}

export function PeekDialog({
  open,
  onClose,
  title,
  icon,
  href,
  loading,
  children,
}: PeekDialogProps) {
  const router = useRouter();

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[80vh] flex flex-col gap-0 p-0">
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-border">
          <DialogTitle className="flex items-center gap-2 text-base">
            {icon}
            <span className="truncate">{title}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            children
          )}
        </div>

        {href && (
          <DialogFooter className="px-5 py-3 border-t border-border">
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open(href, "_blank", "noopener,noreferrer")}
            >
              <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
              New tab
            </Button>
            <Button
              size="sm"
              onClick={() => {
                onClose();
                router.push(href);
              }}
            >
              Open
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** A labelled field row for peek bodies. */
export function PeekField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-3 last:mb-0">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-0.5">
        {label}
      </p>
      <div className="text-sm text-foreground">{children}</div>
    </div>
  );
}
