"use client";

/**
 * Template tab — the wire shape an agent emits for this kind.
 *
 * It used to sit inside Preview, where it made no sense (Arman, 2026-08-29:
 * "there's no reason for the template to be listed under preview because that
 * doesn't make any sense"). It is not a preview of anything; it is text to
 * paste into a prompt or a chat.
 */

import KindEmitTemplate from "@/features/content-ir/render-paths/KindEmitTemplate";
import { useKindExamples } from "@/features/content-ir/studio/kind-examples";

interface ShapeTemplateTabProps {
  kind: string;
  kindDefinitionId: string;
}

export default function ShapeTemplateTab({
  kind,
  kindDefinitionId,
}: ShapeTemplateTabProps) {
  const examples = useKindExamples(kindDefinitionId, 0);
  const canonical =
    examples.status === "ready"
      ? (examples.rows.find((r) => r.isCanonical) ?? examples.rows[0])
      : undefined;

  if (!canonical) {
    return (
      <div className="mx-auto max-w-4xl rounded-md border border-border bg-card px-4 py-8 text-center">
        <p className="text-sm font-medium text-foreground">
          No saved example yet.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          The emit template is built from a real sample, never invented.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl">
      <KindEmitTemplate kind={kind} value={canonical.data} />
    </div>
  );
}
