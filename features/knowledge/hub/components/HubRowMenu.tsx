"use client";

/**
 * The "…" menu every hub row carries (Linear / Notion row menus): the actions
 * the keyboard advertises first — Open, Keep, Archive, Tag, File to — then
 * the kind's own destinations under "Open with", Rename, a Copy submenu, and
 * Trash last. Labels are short verb phrases; each item shows its key.
 */

import Link from "next/link";
import { MoreHorizontal, type LucideIcon } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/utils/cn";

export interface HubMenuItem {
  id: string;
  label: string;
  icon: LucideIcon;
  href?: string | null;
  onSelect?: () => void;
  shortcut?: string;
  destructive?: boolean;
}

export interface HubMenuGroup {
  id: string;
  /** Present: the group is a submenu under this label (Open with, Copy). */
  submenu?: { label: string; icon: LucideIcon };
  items: HubMenuItem[];
}

function Item({ item }: { item: HubMenuItem }) {
  const Icon = item.icon;
  const body = (
    <>
      <Icon className="h-3.5 w-3.5" />
      <span className="min-w-0 flex-1">{item.label}</span>
      {item.shortcut ? <DropdownMenuShortcut>{item.shortcut}</DropdownMenuShortcut> : null}
    </>
  );
  if (item.href)
    return (
      <DropdownMenuItem asChild className="gap-2">
        <Link href={item.href}>{body}</Link>
      </DropdownMenuItem>
    );
  return (
    <DropdownMenuItem
      className={cn("gap-2", item.destructive && "text-destructive focus:text-destructive")}
      onSelect={() => item.onSelect?.()}
    >
      {body}
    </DropdownMenuItem>
  );
}

export function HubRowMenu({ title, groups }: { title: string; groups: HubMenuGroup[] }) {
  const shown = groups.map((g) => ({ ...g, items: g.items.filter((i) => i.href || i.onSelect) })).filter((g) => g.items.length);
  if (!shown.length) return null;
  return (
    <div
      className="shrink-0"
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="inline-flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label={`Actions for ${title}`}
            title="Actions"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        {/* A menu item that opens a dialog (Tag…, File to…, Rename) must not get focus pulled back
            to this trigger as the menu closes — the dialog keeps it, so its input types and Esc closes it. */}
        <DropdownMenuContent align="end" className="w-56" onCloseAutoFocus={(e) => e.preventDefault()}>
          {shown.map((g, i) => (
            <div key={g.id}>
              {/* A rule between groups; consecutive submenus (Open with, Copy) sit together. */}
              {i > 0 && (!g.submenu || !shown[i - 1].submenu) ? <DropdownMenuSeparator /> : null}
              {g.submenu ? (
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger className="gap-2">
                    <g.submenu.icon className="h-3.5 w-3.5" /> {g.submenu.label}
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="w-56">
                    {g.items.map((it) => (
                      <Item key={it.id} item={it} />
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              ) : (
                g.items.map((it) => <Item key={it.id} item={it} />)
              )}
            </div>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
