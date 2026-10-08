"use client";

// The catalog's `renderModelRef` port → this app's canonical model door.
//
// @ai-matrx/agents >= 0.40 passes the agent's class pin when the list read
// carries it: a uuid, null (no pin — the preferred class runs) or absent
// (unknown — the model is named alone, never a guessed class). A multi-class
// model then reads "Qwen3.8 27B · Matrx Lightning" on every catalog card.

import type { ReactNode } from "react";
import { AiModelRef } from "@ai-matrx/chat/agents/components/identity-refs/AiIdentityRef";

export function renderCatalogModelRef(args: {
  modelId: string;
  className?: string;
}): ReactNode {
  const { offeringId } = args as { offeringId?: string | null };
  return (
    <AiModelRef
      modelId={args.modelId}
      className={args.className}
      showClass={offeringId !== undefined}
      offeringId={offeringId ?? null}
    />
  );
}
