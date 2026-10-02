"use client";

/**
 * Local controller for the context-item detail drawer. One per chip-host
 * (a user message bubble, or the input resource strip). Holds the flattened
 * item list + the active index and exposes open/close/prev/next/goTo.
 */

import { useCallback, useMemo, useState } from "react";
import type { ContextDrawerItem } from "./types";

export interface ContextItemDrawerController {
  open: boolean;
  items: ContextDrawerItem[];
  index: number;
  activeItem: ContextDrawerItem | null;
  openAt: (items: ContextDrawerItem[], index: number) => void;
  openItem: (items: ContextDrawerItem[], id: string) => void;
  close: () => void;
  setOpen: (open: boolean) => void;
  goTo: (index: number) => void;
  next: () => void;
  prev: () => void;
}

export function useContextItemDrawer(): ContextItemDrawerController {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<ContextDrawerItem[]>([]);
  const [index, setIndex] = useState(0);

  const openAt = useCallback((next: ContextDrawerItem[], i: number) => {
    setItems(next);
    setIndex(Math.max(0, Math.min(i, next.length - 1)));
    setOpen(true);
  }, []);

  const openItem = useCallback((next: ContextDrawerItem[], id: string) => {
    const i = next.findIndex((it) => it.id === id);
    setItems(next);
    setIndex(i < 0 ? 0 : i);
    setOpen(true);
  }, []);

  const close = useCallback(() => setOpen(false), []);

  const goTo = useCallback(
    (i: number) => setIndex((prev) => (i >= 0 && i < items.length ? i : prev)),
    [items.length],
  );

  const next = useCallback(
    () => setIndex((i) => (i + 1) % Math.max(items.length, 1)),
    [items.length],
  );
  const prev = useCallback(
    () =>
      setIndex(
        (i) => (i - 1 + Math.max(items.length, 1)) % Math.max(items.length, 1),
      ),
    [items.length],
  );

  const activeItem = useMemo(() => items[index] ?? null, [items, index]);

  return {
    open,
    items,
    index,
    activeItem,
    openAt,
    openItem,
    close,
    setOpen,
    goTo,
    next,
    prev,
  };
}
