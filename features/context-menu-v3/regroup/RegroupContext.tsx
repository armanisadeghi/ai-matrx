"use client";

// features/context-menu-v3/regroup/RegroupContext.tsx
//
// Opt-in, per-subtree: a MenuRegroupContext above a menu wrapper makes THAT
// menu (and only that one) resolve through a registry view that
//   · reports what the real registry resolved (`onResolved`), and
//   · when `grouping` is set, hands the renderer the regrouped actions.
// With no provider above it — every production menu — `RegroupBoundary`
// renders its children untouched.

import * as React from "react";
import type { ActionRegistry, ClickTarget, ResolvedAction } from "@ai-matrx/alchemy/actions";
import { AlchemyActionsProvider, useAlchemyActions } from "@ai-matrx/alchemy/react/host";
import type { ContextMenuLayout } from "../types";
import { regroupResolved, type MenuGrouping } from "./grouping";

export interface MenuResolutionReport {
  target: ClickTarget;
  /** Exactly what the registry resolved for this open — before any grouping. */
  resolved: readonly ResolvedAction[];
  arrangement: ContextMenuLayout;
}

export interface MenuRegroupValue {
  /** null = draw the menu as it is today (report only). */
  grouping: MenuGrouping | null;
  mergeSameName: boolean;
  /** Called on every resolve of this menu; `close` shuts the open menu. */
  onResolved?: (report: MenuResolutionReport, close: () => void) => void;
}

export const MenuRegroupContext = React.createContext<MenuRegroupValue | null>(null);

export function MenuRegroupProvider({ value, children }: { value: MenuRegroupValue; children: React.ReactNode }) {
  return <MenuRegroupContext.Provider value={value}>{children}</MenuRegroupContext.Provider>;
}

interface RegroupInputs {
  value: MenuRegroupValue | null;
  arrangement: ContextMenuLayout;
  close: () => void;
}

/** A registry view over `inner`; `update` hands it the latest render's inputs. */
function regroupingRegistry(inner: ActionRegistry, first: RegroupInputs): ActionRegistry & { update(next: RegroupInputs): void } {
  let inputs = first;
  const read = () => inputs;
  return {
    update(next) {
      inputs = next;
    },
    register: (provider) => inner.register(provider),
    providers: () => inner.providers(),
    subscribe: (listener) => inner.subscribe(listener),
    async resolve(target, restrict) {
      const list = await inner.resolve(target, restrict);
      const { value, arrangement, close } = read();
      if (!value) return list;
      value.onResolved?.({ target, resolved: list, arrangement }, close);
      if (!value.grouping) return list;
      return regroupResolved(target, list, value.grouping, { mergeSameName: value.mergeSameName }).resolved;
    },
  };
}

/** Wraps the menu renderer; a pass-through unless a MenuRegroupContext is above it. */
export function RegroupBoundary({
  arrangement,
  close,
  children,
}: {
  arrangement: ContextMenuLayout;
  close: () => void;
  children: React.ReactElement;
}): React.ReactElement {
  const value = React.useContext(MenuRegroupContext);
  const { registry, ports } = useAlchemyActions();
  // One view per menu open: the provider above a menu does not come and go
  // while it is open, and the menu content remounts on every open.
  const [view] = React.useState(() =>
    value ? regroupingRegistry(registry, { value, arrangement, close }) : null,
  );
  // Resolves run after effects, so the view always reads this render's values.
  React.useLayoutEffect(() => {
    view?.update({ value, arrangement, close });
  });
  if (!view) return children;
  return (
    <AlchemyActionsProvider ports={ports} registry={view}>
      {children}
    </AlchemyActionsProvider>
  );
}
