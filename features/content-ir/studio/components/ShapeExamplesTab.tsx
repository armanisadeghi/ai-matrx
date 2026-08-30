"use client";

/**
 * Examples tab — author and curate this shape's `kind_example` rows.
 *
 * Was admin-only. Same component the registry page mounts; the studio simply
 * did not expose it, so a user could not see or curate their own shape's
 * examples anywhere (Arman, 2026-08-29: one set of tabs for everyone,
 * permissions the only difference).
 *
 * The permission difference, and the ONLY one: authoring is owner-gated,
 * because the writes are. A non-owner is told where to read them rather than
 * being handed buttons the database will refuse — a dead end is not a
 * permission model.
 */

import { useState } from "react";
import Link from "next/link";
import { Eye } from "lucide-react";
import KindExampleManager from "@/features/content-ir/studio/components/KindExampleManager";
import { useKindExamples } from "@/features/content-ir/studio/kind-examples";
import { shapeDetailHref } from "@/features/content-ir/studio/constants";
import type { Json } from "@/types/database.types";

interface ShapeExamplesTabProps {
  kind: string;
  kindDefinitionId: string;
  emittedJsonSchema: Json | null;
  isOwnedByViewer: boolean;
}

export default function ShapeExamplesTab({
  kind,
  kindDefinitionId,
  emittedJsonSchema,
  isOwnedByViewer,
}: ShapeExamplesTabProps) {
  const [revision, setRevision] = useState(0);
  const examples = useKindExamples(kindDefinitionId, revision);

  if (!isOwnedByViewer) {
    return (
      <div className="mx-auto max-w-4xl rounded-md border border-border bg-card px-4 py-8 text-center">
        <p className="text-sm font-medium text-foreground">
          Only this shape&apos;s owner can change its examples.
        </p>
        <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
          {examples.status === "ready"
            ? `It has ${examples.rows.length} saved example${examples.rows.length === 1 ? "" : "s"}. Preview renders each of them through every real path.`
            : "Preview renders each saved example through every real path."}
        </p>
        <Link
          href={shapeDetailHref(kind)}
          className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          <Eye className="h-3.5 w-3.5" />
          Open Preview
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl">
      <KindExampleManager
        kindDefinitionId={kindDefinitionId}
        emittedJsonSchema={emittedJsonSchema}
        examples={examples}
        onExamplesChanged={() => setRevision((r) => r + 1)}
        authMode="owner"
      />
    </div>
  );
}
