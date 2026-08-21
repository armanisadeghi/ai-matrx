"use client";

// features/education/trust/components/SeeSourceButton.tsx
//
// The card-level "See source" door (FastFire spec 26e): one tap opens the
// canonical RAG Source Inspector at the exact cited page with the matched
// chunk highlighted. A thin wrapper over the ONE opener (`useOpenCitation`) —
// never a second inspector path. Renders nothing when the ref can't open a
// real source view, so mounting it unconditionally is safe.

import { FileSearch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useOpenCitation } from "@/features/rag/components/source-inspector/useOpenCitation";
import {
  inspectorArgsForSourceRef,
  type CardSourceRef,
} from "../sourceRef";

export function SeeSourceButton({
  source,
  className,
  label = "See source",
}: {
  source: CardSourceRef | null | undefined;
  className?: string;
  /** Override the button text (e.g. null-ish short surfaces pass "Source"). */
  label?: string;
}) {
  const openCitation = useOpenCitation();
  const args = inspectorArgsForSourceRef(source);
  if (!args) return null;
  return (
    <Button
      variant="ghost"
      size="sm"
      className={className ?? "gap-1.5 text-muted-foreground"}
      onClick={() => openCitation(args)}
      title="Open the exact cited passage in the source"
    >
      <FileSearch className="h-4 w-4" />
      {label}
    </Button>
  );
}
