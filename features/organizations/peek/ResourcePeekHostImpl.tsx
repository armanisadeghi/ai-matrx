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
import { PeekHrefOverrideProvider } from "./peekHrefOverride";

export function ResourcePeekHostImpl({
  kind,
  id,
  onClose,
  href,
}: {
  kind: string;
  id: string | null;
  onClose: () => void;
  /**
   * The destination the CALLER resolved for this record, when a token alone
   * cannot name it (see `peekHrefOverride`). Passed down by context so the
   * dialog's "Open" cannot disagree with the control that opened it. Omit to
   * let the peek resolve from its token.
   */
  href?: string | null;
}) {
  if (!id) return null;

  const Peek = PEEK_REGISTRY[kind];
  const body = Peek ? (
    <Suspense fallback={null}>
      <Peek id={id} open onClose={onClose} />
    </Suspense>
  ) : // Generic fallback — only for a token the entity registry knows, so an
  // unregistered string can never open a dialog that queries nothing.
  tryGetEntityInfo(kind) ? (
    <RegistryPeek token={kind} id={id} open onClose={onClose} />
  ) : null;

  if (!body) return null;
  return (
    <PeekHrefOverrideProvider href={href}>{body}</PeekHrefOverrideProvider>
  );
}
