"use client";

// features/context-menu-v3/designs/Round2Instance.tsx
//
// One copy of the target (ClinicTableList) wired to ONE round-2 variant: the
// desktop menu (R2DesktopPanel) on right-click / ⋯, the phone sheet (R2Sheet)
// on long-press / ⋮. Demo-only.

import * as React from "react";
import { CLINIC_TABLES } from "./catalog";
import { ClinicTableList, firstWord, selectFirstWord } from "./ClinicTableList";
import { wouldRun } from "./DesignInstance";
import { R2DesktopPanel, R2Sheet } from "./Round2Menu";
import { buildRound2, type Round2Key } from "./round2";

interface OpenMenu {
  rowId: string;
  point: { x: number; y: number };
  selection: string | null;
  key: number;
}

export interface Round2InstanceProps {
  variant: Round2Key;
  textSelected: boolean;
  viewer: boolean;
  phone: boolean;
  kindLabel: boolean;
  primary?: boolean;
}

export function Round2Instance({ variant, textSelected, viewer, phone, kindLabel, primary }: Round2InstanceProps) {
  const rootRef = React.useRef<HTMLDivElement>(null);
  const [menu, setMenu] = React.useState<OpenMenu | null>(null);
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    if (textSelected && primary) selectFirstWord(rootRef.current?.querySelector("[data-table-name]") ?? null);
  }, [textSelected, primary, phone]);

  const row = CLINIC_TABLES.find((t) => t.id === menu?.rowId) ?? null;
  const built = row && menu ? buildRound2(variant, { name: row.name, selection: menu.selection, viewer, kindLabel }) : null;

  const openAt = (rowId: string, point: { x: number; y: number }, nameEl: Element | null) => {
    let selection: string | null = null;
    if (textSelected) {
      selectFirstWord(nameEl);
      selection = firstWord(CLINIC_TABLES.find((t) => t.id === rowId)?.name ?? "");
    } else {
      const sel = window.getSelection();
      const text = sel?.toString().trim();
      if (text && sel?.anchorNode && rootRef.current?.contains(sel.anchorNode)) selection = text;
    }
    setMenu((prev) => ({ rowId, point, selection, key: (prev?.key ?? 0) + 1 }));
    setOpen(true);
  };

  return (
    <>
      <ClinicTableList phone={phone} rootRef={rootRef} onOpen={openAt} />
      {menu && built && phone ? <R2Sheet key={menu.key} menu={built} open={open} onOpenChange={setOpen} onRun={wouldRun} /> : null}
      {menu && built && !phone ? <R2DesktopPanel key={menu.key} menu={built} point={menu.point} open={open} onOpenChange={setOpen} onRun={wouldRun} /> : null}
    </>
  );
}
