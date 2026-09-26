"use client";

// features/rich-document/variants/MenuVariant.tsx
//
// "menu" / "icon-only" variant — a single ⋯ that opens THE ONE context-menu
// engine (desktop dropdown / phone sheet are its layouts; ALC-15).

import * as React from "react";
import type { ClickTarget } from "@ai-matrx/alchemy/actions";
import { useAlchemyActions } from "@ai-matrx/alchemy/react/host";
import { ensureRichDocumentProvider } from "../actions/provider";
import { cn } from "@/lib/utils";
import { OpenOneMenuButton, useOneMenuFor } from "./shared/OpenOneMenuButton";
import { StandaloneOneMenu } from "./shared/StandaloneOneMenu";
import type { RichDocumentActionContext } from "../types";

export interface MenuVariantProps {
  getCtx: () => RichDocumentActionContext;
  target: ClickTarget;
  className?: string;
}

/**
 * "menu" / "icon-only" — a single ⋯ that opens THE ONE context-menu engine:
 * the enclosing right-click menu for this content, else a shell of the same
 * content. Desktop dropdown and phone sheet are that engine's layouts.
 */
export function MenuVariant(props: MenuVariantProps): React.ReactElement {
  const { getCtx, target, className } = props;
  ensureRichDocumentProvider(useAlchemyActions().registry);
  const oneMenu = useOneMenuFor(getCtx().source);
  return (
    <div className={cn("inline-flex items-center", className)}>
      {oneMenu ? <OpenOneMenuButton source={getCtx().source} /> : <StandaloneOneMenu getCtx={getCtx} target={target} />}
    </div>
  );
}

export default MenuVariant;
