"use client";

// features/rich-document/actions/useRichDocumentProvider.ts
//
// The ONE way a React host puts the rich-document provider into the app's
// action registry. Registering notifies every registry subscriber (the
// selection toolbar's and every open menu's engine bump their state), so it
// must never run during render — that was React's "Cannot update a component
// (SelectionToolbar) while rendering a different component
// (AlchemyMenuContent)" on the first right-click over a selection. A layout
// effect runs after commit but before the children's passive effects, so the
// menu engine's first resolve already sees the provider.

import * as React from "react";
import { useAlchemyActions } from "@ai-matrx/alchemy/react/host";
import { ensureRichDocumentProvider } from "./provider";

export function useRichDocumentProvider(): void {
  const { registry } = useAlchemyActions();
  React.useLayoutEffect(() => {
    ensureRichDocumentProvider(registry);
  }, [registry]);
}
