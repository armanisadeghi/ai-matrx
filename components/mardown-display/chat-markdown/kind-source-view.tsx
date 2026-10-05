"use client";

/**
 * The SOURCE VIEW context — a subtree that shows what the author wrote (a
 * ```xml fence's card, ruling (a)): a kind-looking region there is code being
 * shown and stays as written. Its own module so the leaves that honour it
 * (`KindTextGate`, `StandardBlock`, `InlineCodeSnippet`) read it without
 * importing the pipeline.
 */

import React, { createContext, useContext } from "react";

const KindSourceViewContext = createContext(false);

/** Declares a subtree a source view — kind regions in it stay as written. */
export function KindSourceView({ children }: { children: React.ReactNode }) {
  return (
    <KindSourceViewContext.Provider value>{children}</KindSourceViewContext.Provider>
  );
}

/** Whether this subtree is a source view (see `KindSourceView`). */
export function useKindSourceView(): boolean {
  return useContext(KindSourceViewContext);
}
