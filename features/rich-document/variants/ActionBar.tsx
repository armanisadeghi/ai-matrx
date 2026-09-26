"use client";

// features/rich-document/variants/ActionBar.tsx
//
// Full inline action bar — the Alchemy package's ONE bar layout
// (`@ai-matrx/alchemy/react/bar`) over the app's one action registry, with the
// rich-document provider's actions (ALC-15 S2). Primaries inline, the rest
// under ⋯ (a bottom sheet on a phone). The Alchemy copy menu leads the bar as
// the one-tap copy until the transfer group renders the format palette inside
// every layout (ALC-16 moves the palette into the package).

import * as React from "react";
import { ActionBar as AlchemyActionBar } from "@ai-matrx/alchemy/react/bar";
import type { ClickTarget } from "@ai-matrx/alchemy/actions";
import { useAlchemyActions } from "@ai-matrx/alchemy/react/host";
import { ensureRichDocumentProvider } from "../actions/provider";
import { cn } from "@/lib/utils";
import { AlchemyDocumentMenu } from "./shared/AlchemyDocumentMenu";
import { OpenOneMenuButton, useOneMenuFor } from "./shared/OpenOneMenuButton";
import type { RichDocumentAction, RichDocumentActionContext } from "../types";

export interface ActionBarProps {
  actions: RichDocumentAction[];
  getCtx: () => RichDocumentActionContext;
  /** The click target the host built (`richDocumentClickTarget`). */
  target: ClickTarget;
  sourceId: string;
  className?: string;
  /** Hide the ⋯ overflow (a host setting turned the options off). */
  hideOverflow?: boolean;
  /** Condensed presentation (the "mini-bar" variant). */
  mini?: boolean;
}

/** The Alchemy menu is the one-tap copy; the registry's own "copy" row stays out of the bar. */
const BAR_RESTRICT = { exclude: ["copy"] } as const;

export function ActionBar(props: ActionBarProps): React.ReactElement {
  const { actions, getCtx, target, sourceId, className, hideOverflow = false, mini = false } = props;
  // Idempotent: the one registry gets the rich-document provider once.
  ensureRichDocumentProvider(useAlchemyActions().registry);
  const oneMenu = useOneMenuFor(getCtx().source);
  const hasCopy = actions.some((action) => action.category === "copy");
  return (
    <div
      className={cn(
        mini ? "inline-flex items-center gap-0.5 px-0.5 py-0.5" : "inline-flex items-center gap-1 px-1 py-1",
        className,
      )}
    >
      {hasCopy ? (
        <AlchemyDocumentMenu key={sourceId} getCtx={getCtx} sourceId={sourceId} size={mini ? "xs" : "sm"} />
      ) : null}
      <AlchemyActionBar
        target={target}
        mini={mini}
        restrict={BAR_RESTRICT}
        hideOverflow={hideOverflow || oneMenu}
      />
      {oneMenu && !hideOverflow ? <OpenOneMenuButton /> : null}
    </div>
  );
}

export default ActionBar;
