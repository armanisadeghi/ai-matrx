"use client";

/**
 * The Matrix binding of `KindInstanceRender` — render ONE canonical kind
 * instance through the REAL production path, never a lookalike.
 *
 * The component itself lives in `@ai-matrx/content-ir-react`: the routing
 * three-state lifecycle ("checking" is not "missing"), the eager targeted
 * resolve, the warm-then-refresh order, the unroutable fallback rule, and the
 * bare/card variants. Read the semantics there. This module supplies our host
 * (SafeBlockRenderer + StructuredValueView + the Error Inspector) and keeps the
 * historical import path stable for the ~15 surfaces that render an instance.
 */

import {
  KindInstanceRender as SharedKindInstanceRender,
  kindIsRoutable as kindIsRoutableShared,
  isRecordValue as isRecordValueShared,
  type KindInstanceRenderProps,
} from "@ai-matrx/content-ir-react";
import { correctKindValue } from "@/features/content-ir/registry/kind-correctors";
import { KindCorrectionsNotice } from "@/features/content-ir/react/db-component/KindCorrectionsNotice";
import {
  ContentIrHostBoundary,
  matrxContentIrHost,
} from "@/features/content-ir/host/ContentIrHostBoundary";

export const isRecordValue = isRecordValueShared;

/**
 * True when `applyIrKindRoute` has a registered render path for this kind — a
 * compiled legacy bridge OR any ACTIVE resolver row (including db-sourced user
 * components, which route to `db_kind_component`).
 */
export function kindIsRoutable(kind: string): boolean {
  return kindIsRoutableShared(kind, matrxContentIrHost);
}

/**
 * Every stored-instance render (kind-instance loads, the shape preview's "direct" path, the
 * ~15 surfaces above) passes here, and the shared component builds its envelope inside the
 * package where the host cannot reach — so the value is corrected HERE, before it goes in
 * (kind-correctors.ts), and what changed is shown above it.
 */
export default function KindInstanceRender(props: KindInstanceRenderProps) {
  const { value, corrections } = correctKindValue(props.kind, props.value);
  return (
    <ContentIrHostBoundary>
      <KindCorrectionsNotice corrections={corrections} />
      <SharedKindInstanceRender {...props} value={value as KindInstanceRenderProps["value"]} />
    </ContentIrHostBoundary>
  );
}
