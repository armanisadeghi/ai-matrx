"use client";

// lib/entity-list/phoneCards.tsx
//
// THE NARROW LAYOUT OF THE CANONICAL LIST PRIMITIVE.
//
// 🚨 WHY THIS EXISTS (cold-walk-6, measured live 2026-09-17). At 390px every
// EntityListPage surface rendered its full horizontal table inside the phone's
// 364px content box: `/masterwork/all` was a SEVEN-column, 3,065px-wide table,
// `/masterwork/encore` 1,720px. A phone showed about one and a half columns of
// seven behind a sideways scroll, and the record name — the only value a person
// is looking for — was a 2,483px-wide anchor 20px tall.
//
// Linear, Airtable and Notion do not scroll a table sideways on a phone: a row
// becomes a compact CARD carrying the name, the one or two fields that decide
// what the row is, its status, and the row's actions — with everything else one
// tap away. That is what this renders.
//
// It is built INTO the primitive, not into a feature: `MatrxDataTable` has had
// a `mobileCards` seam since 2026-08-25 and in a year not one of the ~23
// `EntityListPage` surfaces supplied one, because writing a phone layout per
// surface is work no list owner ever gets to. So the shell supplies the default
// and a surface only DECLARES which of its columns matter
// (`EntityColumnSpec.phone`); a surface that declares nothing still gets a card,
// derived from what it already told the shell.
//
// The table is not gone — `mobileCardsBreakpoint` is `sm`, so anything wider
// than a phone keeps the full grid, and the cards ride the table's own paging,
// loading, empty state and row actions.

import { useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import type { MatrxDataTableMobileCardControls } from "@ai-matrx/design-system/data-table/types";
import { cn } from "@/lib/utils";
import { DATE_FILTER_OPTIONS, type EntityColumnSpec } from "./columns";

/**
 * Where a column belongs on the phone card.
 *
 * - `title` — the identifying line. Exactly one column wins; a second
 *   declaration is ignored in favour of the first, in declaration order.
 * - `primary` — the one or two fields that decide what this row IS (status,
 *   owner, stage). Rendered as label/value pairs directly under the title.
 * - `meta` — a quiet trailing line (when it changed, how many of something).
 * - `rest` — real, but behind the card's own "More" disclosure. One tap.
 * - `off` — never on the card. For a column that only exists to be sorted or
 *   filtered on, or whose value is already inside the title cell.
 */
export type EntityPhoneRole = "title" | "primary" | "meta" | "rest" | "off";

export interface PhoneCardLayout<TRow> {
  title: EntityColumnSpec<TRow> | null;
  primary: EntityColumnSpec<TRow>[];
  meta: EntityColumnSpec<TRow>[];
  rest: EntityColumnSpec<TRow>[];
  /** The favorite column, rendered as the card's own star rather than a field. */
  favorite: EntityColumnSpec<TRow> | null;
}

/** How many undeclared columns are promoted to the card face. Two, like Linear. */
const DEFAULT_PRIMARY_COUNT = 2;

/**
 * A date column's filter options are the shared relative buckets, so the shell
 * can recognise "when" columns without a surface declaring anything. Compared
 * by VALUE, not by reference: a surface that spreads `[...DATE_FILTER_OPTIONS]`
 * or appends its own bucket is still a date column, and a referential check
 * would quietly demote it to a primary field and push the status column off the
 * card face.
 */
function isDateColumn<TRow>(spec: EntityColumnSpec<TRow>): boolean {
  const options = spec.column.filterOptions;
  if (!options?.length) return false;
  const buckets = new Set(DATE_FILTER_OPTIONS.map((o) => o.value));
  return options.every((o) => buckets.has(o.value));
}

/**
 * Resolve the card layout from the columns the surface already declared.
 *
 * DECLARED WINS, ALWAYS. `phone` on any column switches the whole surface to
 * explicit mode for the roles it names, and anything left undeclared falls
 * through to the derivation below — so a surface can name only its status
 * column and keep the sensible default for everything else.
 *
 * THE DEFAULT, when a surface declares nothing:
 *   title    the DOOR column (the record's name, already a real anchor), else
 *            the first visible column that is not the favorite star
 *   meta     every visible date column — "when", which belongs on the quiet line
 *   primary  the next two visible columns after the title
 *   rest     everything else, behind one tap
 *
 * `hiddenColumns` is honoured because a column the user turned OFF must not
 * reappear on a phone: the column picker is one preference across both widths.
 */
export function resolvePhoneCardLayout<TRow>(
  specs: EntityColumnSpec<TRow>[],
  options: {
    doorColumn?: string | null;
    hiddenColumns?: string[];
    showSharedColumns?: boolean;
  } = {},
): PhoneCardLayout<TRow> {
  const hidden = new Set(options.hiddenColumns ?? []);
  const visible = specs.filter(
    (spec) =>
      !hidden.has(spec.id) &&
      (options.showSharedColumns !== false || !spec.scopedToShared),
  );

  const favorite = visible.find((spec) => spec.id === "favorite") ?? null;
  const fieldable = visible.filter((spec) => spec.id !== "favorite");

  const declared = (role: EntityPhoneRole) =>
    fieldable.filter((spec) => spec.phone === role);

  let title = declared("title")[0] ?? null;
  const primary = [...declared("primary")];
  const meta = [...declared("meta")];
  const explicit = new Set(
    fieldable.filter((spec) => spec.phone).map((spec) => spec.id),
  );

  const undeclared = fieldable.filter((spec) => !explicit.has(spec.id));

  if (!title) {
    title =
      undeclared.find((spec) => spec.id === options.doorColumn) ??
      undeclared[0] ??
      null;
  }

  const remaining = undeclared.filter((spec) => spec.id !== title?.id);

  // "When" is never the field that tells you what a row is.
  for (const spec of remaining) {
    if (isDateColumn(spec)) meta.push(spec);
  }
  const metaIds = new Set(meta.map((spec) => spec.id));

  const promotable = remaining.filter((spec) => !metaIds.has(spec.id));
  const roomLeft = Math.max(0, DEFAULT_PRIMARY_COUNT - primary.length);
  primary.push(...promotable.slice(0, roomLeft));
  const primaryIds = new Set(primary.map((spec) => spec.id));

  const rest = [
    ...declared("rest"),
    ...promotable.filter((spec) => !primaryIds.has(spec.id)),
  ];

  return { title, primary, meta, rest, favorite };
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 items-baseline gap-2">
      <dt className="shrink-0 text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="min-w-0 flex-1 truncate text-xs text-foreground">
        {children}
      </dd>
    </div>
  );
}

