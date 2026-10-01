"use client";

// features/education/trust/components/SeeSourceButton.tsx
//
// The card-level "See source" door (FastFire spec 26e): one tap opens the
// canonical RAG Source Inspector at the exact cited page with the matched
// chunk highlighted (a recording: its Source page, playing from the cited
// time). A thin wrapper over the ONE place opener (`useCitationPlace`) —
// never a second inspector path. Renders nothing when the ref can't open a
// real source view, so mounting it unconditionally is safe.

import { FileSearch } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CardSourceRef } from "../sourceRef";
import { useCitationPlace } from "../useCitationPlace";

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
  // The same opener as the citation chips: a recording plays from the cited
  // time on its Source page; anything else opens the inspector at the passage.
  const { open } = useCitationPlace(source);
  if (!open) return null;
  return (
    <Button
      variant="ghost"
      size="sm"
      className={className ?? "gap-1.5 text-muted-foreground"}
      onClick={open}
      title="Open the exact cited passage in the source"
    >
      <FileSearch className="h-4 w-4" />
      {label}
    </Button>
  );
}
