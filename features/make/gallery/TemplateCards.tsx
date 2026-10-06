// features/make/gallery/TemplateCards.tsx — LANE MAKE-HOME (v6), wave 4b.
//
// THE GALLERY'S DRAWING, ONE COMPONENT FOR TWO HOSTS: the signed-in gallery on /make
// (TemplateGallery.tsx) and the public, indexed gallery at /templates (Arman 2026-10-02: "public
// and indexed"). Both draw a card list and a template's summary from these components; only the
// address a card opens and the action under the summary differ, and the host passes those in.
//
// No store import and no client hook: the public pages render this on the server, so a crawler
// reads every card. Everything shown is the card `custom.templates` answers — the template's own
// invented business, never anyone's rows.

import Link from "next/link";
import type { ReactNode } from "react";

import { footprintLine, footprintParts, wordFor, type GalleryCard } from "./catalogue";
import { TemplateThumb } from "./TemplateShowcase";

export function TemplateCardGrid({
  cards,
  hrefFor,
  attr,
}: {
  cards: readonly GalleryCard[];
  hrefFor: (card: GalleryCard) => string;
  attr: string;
}) {
  return (
    <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,16rem),1fr))] gap-3" {...{ [attr]: "" }}>
      {cards.map((card) => (
        <li key={card.id} className="min-w-0">
          <Link
            href={hrefFor(card)}
            data-make-gallery-card={card.catalogue_id}
            data-industry={card.industry ?? ""}
            className="flex h-full min-w-0 flex-col gap-1 rounded-xl border border-border bg-card p-3 shadow-sm transition hover:border-primary/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {card.thumb ? (
              <span className="mb-1 block">
                <TemplateThumb thumb={card.thumb} />
              </span>
            ) : null}
            <span className="flex min-w-0 items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{card.name}</span>
              {card.installed ? <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-[11px] text-primary-ink">Installed</span> : null}
            </span>
            <span className="truncate text-xs text-muted-foreground">{card.business ?? card.vertical ?? ""}</span>
            <span className="truncate text-xs text-muted-foreground" data-make-footprint="">{footprintLine(card.footprint)}</span>
            {card.teaches ? (
              <span className="mt-1 self-start rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">{wordFor("teaches", card.teaches)}</span>
            ) : null}
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function TemplateChip({ children }: { children: ReactNode }) {
  return <span className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground">{children}</span>;
}

/** A template's name, its chips, who it is for and what it makes. The host draws the action below. */
export function TemplateSummary({ card }: { card: GalleryCard }) {
  const parts = footprintParts(card.footprint);
  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{card.name}</h1>
        <p className="truncate text-sm text-muted-foreground">{card.business ?? card.vertical ?? ""}</p>
      </div>

      <div className="flex flex-wrap gap-1.5 text-xs">
        {card.industry ? <TemplateChip>{wordFor("industry", card.industry)}</TemplateChip> : null}
        {card.job ? <TemplateChip>{wordFor("job", card.job)}</TemplateChip> : null}
        {card.teaches ? <TemplateChip>{wordFor("teaches", card.teaches)}</TemplateChip> : null}
        {card.strengths.map((s) => (
          <TemplateChip key={s}>{wordFor("strength", s)}</TemplateChip>
        ))}
      </div>

      {card.persona ? <p className="max-w-2xl text-sm text-foreground">{card.persona}</p> : null}

      <section className="flex flex-col gap-2" aria-labelledby="make-template-installs">
        <h2 id="make-template-installs" className="text-sm font-medium text-muted-foreground">
          What it makes
        </h2>
        <ul className="flex flex-wrap gap-2" data-make-template-footprint={footprintLine(card.footprint)}>
          {parts.map((p) => (
            <li key={p.kind} className="rounded-lg border border-border bg-card px-3 py-2 text-sm">
              <span className="font-medium tabular-nums">{p.count}</span> <span className="text-muted-foreground">{p.label}</span>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
