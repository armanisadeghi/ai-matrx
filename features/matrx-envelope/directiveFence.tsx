"use client";

/**
 * Where a ```matrx fence is rendering: is its message still streaming, and in
 * which conversation. `MatrxEnvelopeBlock` knows both; a registered directive
 * renderer is handed only the decoded shell, so the host passes the rest down
 * here. Absent (a person's own content) = not streaming, no conversation.
 */

import { createContext, useContext } from "react";

export interface DirectiveFence {
  streaming: boolean;
  conversationId: string | null;
}

const DirectiveFenceContext = createContext<DirectiveFence>({ streaming: false, conversationId: null });

export const DirectiveFenceProvider = DirectiveFenceContext.Provider;

export function useDirectiveFence(): DirectiveFence {
  return useContext(DirectiveFenceContext);
}
