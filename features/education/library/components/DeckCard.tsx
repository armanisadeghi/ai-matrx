"use client";

import { useState, useTransition } from "react";
import { BadgeCheck, ExternalLink, Layers, Loader2, ShieldOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DuplicateToEditButton } from "@/features/sharing/components/DuplicateToEditButton";
import { CertifiedBadge } from "./CertifiedBadge";
import { SuggestEditDialog } from "./SuggestEditDialog";
import { certifyDeckAction, uncertifyDeckAction } from "../actions";
import type { PublicDeck } from "../types";

/** One community-library deck. Links into the P7 public viewer (signed-out OK),
 *  offers duplicate-to-edit + suggest-edit, and — for super-admins — a
 *  certify/uncertify toggle. */
export function DeckCard({
  deck,
  isSuperAdmin,
  isSignedIn,
  onCertifyChange,
}: {
  deck: PublicDeck;
  isSuperAdmin: boolean;
  isSignedIn: boolean;
  onCertifyChange?: (deckId: string, certified: boolean) => void;
}) {
  const viewHref = `/p/e/fc_set/${deck.id}`;
  const [isPending, startTransition] = useTransition();
  const [certified, setCertified] = useState(deck.certified);

  const toggleCertify = () => {
    const next = !certified;
    startTransition(async () => {
      try {
        if (next) await certifyDeckAction(deck.id);
        else await uncertifyDeckAction(deck.id);
        setCertified(next);
        onCertifyChange?.(deck.id, next);
        toast.success(next ? "Certified" : "Certification removed");
      } catch (e) {
        toast.error((e as Error).message);
      }
    });
  };

  return (
    <div
      className={cn(
        "flex flex-col rounded-2xl border bg-card p-5 transition-all",
        certified ? "border-emerald-500/30" : "border-border",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-semibold leading-snug line-clamp-2">{deck.name}</h3>
        {certified ? <CertifiedBadge note={deck.certifiedNote} /> : null}
      </div>

      {deck.description ? (
        <p className="mt-2 text-sm text-muted-foreground line-clamp-2">
          {deck.description}
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <Layers className="h-3.5 w-3.5" /> {deck.cardCount} card
          {deck.cardCount === 1 ? "" : "s"}
        </span>
        {deck.topic ? (
          <span className="rounded-full border border-border px-2 py-0.5">{deck.topic}</span>
        ) : null}
        {deck.difficulty ? (
          <span className="rounded-full border border-border px-2 py-0.5">
            {deck.difficulty}
          </span>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 pt-4 border-t border-border">
        <Button variant="outline" size="sm" asChild className="gap-1.5">
          <a href={viewHref} target="_blank" rel="noreferrer">
            <ExternalLink className="h-3.5 w-3.5" /> View
          </a>
        </Button>
        <DuplicateToEditButton
          resourceType="fc_set"
          resourceId={deck.id}
          returnPath={viewHref}
          label="Study a copy"
          size="sm"
          variant="secondary"
        />
        {isSignedIn ? <SuggestEditDialog deckId={deck.id} deckName={deck.name} /> : null}
        {isSuperAdmin ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleCertify}
            disabled={isPending}
            className="ml-auto gap-1.5"
            title={certified ? "Remove certification" : "Certify this deck"}
          >
            {isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : certified ? (
              <ShieldOff className="h-3.5 w-3.5" />
            ) : (
              <BadgeCheck className="h-3.5 w-3.5" />
            )}
            {certified ? "Uncertify" : "Certify"}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
