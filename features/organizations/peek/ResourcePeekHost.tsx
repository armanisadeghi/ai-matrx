"use client";

/**
 * ResourcePeekHost — renders the registered peek for a kind, lazily.
 * Returns null when the kind has no peek or no id is selected.
 */

import React, { Suspense } from "react";
import { PEEK_REGISTRY } from "./registry";

export function ResourcePeekHost({
  kind,
  id,
  onClose,
}: {
  kind: string;
  id: string | null;
  onClose: () => void;
}) {
  const Peek = PEEK_REGISTRY[kind];
  if (!Peek || !id) return null;
  return (
    <Suspense fallback={null}>
      <Peek id={id} open={Boolean(id)} onClose={onClose} />
    </Suspense>
  );
}
