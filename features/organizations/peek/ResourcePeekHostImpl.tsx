"use client";

/**
 * ResourcePeekHost — renders the peek for a kind, lazily.
 *
 * A BESPOKE peek wins when one is registered. Otherwise any kind that is a
 * registered entity token falls back to `RegistryPeek`, which reads the entity
 * registry for the table and shows the record — so "which one is that?" has an
 * answer for every entity, not just the twenty with a hand-written component.
 * Returns null only when no id is selected, or the kind is neither.
 */

import React, { Suspense } from "react";
import { PEEK_REGISTRY } from "./registry";
import { tryGetEntityInfo } from "@/features/scopes/registry/entityRegistry";
import { RegistryPeek } from "./kinds/RegistryPeek";

export function ResourcePeekHostImpl({
  kind,
  id,
  onClose,
}: {
  kind: string;
  id: string | null;
  onClose: () => void;
}) {
  if (!id) return null;

  const Peek = PEEK_REGISTRY[kind];
  if (Peek) {
    return (
      <Suspense fallback={null}>
        <Peek id={id} open onClose={onClose} />
      </Suspense>
    );
  }

  // Generic fallback — only for a token the entity registry knows, so an
  // unregistered string can never open a dialog that queries nothing.
  if (!tryGetEntityInfo(kind)) return null;
  return <RegistryPeek token={kind} id={id} open onClose={onClose} />;
}
