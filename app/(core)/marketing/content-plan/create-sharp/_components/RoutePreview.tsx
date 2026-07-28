"use client";

/**
 * The consequence, spelled out: every route the commit will touch, before it
 * touches anything. This is the whole reason the surface exists — "services ×
 * 8" is meaningless until you can read /services/service-7 and decide it is
 * what you wanted.
 *
 * Routes are computed by the same arithmetic as the DB trigger, so a row
 * marked "New" is a row the DB will accept and a "In plan" row is one the
 * commit skips.
 */
import { useState } from "react";
import { ChevronRight, CornerDownRight } from "lucide-react";

import type { Preview, PreviewGroup, PreviewRow } from "../_lib/model";

/** Long families collapse to a head + tail; nobody reads location 23 of 40. */
const HEAD = 8;
const TAIL = 3;

function StateChip({ state }: { state: "new" | "in-plan" }) {
  if (state === "new") {
    return (
      <span className="shrink-0 rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
        New
      </span>
    );
  }
  return (
    <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
      In plan
    </span>
  );
}

function Row({ row }: { row: PreviewRow }) {
  return (
    <li className="flex items-center gap-2 px-3 py-1 pl-9 hover:bg-accent/30">
      {row.role === "family_child" ? (
        <CornerDownRight className="h-3 w-3 shrink-0 text-border" />
      ) : null}
      <code
        className={`min-w-0 flex-1 truncate font-mono text-xs ${
          row.state === "new" ? "text-foreground" : "text-muted-foreground"
        }`}
      >
        {row.route}
      </code>
      <span className="hidden min-w-0 max-w-[38%] shrink truncate text-xs text-muted-foreground sm:block">
        {row.label}
      </span>
      <StateChip state={row.state} />
    </li>
  );
}

function Group({ group }: { group: PreviewGroup }) {
  const [expanded, setExpanded] = useState(false);
  const [open, setOpen] = useState(true);
  const rows = group.rows;
  const truncating = !expanded && rows.length > HEAD + TAIL + 1;
  const head = truncating ? rows.slice(0, HEAD) : rows;
  const tail = truncating ? rows.slice(rows.length - TAIL) : [];
  const hiddenCount = rows.length - head.length - tail.length;

  return (
    <section className="border-b border-border/60 last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-accent/40"
      >
        <ChevronRight
          className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`}
        />
        <span className="text-sm font-semibold text-foreground">
          {group.title}
        </span>
        <span className="ml-auto shrink-0 text-xs text-muted-foreground">
          {group.newCount > 0 ? (
            <span className="font-medium text-primary">
              +{group.newCount} new
            </span>
          ) : (
            "nothing to add"
          )}
          <span className="mx-1.5 text-border">·</span>
          {rows.length} total
        </span>
      </button>

      {open ? (
        <div className="pb-1.5">
          {group.note ? (
            <p className="px-3 pb-1.5 pl-9 text-xs text-muted-foreground">
              {group.note}
            </p>
          ) : null}
          <ul>
            {head.map((row) => (
              <Row key={row.route} row={row} />
            ))}
          </ul>
          {truncating ? (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="block w-full px-3 py-1 pl-9 text-left text-xs font-medium text-primary hover:underline"
            >
              Show {hiddenCount} more route{hiddenCount === 1 ? "" : "s"}
            </button>
          ) : null}
          <ul>
            {tail.map((row) => (
              <Row key={row.route} row={row} />
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

export function RoutePreview({ preview }: { preview: Preview }) {
  if (preview.total === 0) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center">
        <p className="max-w-sm text-sm text-muted-foreground">
          This shape produces no pages. Turn a count up on the left to see the
          routes it would create.
        </p>
      </div>
    );
  }
  return (
    <div className="h-full overflow-y-auto scrollbar-thin">
      {preview.groups.map((group) => (
        <Group key={group.key} group={group} />
      ))}
    </div>
  );
}
