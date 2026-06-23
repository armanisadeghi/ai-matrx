"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/styles/themes/utils";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { WAAvatar } from "../shared/WAAvatar";
import { getSettingsNavItems } from "../modals/settings/settings-nav";
import type { ModalNavItem, ModalNavContext } from "../types";

const OVERLAY_ID = "whatsappSettings";
const WINDOW_ID = "whatsapp-settings";

interface WhatsAppSettingsWindowProps {
  isOpen?: boolean;
  onClose?: () => void;
  userName?: string;
  userAvatarUrl?: string | null;
  initialNavId?: string;
}

interface StackEntry {
  id: string;
  current: ModalNavItem;
}

function findItem(
  items: ModalNavItem[],
  id: string,
): ModalNavItem | null {
  for (const item of items) {
    if (item.id === id) return item;
    if (item.children) {
      const found = findItem(item.children, id);
      if (found) return found;
    }
  }
  return null;
}

export function WhatsAppSettingsWindow({
  onClose,
  userName = "You",
  userAvatarUrl,
  initialNavId = "account",
}: WhatsAppSettingsWindowProps) {
  const navItems = useMemo(() => getSettingsNavItems(), []);

  const [stack, setStack] = useState<StackEntry[]>(() => {
    const item = findItem(navItems, initialNavId) ?? navItems[0];
    return item ? [{ id: item.id, current: item }] : [];
  });
  const [search, setSearch] = useState("");

  const top = stack[stack.length - 1];

  const filteredItems = useMemo(() => {
    if (!search.trim()) return navItems;
    const q = search.toLowerCase();
    return navItems.filter((item) => item.label.toLowerCase().includes(q));
  }, [navItems, search]);

  const navContext: ModalNavContext = useMemo(
    () => ({
      push: (id: string) => {
        const found = findItem(navItems, id);
        if (!found) return;
        setStack((prev) => [...prev, { id, current: found }]);
      },
      pop: () => setStack((prev) => prev.slice(0, -1)),
      current: top?.id ?? "",
    }),
    [navItems, top?.id],
  );

  const handleSelectRoot = (item: ModalNavItem) => {
    if (item.onSelect) item.onSelect();
    setStack([{ id: item.id, current: item }]);
  };

  const showBack = stack.length > 1;
  const goBack = () => setStack((prev) => prev.slice(0, -1));

  const panelNode = top?.current.panel
    ? typeof top.current.panel === "function"
      ? top.current.panel(navContext)
      : top.current.panel
    : null;

  return (
    <WindowPanel
      id={WINDOW_ID}
      overlayId={OVERLAY_ID}
      titleNode={
        <span className="truncate text-xs font-medium text-foreground/80">
          {top?.current.label ?? "Settings"}
        </span>
      }
      minWidth={760}
      minHeight={540}
      bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
      onClose={onClose}
      // Drill-down back navigation is window-level chrome, not content — it
      // lives in the header's left action zone.
      actionsLeft={
        showBack ? (
          <button
            type="button"
            onClick={goBack}
            aria-label="Back"
            className="flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        ) : undefined
      }
      sidebar={
        <SettingsNav
          userName={userName}
          userAvatarUrl={userAvatarUrl}
          search={search}
          onSearchChange={setSearch}
          items={filteredItems}
          activeId={top?.id ?? null}
          onSelect={handleSelectRoot}
        />
      }
      sidebarDefaultSize={280}
      sidebarMinSize={220}
      footerRight={
        <button
          type="button"
          onClick={onClose}
          className="rounded-md bg-muted px-4 py-1.5 text-[13px] text-foreground hover:bg-accent"
        >
          Done
        </button>
      }
    >
      <ScrollArea className="flex-1 bg-background">
        <div className="px-5 pb-6 pt-3">{panelNode}</div>
      </ScrollArea>
    </WindowPanel>
  );
}

interface SettingsNavProps {
  userName: string;
  userAvatarUrl?: string | null;
  search: string;
  onSearchChange: (v: string) => void;
  items: ModalNavItem[];
  activeId: string | null;
  onSelect: (item: ModalNavItem) => void;
}

function SettingsNav({
  userName,
  userAvatarUrl,
  search,
  onSearchChange,
  items,
  activeId,
  onSelect,
}: SettingsNavProps) {
  return (
    <div className="flex h-full flex-col bg-card">
      <div className="px-3 pb-3 pt-3">
        <div className="relative flex h-9 items-center rounded-lg bg-muted">
          <Search
            className="ml-3.5 h-4 w-4 text-muted-foreground"
            aria-hidden
          />
          <input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search"
            aria-label="Search"
            className="flex-1 bg-transparent px-3 text-[14px] text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
        </div>
      </div>
      <div className="px-3 pb-3">
        <div className="flex items-center gap-3 rounded-lg px-3 py-2">
          <WAAvatar name={userName} src={userAvatarUrl} size="lg" />
          <div className="min-w-0">
            <div className="truncate text-[16px] font-medium text-foreground">
              {userName}
            </div>
          </div>
        </div>
      </div>
      <ScrollArea className="flex-1">
        <nav
          className="flex flex-col px-2 pb-3"
          aria-label="Settings sections"
        >
          {items.map((item) => {
            const Icon = item.icon;
            const active = activeId === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelect(item)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left transition-colors",
                  active
                    ? "bg-accent text-foreground"
                    : "text-foreground hover:bg-accent/50",
                  item.destructive && "text-rose-500",
                )}
              >
                {Icon ? (
                  <Icon
                    className={cn(
                      "h-5 w-5 shrink-0",
                      item.destructive
                        ? "text-rose-500"
                        : "text-muted-foreground",
                    )}
                    strokeWidth={1.75}
                  />
                ) : null}
                <span className="flex-1 truncate text-[15px]">
                  {item.label}
                </span>
                {item.children && !item.destructive ? (
                  <ChevronRight
                    className="h-4 w-4 text-muted-foreground"
                    aria-hidden
                  />
                ) : null}
              </button>
            );
          })}
        </nav>
      </ScrollArea>
    </div>
  );
}

export default WhatsAppSettingsWindow;
