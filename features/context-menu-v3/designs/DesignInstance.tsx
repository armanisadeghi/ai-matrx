"use client";

// features/context-menu-v3/designs/DesignInstance.tsx
//
// One copy of the target (ClinicTableList) wired to ONE round-1 design. Right-
// click a row, or its ⋯, and the same menu opens. Desktop draws through the
// demo twin (DesignMenuPanel) over the package's own MenuModel — since round 2
// always, so the round-2 sizes (sizing.ts) apply to the earlier designs too;
// the phone draws through the package's ActionSheet (sized by the page's
// scoped style). Each copy has its own Alchemy registry, so several copies on
// one page never share or collide on action ids. Demo-only.

import * as React from "react";
import dynamic from "next/dynamic";
import { createActionRegistry, type ActionProvider } from "@ai-matrx/alchemy/actions";
import { AlchemyActionsProvider, useRegisterActionProvider } from "@ai-matrx/alchemy/react/host";
import { useAlchemyHostPorts } from "@/components/agent-copy/AlchemyHost";
import { toast } from "@/lib/toast";
import { CLINIC_TABLES, buildDesign, type DesignKey, type DesignSpec } from "./catalog";
import { ClinicTableList, firstWord, selectFirstWord } from "./ClinicTableList";
import { DesignMenuPanel } from "./DesignMenuPanel";
import { demoTarget, designContext, fullModel, specActions } from "./model";

export { firstWord } from "./ClinicTableList";

// The package's phone layout loads on first open, as everywhere else in the app.
const ActionSheet = dynamic(() => import("@ai-matrx/alchemy/react/sheet").then((m) => m.ActionSheet), { ssr: false });

export function wouldRun(label: string) {
  toast(`Would run: ${label}`);
}

interface OpenMenu {
  rowId: string;
  point: { x: number; y: number };
  selection: string | null;
  key: number;
}

function SpecProvider({ spec }: { spec: DesignSpec }) {
  const provider = React.useMemo<ActionProvider>(
    () => ({ id: "context-menu-designs", tier: "T0", actions: () => specActions(spec, wouldRun) }),
    [spec],
  );
  useRegisterActionProvider(provider);
  return null;
}

export interface DesignInstanceProps {
  design: DesignKey;
  textSelected: boolean;
  viewer: boolean;
  phone: boolean;
  /** This copy shows the "Text selected" highlight when the toggle turns on. */
  primary?: boolean;
}

export function DesignInstance({ design, textSelected, viewer, phone, primary }: DesignInstanceProps) {
  const ports = useAlchemyHostPorts();
  const registry = React.useMemo(() => createActionRegistry({ ports }), [ports]);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const [menu, setMenu] = React.useState<OpenMenu | null>(null);
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    if (textSelected && primary) selectFirstWord(rootRef.current?.querySelector("[data-table-name]") ?? null);
  }, [textSelected, primary, phone]);

  const row = CLINIC_TABLES.find((t) => t.id === menu?.rowId) ?? null;
  const spec = React.useMemo(
    () => (row && menu ? buildDesign(design, { selection: menu.selection, viewer, name: row.name }) : null),
    [design, menu, row, viewer],
  );
  const target = React.useMemo(() => demoTarget(menu?.selection ?? null), [menu]);

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

  const drawn = spec && !phone ? fullModel(spec, wouldRun).model : null;

  return (
    <AlchemyActionsProvider ports={ports} registry={registry}>
      {spec ? <SpecProvider spec={spec} /> : null}
      <ClinicTableList phone={phone} rootRef={rootRef} onOpen={openAt} />
      {menu && spec && phone ? (
        <ActionSheet
          key={menu.key}
          target={target}
          open={open}
          onOpenChange={setOpen}
          {...(menu.selection ? {} : { contentLabel: spec.header.label, content: spec.header.text })}
        />
      ) : null}
      {menu && spec && drawn ? (
        <DesignMenuPanel
          key={menu.key}
          model={drawn}
          arranged={designContext(drawn, spec.stripAfter)}
          point={menu.point}
          open={open}
          onOpenChange={setOpen}
          onRun={wouldRun}
        />
      ) : null}
    </AlchemyActionsProvider>
  );
}
