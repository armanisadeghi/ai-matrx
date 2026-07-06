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
  defaultOpen = true,
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

      {/* grid-rows transition: 0fr → 1fr — overflow-hidden on outer, NOT inner */}
      <div className="grid grid-rows-[0fr] peer-checked:grid-rows-[1fr] transition-[grid-template-rows] duration-200 ease-in-out overflow-hidden">
        <div className="min-h-0">
          <div className="pl-2 pt-0.5">{children}</div>
        </div>
      </div>
    </div>
  );
}