/**
 * ONE phone card. Rendered by MatrxDataTable below `sm` in place of the row.
 *
 * Every value goes through `controls.renderCell`, so a cell keeps the exact
 * link, formatting and inline-edit behaviour it has in the grid — the card is a
 * layout, never a second renderer (the shape law's rule, applied to a row).
 * `controls.actions` carries the table's own copy controls plus the surface's
 * kebab, so the card forks neither.
 */
export function EntityPhoneCard<TRow>({
  layout,
  controls,
  rowId,
  rowName,
}: {
  layout: PhoneCardLayout<TRow>;
  controls: MatrxDataTableMobileCardControls;
  rowId: string;
  rowName: string;
}) {
  const [open, setOpen] = useState(false);
  const restId = useId();

  return (
    <article
      // The shell's right-click / long-press menu resolves the row from this
      // anchor; MatrxDataTable stamps it on table rows and a card owes the same.
      data-row-id={rowId}
      data-entity-phone-card
      // The platform's ONE coarse-pointer hit-area utility, so every control a
      // card carries — this file's and any a surface's own cell renders — keeps
      // the 44px floor without a per-element size anywhere.
      className="matrx-touch-targets shrink-0 rounded-lg border border-border bg-card px-3 py-2.5"
    >
      <div className="flex min-w-0 items-start gap-1">
        {layout.favorite ? (
          <div className="-ml-1.5 shrink-0">
            {controls.renderCell(layout.favorite.id)}
          </div>
        ) : null}
        {/*
          The grid's name cell truncates on purpose — it must stay inside its
          column. A card has no column, so the title gets two lines back: the
          `truncate` utility itself is targeted (a cell's own markup is its
          business, but `truncate` is the ONE class that says "cut me at this
          column's width"), and `!` because `whitespace-normal` and `truncate`
          are utilities of the same weight and the stylesheet emits `truncate`
          last — which is why the card first printed "An assistant that decides,
          exact…" on a 340px line with the whole width to spare.
        */}
        {/*
          The title anchor IS the card's door and its largest tap target, so it
          carries the 44px floor itself — measured at 35px (light) and 19px
          (a one-line name) before this. `.matrx-touch-targets` cannot reach it:
          that utility deliberately excludes plain anchors so prose links do not
          become blocks, and an anchor this primitive renders has no call site
          to stamp `data-tap-target` on.
        */}
        <div className="min-w-0 flex-1 text-sm font-medium leading-snug text-foreground [&_.truncate]:!whitespace-normal [&_.truncate]:line-clamp-2 [&_a]:block [&_a]:min-h-11 [&_a]:py-2.5">
          {layout.title ? controls.renderCell(layout.title.id) : rowName}
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          {controls.actions}
        </div>
      </div>

      {layout.primary.length > 0 ? (
        <dl className="mt-1.5 space-y-1">
          {layout.primary.map((spec) => (
            <Field key={spec.id} label={spec.label}>
              {controls.renderCell(spec.id)}
            </Field>
          ))}
        </dl>
      ) : null}

      {layout.meta.length > 0 ? (
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
          {layout.meta.map((spec) => (
            <span key={spec.id} className="inline-flex items-baseline gap-1">
              <span className="uppercase tracking-wide">{spec.label}</span>
              {controls.renderCell(spec.id)}
            </span>
          ))}
        </div>
      ) : null}

      {layout.rest.length > 0 ? (
        <>
          <button
            type="button"
            aria-expanded={open}
            aria-controls={restId}
            onClick={() => setOpen((v) => !v)}
            className="mt-1 inline-flex min-h-11 items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ChevronDown
              className={cn(
                "h-3.5 w-3.5 transition-transform",
                open && "rotate-180",
              )}
            />
            {open
              ? "Less"
              : `${layout.rest.length} more ${layout.rest.length === 1 ? "field" : "fields"}`}
          </button>
          {open ? (
            <dl id={restId} className="space-y-1 pb-1">
              {layout.rest.map((spec) => (
                <Field key={spec.id} label={spec.label}>
                  {controls.renderCell(spec.id)}
                </Field>
              ))}
            </dl>
          ) : null}
        </>
      ) : null}
    </article>
  );
}
