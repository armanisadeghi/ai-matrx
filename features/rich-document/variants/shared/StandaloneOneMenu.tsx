"use client";

// features/rich-document/variants/shared/StandaloneOneMenu.tsx
//
// THE ONE MENU for a bar that has no enclosing right-click menu (a note's
// preview, every `RichDocumentActions` host). Its ⋯ sits inside a context-
// menu shell built from the same context, so tapping it opens the SAME engine
// right-click opens — clipboard verbs, agents, Quick Actions, page rows and the
// rich-document registry — as the desktop menu or the phone's sheet (ALC-15
// verifier finding 1). Never a second, poorer menu of the registry alone.

import * as React from "react";
import type { ClickTarget } from "@ai-matrx/alchemy/actions";
import { RegistryContextMenu } from "../../RegistryContextMenu";
import { OpenOneMenuButton } from "./OpenOneMenuButton";
import type { RichDocumentAction, RichDocumentActionContext } from "../../types";

export function StandaloneOneMenu({
  getCtx,
  target,
  className,
}: {
  getCtx: () => RichDocumentActionContext;
  target: ClickTarget;
  className?: string;
}): React.ReactElement {
  const ctx = getCtx();
  const host = target.host as { extra?: readonly RichDocumentAction[] } | undefined;
  return (
    <RegistryContextMenu
      content={ctx.content}
      source={ctx.source}
      actions={{
        exclude: [...target.excludedActionIds],
        extra: [...(host?.extra ?? [])],
        ...(ctx.callbacks ? { callbacks: ctx.callbacks } : {}),
        ...(ctx.extensions ? { extensions: ctx.extensions } : {}),
        metadata: ctx.metadata,
        isCreator: ctx.isCreator,
        surfaceKey: ctx.surfaceKey,
      }}
    >
      <span className="inline-flex">
        <OpenOneMenuButton source={ctx.source} className={className} />
      </span>
    </RegistryContextMenu>
  );
}
