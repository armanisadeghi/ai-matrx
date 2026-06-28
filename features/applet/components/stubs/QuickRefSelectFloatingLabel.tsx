"use client";

import { Button } from "@/components/ui/button";

interface QuickRefSelectProps {
  entityKey: string;
  onSelect: (recordKey: string) => void;
  customSelectText?: string;
  disabled?: boolean;
  initialSelectedRecordKey?: string | null;
}

/** Stub — entity quick-reference picker removed with the entities decommission. */
export default function QuickRefSelectFloatingLabel({
  customSelectText = "Select",
  disabled = true,
}: QuickRefSelectProps) {
  return (
    <Button
      type="button"
      variant="outline"
      disabled={disabled}
      title="Quick reference picker unavailable (entity system removed)"
    >
      {customSelectText} (unavailable)
    </Button>
  );
}
