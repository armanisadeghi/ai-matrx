import type { ReactNode } from "react";
import { getMenuIcon, type MenuIconKey } from "./menuIconRegistry";

interface MenuGroupProps {
  id: string;
  icon: MenuIconKey;
  label: string;
  defaultOpen?: boolean;
  iconClassName?: string;
  children: ReactNode;
}

/*
  Pure CSS accordion pattern:
    input[type=checkbox] (peer, sr-only)
    label[for=id]        — trigger; chevron svg inside is rotated via parent has()
    div.grid             — peer-checked:grid-rows-[1fr] expands the content

  The outer wrapper uses `has(:checked)` to rotate the chevron inside the label,
  since the label precedes the grid div (both siblings of the checkbox).
*/
export function MenuGroup({
  id,
  icon,
  label,
  defaultOpen = false,
  iconClassName,
  children,
}: MenuGroupProps) {
  const Icon = getMenuIcon(icon);
  const inputId = `menu-group-${id}`;

  return (
    <div className="[&:has(input:checked)_.mg-chevron]:rotate-180">
      <input
        type="checkbox"
        id={inputId}
        className="peer sr-only"
        defaultChecked={defaultOpen}
      />

      <label
        htmlFor={inputId}
        className="flex items-center gap-2 w-full px-3 py-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground rounded-full cursor-pointer select-none transition-colors hover:bg-[var(--matrx-glass-bg-hover)]"
      >
        <span className={iconClassName}>
          <Icon className="w-3.5 h-3.5 shrink-0" />
        </span>
        <span className="flex-1 text-left">{label}</span>
        <svg
          className="mg-chevron w-3 h-3 shrink-0 transition-transform duration-200"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </label>

      {/* grid-rows transition: 0fr → 1fr — overflow-hidden on outer, NOT inner.
          🚨 `min-w-0` ON THE GRID ITEM IS LOAD-BEARING, NOT TIDINESS. A grid
          item's `min-width` defaults to `auto`, which resolves to its
          MIN-CONTENT width — and because the clip lives on the OUTER grid (not
          on the item, which would zero that automatic minimum by itself), any
          child wider than the 226px menu track silently grew the item past the
          track and the outer `overflow-hidden` ate it. That is exactly what
          cold walk 13's N1 measured: the organization picker laid out 467px
          wide inside a 226px disclosure, so all 48 workspace names — and the
          "No organization selected — pick one below." line above them — were
          clipped off the edge and the section read as a blank rectangle.
          Truncating text (`truncate` sets `white-space: nowrap`) contributes
          its FULL width to min-content, so every list this group will ever hold
          is exposed the same way. Measured gate:
          `features/shell/layout-gate/user-menu-org-disclosure.spec.ts`.

          🚨 `invisible peer-checked:visible` IS THE SECOND LOAD-BEARING PIECE,
          and it is not styling. `overflow-hidden` only CLIPS the collapsed
          content: every row keeps its box, keeps its place in the hit-test
          tree and stays a tab stop, painted nowhere. A group sitting low in
          the account menu therefore parks live buttons BELOW the panel and
          below the window — cold walk 16 (2026-09-21, defect E, production,
          1440x900) measured the theme row at `top 878, bottom 906` in a 900px
          window with `elementFromPoint` answering
          `LABEL.shell-user-menu-backdrop`, three real mouse clicks timing out,
          and the panel unable to scroll to it because a clipped child adds
          nothing to `scrollHeight`. Hiding the content makes a collapsed row
          ABSENT instead of present-but-unreachable (and drops it out of the
          tab order). `visibility` transitions discretely — visible the instant
          the group opens, hidden only when the collapse finishes — so it is
          listed in the same `transition-[…]` and the animation is unchanged.
          Measured gate:
          `features/shell/layout-gate/user-menu-reachability.spec.ts`. */}
      <div className="grid grid-rows-[0fr] peer-checked:grid-rows-[1fr] invisible peer-checked:visible transition-[grid-template-rows,visibility] duration-200 ease-in-out overflow-hidden">
        <div className="min-h-0 min-w-0">
          <div className="pl-2 pt-0.5">{children}</div>
        </div>
      </div>
    </div>
  );
}
