"use client";

import { Loader2 } from "lucide-react";
import { SettingsRow } from "../SettingsRow";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useModels } from "@/features/ai-models/hooks/useModels";
import {
  selectPlatformDefaultImageModelName,
  selectPlatformDefaultTextModelName,
  type DefaultableModality,
} from "@/features/ai-models/redux/platformDefaultModel";
import { useSelector } from "react-redux";
import type { RootState } from "@/lib/redux/store";
import type { SettingsCommonProps } from "../types";

type Scope = "all" | "active" | "inactive";

// Radix Select items cannot carry an empty value — this internal sentinel
// maps to `null` ("platform default") at the prop boundary and never leaks.
const PLATFORM_DEFAULT_VALUE = "__platform_default__";

export type SettingsModelPickerProps = SettingsCommonProps & {
  /** Selected model id; null = platform default (catalog-resolved). */
  value: string | null;
  onValueChange: (value: string | null) => void;
  /**
   * Which subset of models to show.
   * - "active": only models the user has marked active (default)
   * - "inactive": only inactive models
   * - "all": every model
   */
  scope?: Scope;
  /**
   * Render a "Platform default" option (maps to null). The label names the
   * catalog-resolved default when the registry knows it. Pass the modality
   * the surface generates (default "text").
   */
  allowPlatformDefault?: boolean;
  defaultModality?: DefaultableModality;
  placeholder?: string;
  last?: boolean;
};

/**
 * Shared model-selection row. Wraps the AI-models registry so every settings
 * surface renders model pickers identically (no divergence across tabs).
 */
export function SettingsModelPicker({
  value,
  onValueChange,
  scope = "active",
  allowPlatformDefault = false,
  defaultModality = "text",
  placeholder,
  last,
  ...rowProps
}: SettingsModelPickerProps) {
  const id =
    rowProps.id ??
    `settings-${rowProps.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  const { models, isLoading } = useModels();
  const activeIds = useSelector(
    (state: RootState) => state.userPreferences.aiModels.activeModels,
  );
  // Catalog-resolved platform default (is_primary), for the null-option label.
  const platformDefaultName = useSelector(
    defaultModality === "image"
      ? selectPlatformDefaultImageModelName
      : selectPlatformDefaultTextModelName,
  );
  const activeSet = new Set(activeIds);

  const filtered = models.filter((m) => {
    if (scope === "active") return activeSet.has(m.id);
    if (scope === "inactive") return !activeSet.has(m.id);
    return true;
  });

  const platformDefaultLabel = platformDefaultName
    ? `Platform default (${platformDefaultName})`
    : "Platform default";

  return (
    <SettingsRow {...rowProps} id={id} variant="inline" last={last}>
      {isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      ) : filtered.length === 0 && !allowPlatformDefault ? (
        <span className="text-xs text-amber-500">
          No {scope === "active" ? "active" : ""} models
        </span>
      ) : (
        <Select
          value={value ?? (allowPlatformDefault ? PLATFORM_DEFAULT_VALUE : "")}
          onValueChange={(next) =>
            onValueChange(next === PLATFORM_DEFAULT_VALUE ? null : next)
          }
          disabled={rowProps.disabled}
        >
          <SelectTrigger id={id} size="default" className="w-56">
            <SelectValue placeholder={placeholder ?? "Choose a model"} />
          </SelectTrigger>
          <SelectContent>
            {allowPlatformDefault ? (
              <>
                <SelectItem value={PLATFORM_DEFAULT_VALUE}>
                  {platformDefaultLabel}
                </SelectItem>
                {filtered.length > 0 ? <SelectSeparator /> : null}
              </>
            ) : null}
            {filtered.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.common_name || m.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </SettingsRow>
  );
}
