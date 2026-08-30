"use client";

// features/agents/mandates/authoring/OutputKindPicker.tsx
//
// Pick the mandate's output kind from the platform kind registry (the same
// catalog the registry admin lists). Kinds are platform-governed vocabulary —
// the picker says so and points at the registry rather than pretending to
// create kinds inline (CreatablePicker's P11 lane).

import { useEffect, useState } from "react";
import { CreatablePicker, type CreatableOption } from "@/components/ui/creatable-picker";
import {
  listAllKinds,
  listCompiledKinds,
} from "@/features/content-ir/registry/kind-catalog";

export function OutputKindPicker({
  value,
  onSelect,
  disabled,
}: {
  value: string | null;
  onSelect: (kind: string | null) => void;
  disabled?: boolean;
}) {
  const [options, setOptions] = useState<CreatableOption[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    listAllKinds()
      .then((entries) => {
        if (cancelled) return;
        setOptions(
          entries
            .filter((entry) => entry.isActive !== false && !entry.isContractArtifact)
            .map((entry) => ({
              value: entry.kind,
              label: entry.kind,
              hint: entry.label !== entry.kind ? entry.label : undefined,
              keywords: entry.label,
            })),
        );
      })
      .catch(() => {
        if (cancelled) return;
        // Offline fallback — compiled registry only, stated by the shorter list.
        setOptions(
          listCompiledKinds().map((entry) => ({
            value: entry.kind,
            label: entry.kind,
            hint: entry.label !== entry.kind ? entry.label : undefined,
          })),
        );
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <CreatablePicker
      value={value ?? ""}
      options={[
        { value: "", label: "No kind yet", hint: "decide later" },
        ...(options ?? []),
      ]}
      onSelect={(next) => onSelect(next || null)}
      placeholder="No kind yet"
      searchPlaceholder="Search kinds…"
      noun="kind"
      disabled={disabled}
      loading={options === null}
      ariaLabel="Output kind"
      lockedNote="Kinds are platform vocabulary — new ones are registered as Shapes."
      manageAction={{ label: "Open Shapes", href: "/shapes" }}
      triggerClassName="h-8 w-64 font-mono text-[12px]"
    />
  );
}
